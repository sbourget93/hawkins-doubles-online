# UDisc scrape & load

One-off import of the Hawkins Random Doubles league history from UDisc into this
app's event-sourced backend. Scrapes every past league event's leaderboard from
UDisc, resolves each player to their UDisc account, and posts the reconstructed
history (players, league events, cards, teams, registrations) to `POST /commands`.

**Loaded to dev and production on 2026-07-12.** 68 league events
(2023-03-29 → 2026-07-08), 190 players, 613 teams, 1,187 registrations.

Source: <https://udisc.com/leagues/hawkins-random-doubles-nC3Rvk/schedule>

---

## Pipeline

Run from the repo root. Each script is self-contained and reads/writes `data/`
next to `scripts/` (paths are relative to this package, so it can be moved).

```
1. scripts/scrape_udisc.py         schedule -> data/raw/*.html + data/events/*.json
2. scripts/build_account_names.py  -> data/account_names.json  (edit this by hand)
3. scripts/transform_and_upload.py data/* -> POST /commands
```

### 1. `scrape_udisc.py`
Walks the schedule pagination (`?page=N`) collecting every event slug, then fetches
each event's leaderboard and writes:
- `data/raw/<slug>.html` — the full page (kept for re-parsing; the source of truth)
- `data/events/<slug>.json` — parsed: date, title, and teams (position, placement,
  adjustment, net total, players with `username`/`user_id`)
- `data/events_index.json` — one summary row per event

`--reparse` rebuilds the JSON from saved HTML without re-fetching.

Notable parsing details (all learned the hard way — see "Data notes"):
- **Two slug schemes.** 2024+ events are `hawkins-random-doubles-*`; the 2023 season
  is `random-doubles-*` (e.g. `random-dubz`, `glow-doubles`). The slug regex matches
  both, else pagination stops early and 2023 is silently dropped.
- **Header-based columns.** 2024+ leaderboards are `Pos, Name, Adj, Tot, holes…`;
  2023 drops the Adj column (`Pos, Name, Tot, Thru, …`). Columns are located by
  header name, not fixed index, so 2023 totals aren't misread as zero.
- **DNF / duplicate rows excluded.** Unranked rows (empty Pos — DNF teams or
  superseded "Entry #N" scorecards) are skipped, matching UDisc's official board.

### `udisc_stream.py` (shared)
Decodes the React Router "turbo-stream" embedded in each page (a flat,
deduplicated array; `{"_1": 2}` means `{arr[1]: arr[2]}`) to recover every
registrant's UDisc account: on-scorecard `name`, `username`, stable
`registrantUserId`, and the `teamRegistrantId` that groups teammates.
`attach_usernames()` maps each leaderboard team to its stream team by player-name
set, so the **same display name used by two different accounts in one event**
(e.g. two "John"s = John Bourget + John Sorel) is told apart. Every player in this
league's data has an account (100% coverage), so this is the authoritative
identity used for dedup.

### 2. `build_account_names.py`
Groups all events by UDisc account (`user_id`) and writes `data/account_names.json`:
one row per account with the display names it used and a chosen real `name`.
Accounts that ever used a clean full name are auto-filled (trusted); the rest are
flagged `needs_review` (the `username` handle is usually the giveaway, e.g.
`@dmmiller612` → Derek Miller). **`account_names.json` is then edited by hand** to
fill blanks and fix seeds. This is the only file that needs human input.

### 3. `transform_and_upload.py`
Builds the command-event stream and (optionally) posts it.
- Player identity = UDisc account (`user_id`); display name from
  `account_names.json`. Deterministic `uuid5` ids → **idempotent** re-runs.
- `--dry-run` writes `data/commands_preview.json` + stats; `--post <base_url>`
  sends it (chunked at 1000 events to stay under nginx's ~1 MB body cap).
- `/commands` is admin-only, so pass a browser `session` cookie via `--cookie`
  (or `COMMAND_SESSION_COOKIE`). It verifies the session is admin via `/auth/me`
  before sending, and reads the current version so it works on a non-empty DB.

### helpers
- `extract_usernames.py` — reports usernames that map to more than one display
  name (how the dedup corrections were discovered). Not part of the load path.
- `build_player_mapping.py` — **deprecated.** The original name-based dedup
  approach (`data/player_mapping.json`), superseded by account identity. Kept for
  history only; not used by the load.

---

## Import decisions (baked into `transform_and_upload.py`)

| Field | Rule |
| ----- | ---- |
| Scope | Events with results and date ≤ today. 68 of 81 (7 upcoming, 4 with no scores/canceled, are skipped). |
| Player identity | UDisc account (`user_id`) — collapses every nickname/spelling to one player. |
| Player name | From `account_names.json`, first letter of each token upper-cased. `UDisc <username>` placeholder (last name kept in exact case) where the real name is unknown. |
| `default_pool` / `is_woman` | Everyone `B` / not-woman (UDisc has neither; edit in-app). |
| Team `handicap` | UDisc "Adj" column. 2023 has no Adj column → 0. |
| Team `score` | UDisc net total (relative to par, e.g. -12). |
| Team `placement` | UDisc position (ties preserved). |
| `payout_amount` | Left blank (UDisc has none). |
| Registration `is_paid` | All `true`. |
| Cards | One synthetic card per event (starting hole 1) — a container only; the completed view renders teams as a flat score-ranked list. |
| League title | Forced to **"Hawkins Dubs"** for every event. |
| State | Every imported event is `completed`. |

---

## Re-running

```bash
# from repo root
python3 udisc_scrape_and_load/scripts/scrape_udisc.py            # or --reparse
python3 udisc_scrape_and_load/scripts/build_account_names.py     # then edit data/account_names.json
python3 udisc_scrape_and_load/scripts/transform_and_upload.py --dry-run

# load (dev, then prod). Sign in to the app, copy the `session` cookie from
# DevTools -> Application -> Cookies, and:
python3 udisc_scrape_and_load/scripts/transform_and_upload.py \
    --post http://localhost/api --cookie <dev-session>
python3 udisc_scrape_and_load/scripts/transform_and_upload.py \
    --post https://hawkinsdubs.stephengb.com/api --cookie <prod-session>
```

Re-running is safe: ids are deterministic and the backend dedups by `event_id`, so
a second load against the same DB is a no-op. To start clean in **dev**, stop the
backend, delete `backend/hawkins.db*`, restart (no S3 in dev, so it comes up empty)
— do **not** do this in prod, whose event log is the source of truth.

---

## Data notes / gotchas

- **2023 had no handicap column** — those teams import with handicap 0. The stored
  score is the net total UDisc used for placement, so results are still accurate.
- **DNF:** exactly 4 DNF team-rows existed, all in 2023; all excluded. One player
  (Kurt Whisler) appeared only in a DNF row and so isn't imported.
- **Prod title edit:** after the load, the 2023-11-29 event was renamed in-app from
  "Hawkins Dubs" → "Glow Dubs" (it was a glow-doubles night). That's a manual
  `LeagueEventEdited`, not from these scripts.
- `data/player_mapping.json` and `build_player_mapping.py` are the retired
  name-based approach; ignore them unless studying the history.

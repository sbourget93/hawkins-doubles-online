# UDisc league history (scraped)

Historical results for the **Hawkins Random Doubles** UDisc league, scraped from
<https://udisc.com/leagues/hawkins-random-doubles-nC3Rvk/schedule>.

- **68 events**, 2023-03-29 → 2026-07-08 (every *finished* round with recorded
  results; one empty 2024-08-21 event with no scores is omitted).
- Data is read-only history for offline analysis. It is **not** wired into the app.

## Files

Normalized (relational, mirrors the app's model — join on the ids):

| File | Rows | Fields |
|------|------|--------|
| `players.json` | 191 | `player_id`, `name`, `userId`, `pdga` |
| `events.json` | 68 | `event_id`, `date`, `title`, `course`, `layout`, `teamCount` |
| `teams.json` | 617 | `team_id`, `event_id`, `placement`, `tie`, `score`, `startHole` |
| `registrations.json` | 1195 | `event_id`, `team_id`, `player_id` |

Plus `rounds/<date>_<event_id>.json` — one self-contained file per event with its
full leaderboard (teams, partners, placement, score).

## Conventions

- **`player_id`** is `u:<udiscUserId>` for registered players (all 191 here). This is
  stable across name-spelling variants, so one person = one id even though UDisc
  display names vary (e.g. "Jaime Oller" vs "Jamie oller"). Guests without an
  account would be keyed `g:<name>` (none in this dataset).
- **`placement`** is event-wide competition ranking (1 = best), tie-aware
  (`1, 2, 2, 2, 5, …`); `tie` flags shared positions. DNF/unscored teams have
  `placement: null`.
- **`score`** is total strokes relative to par (negative = under par).
- **`startHole`** is a 0-based starting hole index (shotgun start).

## Refreshing

Requires only Python 3 (stdlib). From this directory:

```sh
python3 scrape.py enumerate        # rebuild events_index.json (all events)
python3 scrape.py scrape .         # re-scrape all finished events into JSON
python3 scrape.py fetchone <sid>   # print one event's essentials (debug)
```

`scrape.py` decodes UDisc's React Router single-fetch (`.data`) payloads: it walks
the paginated `?page=N` schedule to enumerate events, follows the per-event round
redirects, and resolves the reference-encoded serialization (negative codes are
undefined/null sentinels). Requests are throttled ~0.3s apart.

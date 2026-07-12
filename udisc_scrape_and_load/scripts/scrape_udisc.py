#!/usr/bin/env python3
"""Scrape past Hawkins Random Doubles league events from UDisc into data/.

UDisc renders the league schedule and each event leaderboard server-side (React
Router). We fetch the raw HTML and pull two things out of each event page:

  * the rendered leaderboard table (position, team players, adjustment, total),
  * the serialized React Router data stream, which carries the event date/title.

Player names come straight from the rendered leaderboard. UDisc does not link
these names to player profiles in the leaderboard markup, so there is no reliable
per-player id to key on; deduping the same person across events (and reconciling
first-name-only / nickname entries in the older events) is left to the transform
step, keyed on the displayed name.

Outputs (all under data/):
  raw/<slug>.html        the full event page, kept for fidelity / re-parsing
  events/<slug>.json     the parsed event
  events_index.json      one summary row per event

Run `python3 scripts/scrape_udisc.py` to fetch everything, or
`python3 scripts/scrape_udisc.py --reparse` to rebuild the JSON from saved HTML.
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.request
from pathlib import Path

from udisc_stream import attach_usernames

LEAGUE_SLUG = "hawkins-random-doubles-nC3Rvk"
SCHEDULE_URL = f"https://udisc.com/leagues/{LEAGUE_SLUG}/schedule"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
RAW_DIR = DATA_DIR / "raw"
EVENTS_DIR = DATA_DIR / "events"

REQUEST_DELAY_S = 0.75  # be polite between requests


def fetch(url: str, attempts: int = 3) -> str:
    last_err: Exception | None = None
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except Exception as exc:  # noqa: BLE001 - retry any transient failure
            last_err = exc
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"failed to fetch {url}: {last_err}")


# --------------------------------------------------------------------------
# Schedule pagination -> ordered list of event slugs
# --------------------------------------------------------------------------
def collect_event_slugs() -> list[str]:
    """Walk ?page=1,2,... collecting event slugs until a page adds nothing new."""
    slugs: list[str] = []
    seen: set[str] = set()
    page = 1
    while True:
        html = fetch(f"{SCHEDULE_URL}?page={page}")
        # Match every event slug on the schedule, not just the current naming
        # scheme: older seasons use a different prefix (`random-doubles-*`,
        # `random-dubz`, `glow-doubles`, ...) and were missed by a narrow regex.
        found = [s for s in re.findall(r"/events/([A-Za-z0-9][A-Za-z0-9-]+)", html) if s != "add"]
        new = [s for s in dict.fromkeys(found) if s not in seen]
        if not new:
            break
        for s in new:
            seen.add(s)
            slugs.append(s)
        print(f"  schedule page {page}: +{len(new)} events (total {len(slugs)})")
        page += 1
        time.sleep(REQUEST_DELAY_S)
        if page > 20:  # safety valve; ~90 events is ~5 pages
            print("  stopping: hit page cap", file=sys.stderr)
            break
    return slugs


# --------------------------------------------------------------------------
# Per-event parsing
# --------------------------------------------------------------------------
def parse_position(text: str) -> tuple[int | None, bool]:
    """'1' -> (1, False); 'T2' -> (2, True); '-'/'' -> (None, False)."""
    text = text.strip()
    tied = text.startswith("T")
    digits = re.sub(r"[^0-9]", "", text)
    return (int(digits) if digits else None), tied


def parse_signed(text: str) -> int:
    """UDisc score/adjustment cell -> int. '-' or 'E' -> 0, '-2' -> -2, '+3' -> 3."""
    text = text.strip()
    if text in ("-", "", "E"):
        return 0
    text = text.replace("+", "")
    try:
        return int(text)
    except ValueError:
        return 0


def parse_event(slug: str, html: str) -> dict:
    date_m = re.search(r'startDate\\",\\"(\d{4}-\d{2}-\d{2})', html)
    # The event title is the first serialized `name` value (e.g. "Hawkins Random
    # Doubles" or, in older seasons, "Random Doubles - Random Dubz").
    title_m = re.search(r'\\"name\\",\\"([^"\\]{2,60})\\"', html)
    date = date_m.group(1) if date_m else None
    title = re.sub(r"\s+", " ", title_m.group(1)).strip() if title_m else "Hawkins Random Doubles"

    def cell_text(td: str) -> str:
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", td)).strip()

    # Column layout varies by season, so locate Adj/Tot by header name rather than
    # a fixed index: 2024+ is [Pos, Name, Adj, Tot, holes...]; 2023 drops Adj and is
    # [Pos, Name, Tot, Thru, holes...]. Older events with no Adj column have no
    # handicap recorded (the displayed Tot is already the value placements use).
    headers = [cell_text(t) for t in re.findall(r"<th\b.*?</th>", html, flags=re.S)]
    adj_idx = next((i for i, h in enumerate(headers) if h.lower().startswith("adj")), None)
    tot_idx = next((i for i, h in enumerate(headers) if "tot" in h.lower()), 3 if adj_idx == 2 else 2)

    rows = re.findall(r"<tr\b.*?</tr>", html, flags=re.S)
    team_rows = [r for r in rows if "text-wrap text-start" in r]

    teams = []
    for r in team_rows:
        tds = re.findall(r"<td\b.*?</td>", r, flags=re.S)
        position = cell_text(tds[0])
        # Rows without a Pos are unranked DNF teams or superseded duplicate
        # scorecards ("Entry #N"); they carry no valid score, so skip them (this
        # matches UDisc's official ranked leaderboard).
        if not position:
            continue

        names = re.findall(r'text-wrap text-start">([^<]+)</span>', tds[1])
        players = [{"name": n.strip(), "username": None, "user_id": None} for n in names]
        placement, tied = parse_position(position)
        teams.append(
            {
                "position": position,
                "placement": placement,
                "tied": tied,
                "adjustment": parse_signed(cell_text(tds[adj_idx])) if adj_idx is not None else 0,
                "total": parse_signed(cell_text(tds[tot_idx])),
                "players": players,
            }
        )

    # Link each player to their UDisc account (username / stable user_id) via the
    # serialized data stream; this is the authoritative identity used for dedup.
    attach_usernames(html, teams)

    return {
        "slug": slug,
        "url": f"https://udisc.com/events/{slug}/leaderboard?round=1&view=scores",
        "date": date,
        "title": title,
        "num_teams": len(teams),
        "teams": teams,
    }


def write_event(slug: str, html: str) -> dict:
    event = parse_event(slug, html)
    (EVENTS_DIR / f"{slug}.json").write_text(
        json.dumps(event, indent=2), encoding="utf-8"
    )
    return event


def write_index(events: list[dict]) -> None:
    index = [
        {
            "slug": e["slug"],
            "date": e["date"],
            "title": e["title"],
            "num_teams": e["num_teams"],
        }
        for e in events
    ]
    index.sort(key=lambda e: (e["date"] or ""))
    (DATA_DIR / "events_index.json").write_text(
        json.dumps(index, indent=2), encoding="utf-8"
    )


# --------------------------------------------------------------------------
def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    EVENTS_DIR.mkdir(parents=True, exist_ok=True)
    reparse = "--reparse" in sys.argv[1:]

    if reparse:
        raw_files = sorted(RAW_DIR.glob("*.html"))
        print(f"Reparsing {len(raw_files)} saved event pages...")
        events = []
        for f in raw_files:
            slug = f.stem
            events.append(write_event(slug, f.read_text(encoding="utf-8")))
    else:
        print("Collecting event slugs from schedule...")
        slugs = collect_event_slugs()
        print(f"Found {len(slugs)} events.\n")
        events = []
        for i, slug in enumerate(slugs, 1):
            url = f"https://udisc.com/events/{slug}/leaderboard?round=1&view=scores"
            html = fetch(url)
            (RAW_DIR / f"{slug}.html").write_text(html, encoding="utf-8")
            event = write_event(slug, html)
            events.append(event)
            flag = "" if event["num_teams"] and event["date"] else "  <-- CHECK"
            print(
                f"[{i:>3}/{len(slugs)}] {event['date']}  "
                f"teams={event['num_teams']:<3} {slug}{flag}"
            )
            time.sleep(REQUEST_DELAY_S)

    write_index(events)
    print(f"\nDone. {len(events)} events written to {EVENTS_DIR}")


if __name__ == "__main__":
    main()

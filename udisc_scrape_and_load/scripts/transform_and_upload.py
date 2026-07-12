#!/usr/bin/env python3
"""Turn the scraped UDisc events into command events and (optionally) POST them.

Reads data/events/*.json + data/account_names.json and emits the event-sourced
command stream that recreates each completed league event: players, the league
event (completed), one card holding its teams, each team (handicap/score/
placement), and each player's registration (paid, assigned to their team).

Player identity is the UDisc account (stable `user_id`) the scraper attached to
every player, so the same person is one player across every spelling/nickname
they used; their display name comes from data/account_names.json.

All ids are deterministic (uuid5) so re-running is idempotent: the backend dedups
by event_id and INSERT-OR-REPLACEs projections, so a second run is a no-op.

Fixed choices (per the import decisions):
  * only events with results and a date on/before TODAY are imported
  * every player: default_pool = "B", is_woman = false (edit in-app later)
  * team handicap = UDisc adjustment; score = UDisc net total; placement = UDisc
  * payouts left blank; all registrations marked paid
  * one synthetic card per event (starting hole 1) -- a container only; the
    completed view renders teams as a flat score-ranked list

The command endpoint is admin-only. When Google login is configured (dev here,
and prod), pass the browser's `session` cookie so the POST is authenticated:

  1. sign in to the app in your browser (as an ADMIN_EMAILS user)
  2. DevTools -> Application -> Cookies -> copy the value of the `session` cookie
  3. pass it via --cookie (or COMMAND_SESSION_COOKIE env var)

Usage:
  python3 scripts/transform_and_upload.py --dry-run          # preview + stats
  python3 scripts/transform_and_upload.py --post http://localhost/api --cookie <session>
"""

from __future__ import annotations

import argparse
import json
import os
import urllib.request
import uuid
from collections import Counter
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
EVENTS_DIR = DATA_DIR / "events"
ACCOUNTS_FILE = DATA_DIR / "account_names.json"
TODAY = "2026-07-12"

# Stable namespace for deterministic ids (arbitrary but fixed).
NS = uuid.UUID("6f1d1a2e-3c4b-5a6d-8e9f-0a1b2c3d4e5f")


def uid(*parts: str) -> str:
    return str(uuid.uuid5(NS, "|".join(parts)))


def format_name(name: str) -> tuple[str, str]:
    """Split a display name into (first, last), capitalizing the first letter of
    each token. Exception: a "UDisc <username>" placeholder (used when the real
    name is unknown) keeps its username last name in exact case."""
    toks = name.split()
    if toks and toks[0] == "UDisc":
        return "UDisc", " ".join(toks[1:]) or "(unknown)"
    cap = lambda t: t[:1].upper() + t[1:] if t else t
    if len(toks) == 1:
        return cap(toks[0]), "(guest)"
    return cap(toks[0]), " ".join(cap(t) for t in toks[1:])


# --------------------------------------------------------------------------
def load_importable() -> list[dict]:
    events = []
    for f in sorted(EVENTS_DIR.glob("*.json")):
        e = json.load(open(f))
        if e["num_teams"] and e["date"] and e["date"] <= TODAY:
            events.append(e)
    events.sort(key=lambda e: e["date"])
    return events


def load_accounts() -> dict[str, str]:
    """user_id -> display name. Falls back to the account's seen nickname if a real
    name hasn't been filled in yet, so the import still runs before review."""
    data = json.load(open(ACCOUNTS_FILE))["accounts"]
    names = {}
    for user_id, row in data.items():
        names[user_id] = row.get("name") or (row["seen_as"][0] if row.get("seen_as") else user_id)
    return names


# --------------------------------------------------------------------------
def build_events(events: list[dict]) -> list[dict]:
    account_name = load_accounts()

    def player_uid(p: dict) -> str:
        return p.get("user_id") or p.get("username") or p["name"]

    def when(date: str) -> str:
        return f"{date}T18:00:00Z"

    # Players: create each once, dated to their earliest appearance.
    first_seen: dict[str, str] = {}
    for e in events:
        for t in e["teams"]:
            for p in t["players"]:
                key = player_uid(p)
                if key not in first_seen or e["date"] < first_seen[key]:
                    first_seen[key] = e["date"]

    out: list[dict] = []

    def emit(etype: str, aggregate_id: str, data: dict | None, created_at: str, disc: str):
        out.append(
            {
                "event_id": uid("evt", etype, aggregate_id, disc),
                "type": etype,
                "aggregate_id": aggregate_id,
                "data": data,
                "created_at": created_at,
            }
        )

    for account_id, date in sorted(first_seen.items(), key=lambda kv: (kv[1], kv[0])):
        first, last = format_name(account_name.get(account_id, account_id))
        emit(
            "PlayerCreated",
            uid("player", account_id),
            {"first_name": first, "last_name": last, "is_woman": False, "default_pool": "B"},
            when(date),
            "create",
        )

    for e in events:
        le_id = uid("event", e["slug"])
        ts = when(e["date"])
        # Every league event uses the same title regardless of the scraped name.
        emit("LeagueEventCreated", le_id, {"date": e["date"], "title": "Hawkins Dubs"}, ts, "create")
        card_id = uid("card", e["slug"])
        emit("CardCreated", card_id, {"league_event_id": le_id, "starting_hole": 1}, ts, "create")

        for i, t in enumerate(e["teams"]):
            team_id = uid("team", e["slug"], str(i))
            emit("TeamCreated", team_id, {"card_id": card_id, "handicap": t["adjustment"]}, ts, "create")
            emit("TeamScoreChanged", team_id, {"score": t["total"]}, ts, "score")
            if t["placement"] is not None:
                emit("TeamPlacementChanged", team_id, {"placement": t["placement"]}, ts, "place")

            for j, p in enumerate(t["players"]):
                account_id = player_uid(p)
                reg_id = uid("reg", e["slug"], str(i), str(j), account_id)
                emit(
                    "RegistrationCreated",
                    reg_id,
                    {"league_event_id": le_id, "player_id": uid("player", account_id)},
                    ts,
                    "create",
                )
                emit("RegistrationPaidChanged", reg_id, {"is_paid": True}, ts, "paid")
                emit("RegistrationTeamAssigned", reg_id, {"team_id": team_id}, ts, "assign")

        # Flip to completed once everything for the event exists.
        emit("LeagueEventStateChanged", le_id, {"state": "completed"}, ts, "complete")

    return out


# --------------------------------------------------------------------------
def _get(base_url: str, path: str, cookie: str | None) -> dict:
    headers = {}
    if cookie:
        headers["Cookie"] = cookie if cookie.startswith("session=") else f"session={cookie}"
    req = urllib.request.Request(base_url.rstrip("/") + path, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def post(base_url: str, cmd_events: list[dict], cookie: str | None) -> None:
    base = base_url.rstrip("/")

    # Confirm the session is an admin before sending 4k events (clear failure early).
    me = _get(base, "/auth/me", cookie)
    user = me.get("user")
    if not user or not user.get("is_admin"):
        raise SystemExit(
            f"session is not an admin (auth/me -> {user}); sign in as an ADMIN_EMAILS "
            "user and pass that session cookie via --cookie."
        )
    print(f"authenticated as {user.get('email')} (admin)")

    # Use the server's current version so this works whether or not the DB is empty
    # (the batch is idempotent by event_id, so a re-run against a loaded DB is a no-op).
    version = _get(base, "/league-events", cookie)["version"]

    headers = {"Content-Type": "application/json"}
    if cookie:
        headers["Cookie"] = cookie if cookie.startswith("session=") else f"session={cookie}"

    # Post in ordered chunks: the whole stream is one atomic batch server-side, but
    # nginx caps the request body (~1MB), so split it. Events are globally ordered
    # (players first, then each event's objects), so sequential chunks stay valid;
    # each successful chunk advances the version we send next.
    CHUNK = 1000
    for start in range(0, len(cmd_events), CHUNK):
        batch = cmd_events[start : start + CHUNK]
        body = json.dumps({"expected_version": version, "events": batch}).encode()
        req = urllib.request.Request(base + "/commands", data=body, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=180) as resp:
            version = json.loads(resp.read().decode())["version"]
        print(f"  posted {start + len(batch):>5}/{len(cmd_events)}  (version {version})")
    print("done.")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--post", metavar="BASE_URL", help="e.g. http://localhost/api")
    ap.add_argument(
        "--cookie",
        default=os.environ.get("COMMAND_SESSION_COOKIE"),
        help="browser `session` cookie value for the admin session (or set COMMAND_SESSION_COOKIE)",
    )
    args = ap.parse_args()
    if not args.dry_run and not args.post:
        ap.error("pass --dry-run or --post <base_url>")

    events = load_importable()
    cmd_events = build_events(events)

    by_type = Counter(e["type"] for e in cmd_events)
    players = sum(1 for e in cmd_events if e["type"] == "PlayerCreated")
    print(f"importable events : {len(events)}")
    print(f"distinct players  : {players}")
    print(f"command events    : {len(cmd_events)}")
    for t, n in sorted(by_type.items()):
        print(f"  {t:26} {n}")

    preview = DATA_DIR / "commands_preview.json"
    preview.write_text(json.dumps(cmd_events, indent=2), encoding="utf-8")
    print(f"\nwrote {preview}")

    if args.post:
        post(args.post, cmd_events, args.cookie)


if __name__ == "__main__":
    main()

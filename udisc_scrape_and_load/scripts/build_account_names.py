#!/usr/bin/env python3
"""Build data/account_names.json: one row per UDisc account (the real identity).

Player identity is the UDisc account (stable `user_id`, readable `username`) that
the scraper attached to every leaderboard player. This groups all display names an
account ever used and picks a real name:

  * if the account ever appears under a clean full name -> use it (auto, trusted)
  * else seed from the old name-based mapping's answer for one of its display names
  * else leave blank for a human to fill

Accounts without a trusted full name are flagged `needs_review` and sorted first.
The username itself is usually the giveaway (e.g. @dmmiller612 -> Derek Miller).
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
EVENTS_DIR = DATA_DIR / "events"
MAPPING_FILE = DATA_DIR / "player_mapping.json"
OUT = DATA_DIR / "account_names.json"
TODAY = "2026-07-12"


def clean_full(n: str) -> bool:
    t = n.split()
    return len(t) == 2 and all(
        len(x) >= 2 and re.fullmatch(r"[A-Za-z]+(?:['-][A-Za-z]+)*", x) for x in t
    )


def main() -> None:
    # user_id -> aggregate
    acct: dict[str, dict] = defaultdict(
        lambda: {"username": None, "names": Counter(), "events": 0}
    )
    for f in sorted(EVENTS_DIR.glob("*.json")):
        e = json.load(open(f))
        if not (e["num_teams"] and e["date"] and e["date"] <= TODAY):
            continue
        for t in e["teams"]:
            for p in t["players"]:
                uid = p.get("user_id") or p.get("username")
                a = acct[uid]
                a["username"] = p.get("username")
                a["names"][p["name"].strip()] += 1
                a["events"] += 1

    # Seeds from the previous name-based mapping (display name -> assigned real name).
    prior = {}
    if MAPPING_FILE.exists():
        m = json.load(open(MAPPING_FILE))
        for cand in m.get("candidates", []):
            prior[cand] = cand
        for name, entry in m.get("mapping", {}).items():
            if entry.get("maps_to"):
                prior[name] = entry["maps_to"]

    accounts = {}
    for uid, a in acct.items():
        seen = [n for n, _ in a["names"].most_common()]
        # Prefer the most complete (longest) full name, then the most common; this
        # picks "Dan Laviolette" over "Dan Lavs" and "Michael Mahoney" over "Mike".
        full = sorted(
            (n for n in seen if clean_full(n)),
            key=lambda n: (-len(n), -a["names"][n]),
        )
        if full:
            name, review = full[0], False
        else:
            seed = next(
                (prior[n] for n in seen if prior.get(n) and clean_full(prior[n])), ""
            )
            name, review = seed, True
        accounts[uid] = {
            "username": a["username"],
            "name": name,
            "needs_review": review,
            "seen_as": seen,
            "appearances": a["events"],
        }

    # Needs-review first, then by descending appearances.
    ordered = dict(
        sorted(accounts.items(), key=lambda kv: (not kv[1]["needs_review"], -kv[1]["appearances"]))
    )
    OUT.write_text(
        json.dumps(
            {
                "_instructions": (
                    "One row per UDisc account, keyed by stable user_id. Set `name` to "
                    "the player's real name. Rows with needs_review=true had no trusted "
                    "full name in the data and were seeded from the old mapping or left "
                    "blank -- the `username` is usually the hint. Rows with "
                    "needs_review=false were taken from a full name the account actually "
                    "used; fix any you disagree with. Do not edit user_id/username/seen_as."
                ),
                "accounts": ordered,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    review = [u for u, r in accounts.items() if r["needs_review"]]
    blank = [u for u in review if not accounts[u]["name"]]
    print(f"accounts: {len(accounts)}")
    print(f"  auto (clean full name)     : {len(accounts) - len(review)}")
    print(f"  needs review               : {len(review)}  (of which blank: {len(blank)})")
    print(f"\nwrote {OUT}")
    print("\nneeds-review accounts (username -> seeded name):")
    for u in sorted(review, key=lambda u: -accounts[u]["appearances"]):
        r = accounts[u]
        print(f"  @{r['username']:20} {r['appearances']:>2}x  seen={r['seen_as']}  -> {r['name']!r}")


if __name__ == "__main__":
    main()

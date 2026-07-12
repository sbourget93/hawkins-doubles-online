#!/usr/bin/env python3
"""Build data/player_mapping.json from the scraped events.

Player identity is keyed on the displayed UDisc name, normalized for *case and
spacing only* (so 'Tyler fowler' and 'Tyler Fowler' are the same person). Each
normalized group's canonical display name is its most common raw spelling.

Names that look like a clean full name (exactly two alphabetic tokens) are
treated as valid players -- listed under `candidates`. Everything else (single
first names, initials like 'Rob G', nicknames like 'CJ-Thunderbuddy') can't be
resolved automatically, so it goes under `mapping` for a human to point at a
canonical player before we generate events.

Only events with results and a date on/before today are considered.
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
EVENTS_DIR = DATA_DIR / "events"
TODAY = "2026-07-12"
OUT = DATA_DIR / "player_mapping.json"


def norm(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip().lower()


def is_clean_full_name(display: str) -> bool:
    """A clean full name is exactly two alphabetic tokens, neither an initial."""
    tokens = display.split()
    if len(tokens) != 2:
        return False
    for tok in tokens:
        if len(tok) < 2:
            return False
        if not re.fullmatch(r"[A-Za-z]+(?:['-][A-Za-z]+)*", tok):
            return False
    return True


def main() -> None:
    raw_counts: dict[str, Counter] = defaultdict(Counter)  # norm -> {raw: count}
    appearances: dict[str, list[str]] = defaultdict(list)  # norm -> ["date with X"]

    events = []
    for f in sorted(EVENTS_DIR.glob("*.json")):
        e = json.load(open(f))
        if e["num_teams"] == 0 or not e["date"] or e["date"] > TODAY:
            continue
        events.append(e)

    for e in sorted(events, key=lambda x: x["date"]):
        for t in e["teams"]:
            names = [p["name"] for p in t["players"]]
            for name in names:
                k = norm(name)
                raw_counts[k][name] += 1
                mates = [m for m in names if m != name] or ["(rado/solo)"]
                appearances[k].append(f"{e['date']} with {', '.join(mates)}")

    # Canonical display = most common raw spelling (tie -> first seen).
    canonical: dict[str, str] = {}
    for k, counter in raw_counts.items():
        canonical[k] = counter.most_common(1)[0][0]

    candidates = sorted(
        {disp for k, disp in canonical.items() if is_clean_full_name(disp)},
        key=str.lower,
    )

    # Preserve any maps_to values already filled in on a previous run; only new
    # ambiguous names arrive blank. Keyed on the entry name (canonical display).
    prior = {}
    if OUT.exists():
        prior = {n: e.get("maps_to", "") for n, e in json.load(open(OUT)).get("mapping", {}).items()}

    mapping = {}
    added = 0
    for k, disp in sorted(canonical.items(), key=lambda kv: kv[1].lower()):
        if is_clean_full_name(disp):
            continue
        if disp not in prior:
            added += 1
        mapping[disp] = {
            "maps_to": prior.get(disp, ""),
            "total_appearances": sum(raw_counts[k].values()),
        }

    out = {
        "_instructions": (
            "For each entry under `mapping`, set `maps_to` to the canonical player "
            "this name refers to -- copy an exact string from `candidates`, or type "
            "a new full name to create one. Leave `maps_to` empty to keep this name "
            "as its own separate player. `candidates` is the list of already-clean "
            "players (case/spacing auto-merged); do not edit it."
        ),
        "candidates": candidates,
        "mapping": mapping,
    }
    OUT.write_text(json.dumps(out, indent=2), encoding="utf-8")

    unfilled = sum(1 for e in mapping.values() if not e["maps_to"])
    print(f"events considered      : {len(events)}")
    print(f"distinct normalized names: {len(canonical)}")
    print(f"clean candidates       : {len(candidates)}")
    print(f"names needing mapping   : {len(mapping)} ({added} new, {unfilled} still blank)")

    # Appearance context is kept out of the file (per request) but printed here to
    # help identify the still-blank names.
    disp_key = {v: k for k, v in canonical.items()}
    blanks = [n for n, e in mapping.items() if not e["maps_to"]]
    if blanks:
        print(f"\nstill-blank names ({len(blanks)}) with context:")
        for n in blanks:
            print(f"  {n:32} ({mapping[n]['total_appearances']}x)")
            for a in appearances[disp_key[n]]:
                print(f"        {a}")
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()

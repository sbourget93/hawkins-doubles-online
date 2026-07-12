#!/usr/bin/env python3
"""Extract UDisc account identity (username / userId) per player from the raw HTML.

Each event page serializes its data as a React Router "turbo-stream" -- a flat,
deduplicated array where an object `{"_1": 2}` means {arr[1]: arr[2]}. Decoding it
gives one object per registrant with the on-scorecard `name` plus the linked
UDisc `username` / `userId` (null for manually-typed guests with no account).

Two different display names that share a username are the same person -- the
reliable signal for deduping the messy leaderboard names. Writes:
  data/usernames.json         username -> {display names, userId, events}
  and prints usernames that map to more than one display name.
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
RAW_DIR = DATA_DIR / "raw"
sys.setrecursionlimit(100000)


def decode_stream(html: str):
    m = re.search(r'streamController\.enqueue\("(.*?)"\)', html, re.S)
    if not m:
        return None
    return json.loads(json.loads('"' + m.group(1) + '"'))


def player_identities(arr) -> list[dict]:
    """Return [{name, username, userId}] for every registrant object in the stream."""
    if "username" not in arr:
        return []
    uname_idx = arr.index("username")

    def resolve(i, depth=0, seen=None):
        if not isinstance(i, int):
            return i
        if i < 0:
            return None
        seen = seen or set()
        if i in seen or depth > 60:
            return None
        seen = seen | {i}
        x = arr[i]
        if isinstance(x, dict):
            out = {}
            for k, v in x.items():
                key = resolve(int(k[1:]), depth + 1, seen) if isinstance(k, str) and k.startswith("_") else k
                out[key] = resolve(v, depth + 1, seen)
            return out
        if isinstance(x, list):
            return [resolve(e, depth + 1, seen) for e in x]
        return x

    out = []
    for i, x in enumerate(arr):
        if isinstance(x, dict) and f"_{uname_idx}" in x:
            o = resolve(i)
            uname = o.get("username")
            name = o.get("name")
            # Skip team rows ("A & B", username null) and anything nameless.
            if not uname or not isinstance(name, str) or " & " in name:
                continue
            out.append({"name": name.strip(), "username": uname, "userId": o.get("userId")})
    return out


def main() -> None:
    by_user: dict[str, dict] = defaultdict(lambda: {"names": set(), "userId": None, "events": []})
    for f in sorted(RAW_DIR.glob("*.html")):
        arr = decode_stream(f.read_text(encoding="utf-8"))
        if arr is None:
            continue
        for p in player_identities(arr):
            u = by_user[p["username"]]
            u["names"].add(p["name"])
            u["events"].append(f.stem)
            if p["userId"]:
                u["userId"] = p["userId"]

    out = {
        u: {"names": sorted(v["names"]), "userId": v["userId"], "event_count": len(v["events"])}
        for u, v in sorted(by_user.items())
    }
    (DATA_DIR / "usernames.json").write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")

    multi = {u: v for u, v in out.items() if len(v["names"]) > 1}
    print(f"distinct usernames (accounts): {len(out)}")
    print(f"usernames with >1 display name (same person, diff spellings): {len(multi)}\n")
    for u, v in sorted(multi.items(), key=lambda kv: -len(kv[1]["names"])):
        print(f"  @{u:18} {v['names']}")


if __name__ == "__main__":
    main()

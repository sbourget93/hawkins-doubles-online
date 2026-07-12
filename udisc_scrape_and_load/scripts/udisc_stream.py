"""Decode a UDisc event page's React Router turbo-stream to recover player identity.

The page serializes its loader data as a flat, deduplicated array where an object
`{"_1": 2}` means `{arr[1]: arr[2]}` and list/object values are indices into the
array. Decoding it yields, per registrant, the on-scorecard `name` plus the linked
UDisc account (`username`, stable `registrantUserId`) and the `teamRegistrantId`
that groups teammates. Manually-typed guests have a null username (none occur in
this league's data — every player has an account).

`team_identities()` returns one list of member dicts per team, which the scraper
matches to the rendered leaderboard rows by player-name set. This is how the same
display name used by two different accounts in one event (e.g. two "John"s) is
told apart: they sit on differently-named teams.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict


def _norm(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip().lower()


def decode_stream(html: str) -> list | None:
    m = re.search(r'streamController\.enqueue\("(.*?)"\)', html, re.S)
    if not m:
        return None
    try:
        return json.loads(json.loads('"' + m.group(1) + '"'))
    except (ValueError, json.JSONDecodeError):
        return None


def _make_resolver(arr: list):
    n = len(arr)

    def resolve(i, depth=0, seen=None):
        if not isinstance(i, int):
            return i
        if i < 0 or i >= n:  # negative = special value; out-of-range = not a ref
            return None
        seen = seen or set()
        if i in seen or depth > 90:
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

    return resolve


def team_identities(html: str) -> list[list[dict]]:
    """Teams as lists of {name, username, user_id}, grouped by teamRegistrantId."""
    arr = decode_stream(html)
    if not arr or "username" not in arr:
        return []
    uname_idx = arr.index("username")
    resolve = _make_resolver(arr)

    groups: dict[str, dict] = defaultdict(dict)  # teamRegistrantId -> { _id: member }
    for i, x in enumerate(arr):
        if not (isinstance(x, dict) and f"_{uname_idx}" in x):
            continue
        o = resolve(i)
        if not isinstance(o, dict):
            continue
        name, username, trid = o.get("name"), o.get("username"), o.get("teamRegistrantId")
        if not username or not isinstance(name, str) or " & " in name or not trid:
            continue
        groups[trid][o.get("_id")] = {
            "name": name.strip(),
            "username": username,
            "user_id": o.get("registrantUserId"),
        }
    return [list(members.values()) for members in groups.values()]


def attach_usernames(html: str, teams: list[dict]) -> None:
    """Attach username/user_id to each player of each parsed leaderboard team.

    Matches a leaderboard team to a stream team by its set of player names; within
    a team, names are unique, so each player gets the right account even when the
    same display name is shared across two teams in the event.
    """
    lut: dict[tuple, list] = defaultdict(list)
    for members in team_identities(html):
        lut[tuple(sorted(_norm(m["name"]) for m in members))].append(members)

    for team in teams:
        key = tuple(sorted(_norm(p["name"]) for p in team["players"]))
        cands = lut.get(key)
        members = list(cands.pop(0)) if cands else None  # consume identical-name teams in order
        if not members:
            continue
        for p in team["players"]:
            for m in members:
                if _norm(m["name"]) == _norm(p["name"]):
                    p["username"] = m["username"]
                    p["user_id"] = m["user_id"]
                    members.remove(m)
                    break

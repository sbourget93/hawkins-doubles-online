"""Bounty projection: fold Bounty events onto the `bounties` read-model table.

A bounty is a prize anyone can win by completing a designated task (e.g. an ace
pot). Bounties are global — they aren't tied to a league event. Metadata columns
follow the documented convention (documentation/models): the creation event sets
`created_at`, edits set `updated_at`, and a delete sets `deleted_at` (null means
active).
"""

import sqlite3


def _name_and_prize(payload: dict, event_type: str) -> tuple[str, str]:
    name = (payload.get("name") or "").strip()
    prize = (payload.get("prize") or "").strip()
    if not name:
        raise ValueError(f"{event_type} requires a name")
    if not prize:
        raise ValueError(f"{event_type} requires a prize")
    return name, prize


def _added(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    name, prize = _name_and_prize(payload, "BountyCreated")
    # INSERT OR REPLACE keeps replay idempotent if an add is ever re-applied.
    conn.execute(
        "INSERT OR REPLACE INTO bounties "
        "(bounty_id, name, prize, created_at, updated_at, deleted_at) "
        "VALUES (?, ?, ?, ?, NULL, NULL)",
        (aggregate_id, name, prize, created_at),
    )


def _edited(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    name, prize = _name_and_prize(payload, "BountyEdited")
    conn.execute(
        "UPDATE bounties SET name = ?, prize = ?, updated_at = ? WHERE bounty_id = ?",
        (name, prize, created_at, aggregate_id),
    )


def _deleted(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    conn.execute(
        "UPDATE bounties SET deleted_at = ? WHERE bounty_id = ?",
        (created_at, aggregate_id),
    )


HANDLERS = {
    "BountyCreated": _added,
    "BountyEdited": _edited,
    "BountyDeleted": _deleted,
}

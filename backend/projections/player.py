"""Player projection: fold Player events onto the `players` read-model table.

Metadata columns follow the documented convention (documentation/models): the
creation event sets `created_at`, edits set `updated_at`, and a delete sets
`deleted_at` (null means active).
"""

import sqlite3


def _names(payload: dict, event_type: str) -> tuple[str, str]:
    first = (payload.get("first_name") or "").strip()
    last = (payload.get("last_name") or "").strip()
    if not first or not last:
        raise ValueError(f"{event_type} requires first_name and last_name")
    return first, last


def _pool(payload: dict, event_type: str) -> str:
    default_pool = payload.get("default_pool")
    if default_pool not in ("A", "B"):
        raise ValueError(f"{event_type} default_pool must be 'A' or 'B'")
    return default_pool


def _added(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    first, last = _names(payload, "PlayerCreated")
    default_pool = _pool(payload, "PlayerCreated")
    is_woman = 1 if payload.get("is_woman") else 0
    is_rado_willing = 1 if payload.get("is_rado_willing") else 0
    # INSERT OR REPLACE keeps replay idempotent if an add is ever re-applied.
    conn.execute(
        "INSERT OR REPLACE INTO players "
        "(player_id, first_name, last_name, is_woman, default_pool, is_rado_willing, "
        "created_at, updated_at, deleted_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)",
        (aggregate_id, first, last, is_woman, default_pool, is_rado_willing, created_at),
    )


def _edited(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    first, last = _names(payload, "PlayerEdited")
    default_pool = _pool(payload, "PlayerEdited")
    is_woman = 1 if payload.get("is_woman") else 0
    is_rado_willing = 1 if payload.get("is_rado_willing") else 0
    conn.execute(
        "UPDATE players SET first_name = ?, last_name = ?, is_woman = ?, "
        "default_pool = ?, is_rado_willing = ?, updated_at = ? WHERE player_id = ?",
        (first, last, is_woman, default_pool, is_rado_willing, created_at, aggregate_id),
    )


def _deleted(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    conn.execute(
        "UPDATE players SET deleted_at = ? WHERE player_id = ?",
        (created_at, aggregate_id),
    )


HANDLERS = {
    "PlayerCreated": _added,
    "PlayerEdited": _edited,
    "PlayerDeleted": _deleted,
}

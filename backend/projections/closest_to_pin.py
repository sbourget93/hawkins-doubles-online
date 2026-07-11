"""ClosestToPin projection: fold CTP events onto the `closest_to_pins` table.

A closest-to-pin is a prize awarded on a given hole of a league event. The admin
adds them when setting up the event; a winner is recorded later. Metadata columns
follow the documented convention (documentation/models): the add event sets
`created_at`, removal sets `deleted_at` (null means active).
"""

import sqlite3


def _hole_and_prize(payload: dict, event_type: str) -> tuple[int, str]:
    hole_number = payload.get("hole_number")
    prize = (payload.get("prize") or "").strip()
    if not isinstance(hole_number, int) or isinstance(hole_number, bool) or not (1 <= hole_number <= 18):
        raise ValueError(f"{event_type} requires hole_number between 1 and 18")
    if not prize:
        raise ValueError(f"{event_type} requires a prize")
    return hole_number, prize


def _added(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    league_event_id = (payload.get("league_event_id") or "").strip()
    if not league_event_id:
        raise ValueError("ClosestToPinCreated requires league_event_id")
    hole_number, prize = _hole_and_prize(payload, "ClosestToPinCreated")
    # INSERT OR REPLACE keeps replay idempotent. A CTP starts with no winner.
    conn.execute(
        "INSERT OR REPLACE INTO closest_to_pins "
        "(closest_to_pin_id, league_event_id, winner_registration_id, hole_number, "
        "prize, created_at, updated_at, deleted_at) "
        "VALUES (?, ?, NULL, ?, ?, ?, NULL, NULL)",
        (aggregate_id, league_event_id, hole_number, prize, created_at),
    )


def _edited(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    # Only hole and prize are editable; winner_registration_id is preserved.
    hole_number, prize = _hole_and_prize(payload, "ClosestToPinEdited")
    conn.execute(
        "UPDATE closest_to_pins SET hole_number = ?, prize = ?, updated_at = ? "
        "WHERE closest_to_pin_id = ?",
        (hole_number, prize, created_at, aggregate_id),
    )


def _removed(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    conn.execute(
        "UPDATE closest_to_pins SET deleted_at = ? WHERE closest_to_pin_id = ?",
        (created_at, aggregate_id),
    )


HANDLERS = {
    "ClosestToPinCreated": _added,
    "ClosestToPinEdited": _edited,
    "ClosestToPinDeleted": _removed,
}

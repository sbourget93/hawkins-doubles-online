"""Card projection: fold Card events onto the `cards` table.

A card is a group of teams that play a round together, starting on a given hole
of a league event. Cards are created when teams are generated and can be added or
removed as the admin rearranges teams. Metadata columns follow the documented
convention (documentation/models): the create event sets `created_at`, removal
sets `deleted_at` (null means active).
"""

import sqlite3


def _created(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    league_event_id = (payload.get("league_event_id") or "").strip()
    starting_hole = payload.get("starting_hole")
    if not league_event_id:
        raise ValueError("CardCreated requires league_event_id")
    if (
        not isinstance(starting_hole, int)
        or isinstance(starting_hole, bool)
        or not (1 <= starting_hole <= 18)
    ):
        raise ValueError("CardCreated requires starting_hole between 1 and 18")
    # INSERT OR REPLACE keeps replay idempotent.
    conn.execute(
        "INSERT OR REPLACE INTO cards "
        "(card_id, league_event_id, starting_hole, created_at, updated_at, deleted_at) "
        "VALUES (?, ?, ?, ?, NULL, NULL)",
        (aggregate_id, league_event_id, starting_hole, created_at),
    )


def _deleted(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    conn.execute(
        "UPDATE cards SET deleted_at = ? WHERE card_id = ?",
        (created_at, aggregate_id),
    )


HANDLERS = {
    "CardCreated": _created,
    "CardDeleted": _deleted,
}

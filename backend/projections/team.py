"""Team projection: fold Team events onto the `teams` table.

Players randomly form teams of 2 (occasionally 1 "rado" or 3). A team belongs to
a card and carries a handicap computed when teams are generated. The admin can
move a team onto a different card (TeamCardChanged) or remove it (TeamDeleted).
Metadata columns follow the documented convention (documentation/models): the
create event sets `created_at`, later changes set `updated_at`, and removal sets
`deleted_at` (null means active).
"""

import sqlite3


def _created(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    card_id = (payload.get("card_id") or "").strip()
    handicap = payload.get("handicap")
    if not card_id:
        raise ValueError("TeamCreated requires card_id")
    if not isinstance(handicap, int) or isinstance(handicap, bool):
        raise ValueError("TeamCreated requires an integer handicap")
    # INSERT OR REPLACE keeps replay idempotent. Placement is entered later.
    conn.execute(
        "INSERT OR REPLACE INTO teams "
        "(team_id, card_id, handicap, placement, created_at, updated_at, deleted_at) "
        "VALUES (?, ?, ?, NULL, ?, NULL, NULL)",
        (aggregate_id, card_id, handicap, created_at),
    )


def _card_changed(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    card_id = (payload.get("card_id") or "").strip()
    if not card_id:
        raise ValueError("TeamCardChanged requires card_id")
    conn.execute(
        "UPDATE teams SET card_id = ?, updated_at = ? WHERE team_id = ?",
        (card_id, created_at, aggregate_id),
    )


def _handicap_changed(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    # Emitted when a team's composition changes (players swapped/moved) so its
    # auto-computed handicap stays in sync.
    handicap = payload.get("handicap")
    if not isinstance(handicap, int) or isinstance(handicap, bool):
        raise ValueError("TeamHandicapChanged requires an integer handicap")
    conn.execute(
        "UPDATE teams SET handicap = ?, updated_at = ? WHERE team_id = ?",
        (handicap, created_at, aggregate_id),
    )


def _deleted(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    conn.execute(
        "UPDATE teams SET deleted_at = ? WHERE team_id = ?",
        (created_at, aggregate_id),
    )


HANDLERS = {
    "TeamCreated": _created,
    "TeamCardChanged": _card_changed,
    "TeamHandicapChanged": _handicap_changed,
    "TeamDeleted": _deleted,
}

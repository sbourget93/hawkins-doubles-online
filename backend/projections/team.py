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
    # INSERT OR REPLACE keeps replay idempotent. Score, placement, and payout are
    # all entered/derived later.
    conn.execute(
        "INSERT OR REPLACE INTO teams "
        "(team_id, card_id, handicap, score, placement, payout_amount, "
        "created_at, updated_at, deleted_at) "
        "VALUES (?, ?, ?, NULL, NULL, NULL, ?, NULL, NULL)",
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


def _score_changed(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    # The admin enters each team's net score after the round; placements are
    # derived from it (see the round-in-progress page). A null clears it.
    score = payload.get("score")
    if score is not None and (not isinstance(score, int) or isinstance(score, bool)):
        raise ValueError("TeamScoreChanged requires an integer or null")
    conn.execute(
        "UPDATE teams SET score = ?, updated_at = ? WHERE team_id = ?",
        (score, created_at, aggregate_id),
    )


def _payout_changed(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    # How much the team won; computed after the round, adjustable before the event
    # is completed. A null clears it.
    payout = payload.get("payout_amount")
    if payout is not None and (not isinstance(payout, int) or isinstance(payout, bool)):
        raise ValueError("TeamPayoutChanged requires an integer or null")
    conn.execute(
        "UPDATE teams SET payout_amount = ?, updated_at = ? WHERE team_id = ?",
        (payout, created_at, aggregate_id),
    )


def _placement_changed(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    # The admin sets a team's finishing place (1, 2, 3, …) manually once the round
    # is under way; ties are allowed, so places need not be unique. A null clears it.
    placement = payload.get("placement")
    if placement is not None and (
        not isinstance(placement, int) or isinstance(placement, bool) or placement < 1
    ):
        raise ValueError("TeamPlacementChanged requires a positive integer or null")
    conn.execute(
        "UPDATE teams SET placement = ?, updated_at = ? WHERE team_id = ?",
        (placement, created_at, aggregate_id),
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
    "TeamScoreChanged": _score_changed,
    "TeamPlacementChanged": _placement_changed,
    "TeamPayoutChanged": _payout_changed,
    "TeamDeleted": _deleted,
}

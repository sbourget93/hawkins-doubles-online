"""CardRequest projection: fold card-request events onto the `card_requests` table.

A card request is an admin note that two players either want to play on the same
card (`prefer`) or should be kept apart (`avoid`). It links two players (not
registrations) so it can be entered before either player has registered. Metadata
columns follow the documented convention (documentation/models): the add event
sets `created_at`, later changes set `updated_at`, and removal sets `deleted_at`
(null means active). Card generation does not consume these yet.
"""

import sqlite3

_REQUEST_TYPES = ("prefer", "avoid")


def _players_and_type(payload: dict, event_type: str) -> tuple[str, str, str]:
    player_id_a = (payload.get("player_id_a") or "").strip()
    player_id_b = (payload.get("player_id_b") or "").strip()
    request_type = (payload.get("request_type") or "").strip()
    if not player_id_a or not player_id_b:
        raise ValueError(f"{event_type} requires player_id_a and player_id_b")
    if player_id_a == player_id_b:
        raise ValueError(f"{event_type} requires two different players")
    if request_type not in _REQUEST_TYPES:
        raise ValueError(f"{event_type} requires request_type of 'prefer' or 'avoid'")
    return player_id_a, player_id_b, request_type


def _added(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    league_event_id = (payload.get("league_event_id") or "").strip()
    if not league_event_id:
        raise ValueError("CardRequestCreated requires league_event_id")
    player_id_a, player_id_b, request_type = _players_and_type(payload, "CardRequestCreated")
    # INSERT OR REPLACE keeps replay idempotent.
    conn.execute(
        "INSERT OR REPLACE INTO card_requests "
        "(card_request_id, league_event_id, player_id_a, player_id_b, request_type, "
        "created_at, updated_at, deleted_at) "
        "VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)",
        (aggregate_id, league_event_id, player_id_a, player_id_b, request_type, created_at),
    )


def _edited(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    # Only the two players and the request type are editable; league_event_id is preserved.
    player_id_a, player_id_b, request_type = _players_and_type(payload, "CardRequestEdited")
    conn.execute(
        "UPDATE card_requests SET player_id_a = ?, player_id_b = ?, request_type = ?, "
        "updated_at = ? WHERE card_request_id = ?",
        (player_id_a, player_id_b, request_type, created_at, aggregate_id),
    )


def _removed(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    conn.execute(
        "UPDATE card_requests SET deleted_at = ? WHERE card_request_id = ?",
        (created_at, aggregate_id),
    )


HANDLERS = {
    "CardRequestCreated": _added,
    "CardRequestEdited": _edited,
    "CardRequestDeleted": _removed,
}

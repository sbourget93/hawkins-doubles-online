"""Registration projection: fold Registration events onto the `registrations` table.

A registration is a player's entry into a league event. It starts unpaid; the
admin marks it paid when the player pays. Metadata columns follow the documented
convention (documentation/models): the add event sets `created_at`, later changes
set `updated_at`, and removal sets `deleted_at` (null means active).
"""

import sqlite3


def _added(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    league_event_id = (payload.get("league_event_id") or "").strip()
    player_id = (payload.get("player_id") or "").strip()
    if not league_event_id or not player_id:
        raise ValueError("RegistrationCreated requires league_event_id and player_id")
    # INSERT OR REPLACE keeps replay idempotent. New registrations start unpaid
    # (is_paid = 0) and unassigned to a team.
    conn.execute(
        "INSERT OR REPLACE INTO registrations "
        "(registration_id, league_event_id, player_id, team_id, is_paid, "
        "pool_override, created_at, updated_at, deleted_at) "
        "VALUES (?, ?, ?, NULL, 0, NULL, ?, NULL, NULL)",
        (aggregate_id, league_event_id, player_id, created_at),
    )


def _paid_changed(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    is_paid = payload.get("is_paid")
    if not isinstance(is_paid, bool):
        raise ValueError("RegistrationPaidChanged requires a boolean is_paid")
    conn.execute(
        "UPDATE registrations SET is_paid = ?, updated_at = ? WHERE registration_id = ?",
        (1 if is_paid else 0, created_at, aggregate_id),
    )


def _team_assigned(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    # Assigns the registration to a team when teams are generated (or clears it
    # with a null team_id). Set on every registered player each generation.
    team_id = payload.get("team_id")
    if team_id is not None and not isinstance(team_id, str):
        raise ValueError("RegistrationTeamAssigned requires a string or null team_id")
    conn.execute(
        "UPDATE registrations SET team_id = ?, updated_at = ? WHERE registration_id = ?",
        (team_id, created_at, aggregate_id),
    )


def _removed(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    conn.execute(
        "UPDATE registrations SET deleted_at = ? WHERE registration_id = ?",
        (created_at, aggregate_id),
    )


def _pool_override_changed(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    # Overrides the player's default pool for this event only. Null clears the
    # override, falling back to the player's default pool.
    pool_override = payload.get("pool_override")
    if pool_override is not None and pool_override not in ("A", "B"):
        raise ValueError(
            "RegistrationPoolOverrideChanged requires pool_override of 'A', 'B', or null"
        )
    conn.execute(
        "UPDATE registrations SET pool_override = ?, updated_at = ? "
        "WHERE registration_id = ?",
        (pool_override, created_at, aggregate_id),
    )


HANDLERS = {
    "RegistrationCreated": _added,
    "RegistrationPaidChanged": _paid_changed,
    "RegistrationTeamAssigned": _team_assigned,
    "RegistrationPoolOverrideChanged": _pool_override_changed,
    "RegistrationDeleted": _removed,
}

"""LeagueEvent projection: fold LeagueEvent events onto the `league_events` table.

Metadata columns follow the documented convention (documentation/models): the
creation event sets `created_at`; an update (e.g. a status change) sets
`updated_at`; `deleted_at` stays null until a delete occurs.
"""

import sqlite3

VALID_STATES = (
    "registration",
    "forming_teams",
    "ready",
    "in_progress",
    "completed",
)


def _created(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    date = (payload.get("date") or "").strip()
    if not date:
        raise ValueError("LeagueEventCreated requires a date")
    # Title is optional on the wire; fall back to the documented default. The
    # frontend always supplies one, but a bare command still projects cleanly.
    title = (payload.get("title") or "").strip() or "Hawkins Dubs"
    # INSERT OR REPLACE keeps replay idempotent. A new league event always starts
    # in the "registration" state; later events transition it.
    conn.execute(
        "INSERT OR REPLACE INTO league_events "
        "(league_event_id, date, title, state, created_at, updated_at, deleted_at) "
        "VALUES (?, ?, ?, 'registration', ?, NULL, NULL)",
        (aggregate_id, date, title, created_at),
    )


def _edited(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    # Only the date and title are editable; state and metadata are preserved.
    date = (payload.get("date") or "").strip()
    if not date:
        raise ValueError("LeagueEventEdited requires a date")
    title = (payload.get("title") or "").strip()
    if not title:
        raise ValueError("LeagueEventEdited requires a title")
    conn.execute(
        "UPDATE league_events SET date = ?, title = ?, updated_at = ? "
        "WHERE league_event_id = ?",
        (date, title, created_at, aggregate_id),
    )


def _state_changed(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    state = payload.get("state")
    if state not in VALID_STATES:
        raise ValueError(f"LeagueEventStateChanged requires state in {list(VALID_STATES)}")
    conn.execute(
        "UPDATE league_events SET state = ?, updated_at = ? WHERE league_event_id = ?",
        (state, created_at, aggregate_id),
    )


def _deleted(
    conn: sqlite3.Connection, aggregate_id: str, payload: dict, created_at: str
) -> None:
    conn.execute(
        "UPDATE league_events SET deleted_at = ? WHERE league_event_id = ?",
        (created_at, aggregate_id),
    )


HANDLERS = {
    "LeagueEventCreated": _created,
    "LeagueEventEdited": _edited,
    "LeagueEventStateChanged": _state_changed,
    "LeagueEventDeleted": _deleted,
}

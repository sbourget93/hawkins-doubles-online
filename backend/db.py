"""SQLite access: the append-only event store plus the projection tables.

The events table is the single source of truth (never updated or deleted). The
players table is a projection (read model) rebuilt from events. Both live in the
same SQLite file; see agents.md for the event-sourcing design.
"""

import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from typing import Iterator

# DB_PATH lets prod/tests override the location. Locally the compose bind-mount
# (../../backend:/app) persists this file on the host across container restarts.
DB_PATH = os.environ.get("DB_PATH", "hawkins.db")

# Single shared connection guarded by one lock. Single-admin, low-concurrency
# workload, so serializing all DB access is simplest and perfectly adequate.
_conn: sqlite3.Connection | None = None
_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    seq          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id     TEXT NOT NULL UNIQUE,
    event_type   TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    payload      TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT,
    deleted_at   TEXT
);

CREATE TABLE IF NOT EXISTS players (
    player_id    TEXT PRIMARY KEY,
    first_name   TEXT NOT NULL,
    last_name    TEXT NOT NULL,
    is_woman     INTEGER NOT NULL DEFAULT 0,
    default_pool TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT,
    deleted_at   TEXT
);

CREATE TABLE IF NOT EXISTS league_events (
    league_event_id TEXT PRIMARY KEY,
    date            TEXT NOT NULL,
    title           TEXT NOT NULL,
    state           TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    updated_at      TEXT,
    deleted_at      TEXT
);

CREATE TABLE IF NOT EXISTS registrations (
    registration_id TEXT PRIMARY KEY,
    league_event_id TEXT NOT NULL,
    player_id       TEXT NOT NULL,
    team_id         TEXT,
    is_paid         INTEGER NOT NULL DEFAULT 0,
    pool_override   TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT,
    deleted_at      TEXT
);

CREATE TABLE IF NOT EXISTS closest_to_pins (
    closest_to_pin_id      TEXT PRIMARY KEY,
    league_event_id        TEXT NOT NULL,
    winner_registration_id TEXT,
    hole_number            INTEGER NOT NULL,
    prize                  TEXT NOT NULL,
    created_at             TEXT NOT NULL,
    updated_at             TEXT,
    deleted_at             TEXT
);

CREATE TABLE IF NOT EXISTS card_requests (
    card_request_id TEXT PRIMARY KEY,
    league_event_id TEXT NOT NULL,
    player_id_a     TEXT NOT NULL,
    player_id_b     TEXT NOT NULL,
    request_type    TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    updated_at      TEXT,
    deleted_at      TEXT
);

CREATE TABLE IF NOT EXISTS cards (
    card_id         TEXT PRIMARY KEY,
    league_event_id TEXT NOT NULL,
    starting_hole   INTEGER NOT NULL,
    created_at      TEXT NOT NULL,
    updated_at      TEXT,
    deleted_at      TEXT
);

CREATE TABLE IF NOT EXISTS teams (
    team_id       TEXT PRIMARY KEY,
    card_id       TEXT NOT NULL,
    handicap      INTEGER NOT NULL,
    score         INTEGER,
    placement     INTEGER,
    payout_amount INTEGER,
    created_at    TEXT NOT NULL,
    updated_at    TEXT,
    deleted_at    TEXT
);

CREATE TABLE IF NOT EXISTS sync_state (
    key   TEXT PRIMARY KEY,
    value INTEGER NOT NULL
);
"""


def get_connection() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
    return _conn


@contextmanager
def transaction() -> Iterator[sqlite3.Connection]:
    """Serialize DB access and commit atomically (rolling back on error)."""
    conn = get_connection()
    with _lock:
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise


@contextmanager
def read() -> Iterator[sqlite3.Connection]:
    """Serialize read-only DB access (no commit)."""
    conn = get_connection()
    with _lock:
        yield conn


def init_db() -> None:
    """Create tables if needed, then replay events if the projection is empty.

    Replay matters when the event log is present but projections are not — e.g. a
    fresh instance restoring the log from S3, or projections being reset.
    """
    conn = get_connection()
    with _lock:
        conn.executescript(SCHEMA)
        conn.commit()
    _restore_if_empty()
    _replay_if_needed()


def _restore_if_empty() -> None:
    # Fresh instance (prod runs with no volume): pull the event log back from S3
    # before replay rebuilds the projections. No-op when the log already exists or
    # S3 is disabled. Imported lazily to avoid a circular import at module load.
    conn = get_connection()
    with _lock:
        events = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]
    if events > 0:
        return
    import s3_sync

    s3_sync.restore_from_s3()


def _replay_if_needed() -> None:
    # Imported here to keep the projections package free of any dependency on this module.
    from projections import apply_event

    with transaction() as conn:
        events = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        if events == 0:
            return
        # Skip replay once any projection is populated (a normal restart). Replay
        # only rebuilds from the log when events exist but projections are empty —
        # e.g. a fresh instance restoring the log from S3. Add new projection
        # tables to this sum as aggregates are introduced.
        projected = (
            conn.execute("SELECT COUNT(*) FROM players").fetchone()[0]
            + conn.execute("SELECT COUNT(*) FROM league_events").fetchone()[0]
            + conn.execute("SELECT COUNT(*) FROM registrations").fetchone()[0]
            + conn.execute("SELECT COUNT(*) FROM closest_to_pins").fetchone()[0]
            + conn.execute("SELECT COUNT(*) FROM card_requests").fetchone()[0]
            + conn.execute("SELECT COUNT(*) FROM cards").fetchone()[0]
            + conn.execute("SELECT COUNT(*) FROM teams").fetchone()[0]
        )
        if projected > 0:
            return
        rows = conn.execute(
            "SELECT event_type, aggregate_id, payload, created_at FROM events ORDER BY seq"
        ).fetchall()
        for row in rows:
            apply_event(
                conn,
                row["event_type"],
                row["aggregate_id"],
                json.loads(row["payload"]),
                row["created_at"],
            )

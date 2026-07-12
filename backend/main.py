"""FastAPI app: CQRS command + query endpoints over the event-sourced store.

Command endpoint accepts events and returns only success/failure. Query endpoints
return data and never mutate. See agents.md for the full architecture.
"""

import json
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

import auth
import db
import s3_sync
from projections import KNOWN_EVENT_TYPES, apply_event


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()  # restores the event log from S3 (if empty) before replay
    s3_sync.start_background_sync()
    yield
    s3_sync.stop_background_sync()


app = FastAPI(lifespan=lifespan)

# Signed session cookie holding the (cosmetic) Google identity. max_age ~10 years
# keeps users logged in effectively indefinitely; this stays valid only while
# SESSION_SECRET is unchanged (stored in SSM in prod, reused across deploys).
app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ.get("SESSION_SECRET", "dev-insecure-secret"),
    max_age=10 * 365 * 24 * 3600,
    same_site="lax",
    https_only=os.environ.get("COOKIE_SECURE", "0") == "1",
)

app.include_router(auth.router)


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------
class CommandEvent(BaseModel):
    event_id: str            # client-generated UUID (idempotency key)
    type: str                # event type; must have a registered projection handler
    aggregate_id: str        # client-generated UUID of the target aggregate
    data: dict | None = None  # event payload; the per-aggregate handler validates it
    created_at: str


class CommandRequest(BaseModel):
    # Sequence number of the last event the client synced from the server.
    expected_version: int
    events: list[CommandEvent]


# ---------------------------------------------------------------------------
# Command endpoint (writes)
# ---------------------------------------------------------------------------
# Routes have no /api prefix: nginx strips it before proxying (see nginx.conf).
@app.post("/commands", dependencies=[Depends(auth.require_admin)])
def post_commands(req: CommandRequest):
    """Append a batch of client events, then project them. Atomic all-or-nothing.

    Admin-only (see auth.require_admin): non-admins are rejected with 403 before
    any write. Aggregate-agnostic: any event whose type has a registered
    projection handler is accepted. If the client's expected_version is behind the
    server, the whole batch is rejected with 409 and the client must re-sync.
    """
    with db.transaction() as conn:
        current = conn.execute("SELECT COALESCE(MAX(seq), 0) FROM events").fetchone()[0]
        if req.expected_version != current:
            raise HTTPException(
                status_code=409,
                detail={"status": "conflict", "version": current},
            )

        for event in req.events:
            if event.type not in KNOWN_EVENT_TYPES:
                raise HTTPException(status_code=400, detail=f"Unknown event type: {event.type}")

            # Idempotency: an event already recorded (e.g. a retry after a lost
            # ack) is skipped rather than duplicated.
            already = conn.execute(
                "SELECT 1 FROM events WHERE event_id = ?", (event.event_id,)
            ).fetchone()
            if already:
                continue

            payload = event.data or {}
            try:
                conn.execute(
                    "INSERT INTO events (event_id, event_type, aggregate_id, payload, created_at) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (event.event_id, event.type, event.aggregate_id, json.dumps(payload), event.created_at),
                )
                apply_event(conn, event.type, event.aggregate_id, payload, event.created_at)
            except ValueError as exc:
                # Per-aggregate projection validation rejected the payload.
                raise HTTPException(status_code=400, detail=str(exc))

        version = conn.execute("SELECT COALESCE(MAX(seq), 0) FROM events").fetchone()[0]

    # Best-effort: nudge the background loop to back the new events up to S3.
    # Never blocks or fails the write — the local commit above is the durable point.
    s3_sync.request_sync()
    return {"status": "ok", "version": version}


# ---------------------------------------------------------------------------
# Query endpoints (reads)
# ---------------------------------------------------------------------------
@app.get("/events")
def get_events(since: int = 0):
    """Events with seq > `since`, plus the current version. Used for sync/replay."""
    with db.read() as conn:
        rows = conn.execute(
            "SELECT seq, event_id, event_type, aggregate_id, payload, created_at "
            "FROM events WHERE seq > ? ORDER BY seq",
            (since,),
        ).fetchall()
        version = conn.execute("SELECT COALESCE(MAX(seq), 0) FROM events").fetchone()[0]

    events = [
        {
            "seq": r["seq"],
            "event_id": r["event_id"],
            "type": r["event_type"],
            "aggregate_id": r["aggregate_id"],
            "data": json.loads(r["payload"]),
            "created_at": r["created_at"],
        }
        for r in rows
    ]
    return {"version": version, "events": events}


@app.get("/players")
def get_players():
    """Canonical read model: all non-deleted players, plus the current version."""
    with db.read() as conn:
        rows = conn.execute(
            "SELECT player_id, first_name, last_name, is_woman, default_pool FROM players "
            "WHERE deleted_at IS NULL ORDER BY last_name, first_name"
        ).fetchall()
        version = conn.execute("SELECT COALESCE(MAX(seq), 0) FROM events").fetchone()[0]

    players = [
        {
            "player_id": r["player_id"],
            "first_name": r["first_name"],
            "last_name": r["last_name"],
            "is_woman": bool(r["is_woman"]),
            "default_pool": r["default_pool"],
        }
        for r in rows
    ]
    return {"version": version, "players": players}


@app.get("/league-events")
def get_league_events():
    """All non-deleted league events (most recent first), plus the current version."""
    with db.read() as conn:
        rows = conn.execute(
            "SELECT league_event_id, date, title, state FROM league_events "
            "WHERE deleted_at IS NULL ORDER BY date DESC"
        ).fetchall()
        version = conn.execute("SELECT COALESCE(MAX(seq), 0) FROM events").fetchone()[0]

    return {"version": version, "league_events": [dict(r) for r in rows]}


@app.get("/registrations")
def get_registrations():
    """All non-deleted registrations, plus the current version. is_paid is a bool."""
    with db.read() as conn:
        rows = conn.execute(
            "SELECT registration_id, league_event_id, player_id, team_id, is_paid, "
            "pool_override FROM registrations "
            "WHERE deleted_at IS NULL ORDER BY created_at"
        ).fetchall()
        version = conn.execute("SELECT COALESCE(MAX(seq), 0) FROM events").fetchone()[0]

    registrations = [
        {
            "registration_id": r["registration_id"],
            "league_event_id": r["league_event_id"],
            "player_id": r["player_id"],
            "team_id": r["team_id"],
            "is_paid": bool(r["is_paid"]),
            "pool_override": r["pool_override"],
        }
        for r in rows
    ]
    return {"version": version, "registrations": registrations}


@app.get("/closest-to-pins")
def get_closest_to_pins():
    """All non-deleted closest-to-pins, plus the current version."""
    with db.read() as conn:
        rows = conn.execute(
            "SELECT closest_to_pin_id, league_event_id, winner_registration_id, "
            "hole_number, prize FROM closest_to_pins "
            "WHERE deleted_at IS NULL ORDER BY hole_number"
        ).fetchall()
        version = conn.execute("SELECT COALESCE(MAX(seq), 0) FROM events").fetchone()[0]

    return {"version": version, "closest_to_pins": [dict(r) for r in rows]}


@app.get("/cards")
def get_cards():
    """All non-deleted cards (by starting hole), plus the current version."""
    with db.read() as conn:
        rows = conn.execute(
            "SELECT card_id, league_event_id, starting_hole FROM cards "
            "WHERE deleted_at IS NULL ORDER BY starting_hole"
        ).fetchall()
        version = conn.execute("SELECT COALESCE(MAX(seq), 0) FROM events").fetchone()[0]

    return {"version": version, "cards": [dict(r) for r in rows]}


@app.get("/teams")
def get_teams():
    """All non-deleted teams, plus the current version."""
    with db.read() as conn:
        rows = conn.execute(
            "SELECT team_id, card_id, handicap, score, placement, payout_amount FROM teams "
            "WHERE deleted_at IS NULL ORDER BY created_at"
        ).fetchall()
        version = conn.execute("SELECT COALESCE(MAX(seq), 0) FROM events").fetchone()[0]

    return {"version": version, "teams": [dict(r) for r in rows]}

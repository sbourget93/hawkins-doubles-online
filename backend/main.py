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


# Minimum scored leagues before a player appears on the rankings board — keeps a
# single hot night from topping the list.
RANKINGS_MIN_LEAGUES = 3


@app.get("/player-rankings")
def get_player_rankings():
    """Players ranked by their mean inclusive score-percentile across events.

    For each league event, every scored team gets an *inclusive* percentile from
    its net score (lower is better): 100 * (teams finishing same-or-worse) /
    (teams in the event). The best score — and all ties for it — get 100. A player
    inherits their team's percentile for that event; a player's rating is the mean
    of those per-event percentiles, each event weighted equally. Percentiles come
    from raw scores, not the stored `placement`, so score ties always share a
    value even when the admin broke the placement tie. Players with fewer than
    RANKINGS_MIN_LEAGUES scored events are omitted. Rank is 1-based with ties
    sharing a rank (standard competition ranking).
    """
    with db.read() as conn:
        rows = conn.execute(
            "SELECT le.league_event_id AS event_id, t.team_id AS team_id, "
            "t.score AS score, r.player_id AS player_id "
            "FROM teams t "
            "JOIN cards c ON c.card_id = t.card_id AND c.deleted_at IS NULL "
            "JOIN league_events le ON le.league_event_id = c.league_event_id "
            "  AND le.deleted_at IS NULL "
            "JOIN registrations r ON r.team_id = t.team_id AND r.deleted_at IS NULL "
            "WHERE t.deleted_at IS NULL AND t.score IS NOT NULL"
        ).fetchall()
        players = conn.execute(
            "SELECT player_id, first_name, last_name, is_woman, default_pool "
            "FROM players WHERE deleted_at IS NULL"
        ).fetchall()
        version = conn.execute("SELECT COALESCE(MAX(seq), 0) FROM events").fetchone()[0]

    # Per event, the scores of its scored teams (deduped — a row repeats per
    # registration on the team), and which players sat on each team.
    scores_by_event: dict[str, dict[str, int]] = {}
    players_by_team: dict[str, set[str]] = {}
    for row in rows:
        scores_by_event.setdefault(row["event_id"], {})[row["team_id"]] = row["score"]
        players_by_team.setdefault(row["team_id"], set()).add(row["player_id"])

    # Inclusive percentile for each scored team, keyed by team_id.
    pct_by_team: dict[str, float] = {}
    for team_scores in scores_by_event.values():
        total = len(team_scores)
        for team_id, score in team_scores.items():
            same_or_worse = sum(1 for s in team_scores.values() if s >= score)
            pct_by_team[team_id] = 100.0 * same_or_worse / total

    # Each player's per-event percentiles (one team per player per event).
    pcts_by_player: dict[str, list[float]] = {}
    for team_id, pct in pct_by_team.items():
        for player_id in players_by_team.get(team_id, ()):  # noqa: E501
            pcts_by_player.setdefault(player_id, []).append(pct)

    player_by_id = {p["player_id"]: p for p in players}
    rankings = []
    for player_id, pcts in pcts_by_player.items():
        p = player_by_id.get(player_id)
        if p is None or len(pcts) < RANKINGS_MIN_LEAGUES:
            continue
        rankings.append(
            {
                "player_id": player_id,
                "first_name": p["first_name"],
                "last_name": p["last_name"],
                "is_woman": bool(p["is_woman"]),
                "default_pool": p["default_pool"],
                "percentile": sum(pcts) / len(pcts),
                "leagues": len(pcts),
            }
        )

    # Best (highest) percentile first; break ties on more leagues, then name.
    rankings.sort(
        key=lambda r: (-r["percentile"], -r["leagues"], r["last_name"], r["first_name"])
    )

    # Standard competition ranking: equal percentiles share a rank.
    last_pct: float | None = None
    last_rank = 0
    for i, r in enumerate(rankings):
        if last_pct is not None and r["percentile"] == last_pct:
            r["rank"] = last_rank
        else:
            r["rank"] = i + 1
        last_pct = r["percentile"]
        last_rank = r["rank"]

    return {"version": version, "rankings": rankings}

"""Projection logic: fold events onto the read-model tables.

Pure with respect to the connection it's given — it never commits. Callers (live
command handling and replay) own the transaction. Used by both so the read model
and a rebuilt-from-log model are guaranteed identical.

Each aggregate has its own module (mirroring documentation/models/). A module
exposes a HANDLERS dict mapping event_type -> handler(conn, aggregate_id, payload,
created_at); this package merges them into one dispatch table. To add an
aggregate: create its module and add it to _MODULES below.
"""

import sqlite3

from . import card, card_request, closest_to_pin, league_event, player, registration, team

_MODULES = (player, league_event, registration, closest_to_pin, card_request, card, team)

_HANDLERS: dict = {}
for _module in _MODULES:
    _HANDLERS.update(_module.HANDLERS)

# All event types that have a registered projection handler. The command endpoint
# uses this to reject unknown event types.
KNOWN_EVENT_TYPES = frozenset(_HANDLERS)


def apply_event(
    conn: sqlite3.Connection,
    event_type: str,
    aggregate_id: str,
    payload: dict,
    created_at: str,
) -> None:
    handler = _HANDLERS.get(event_type)
    if handler is None:
        raise ValueError(f"Unknown event type: {event_type}")
    handler(conn, aggregate_id, payload, created_at)

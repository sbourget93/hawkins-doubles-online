# Backend
`backend/` houses the Python (FastAPI) application and the live SQLite database file
(`hawkins.db`) it runs against. It's an event-sourced, CQRS backend that validates
admin commands, projects them into a local SQLite read model, serves queries, and
continuously backs the event log up to S3. Google-based admin auth gates all writes.

## Stack

| Layer | Details |
| --- | --- |
| **API** | Python (FastAPI), served by Uvicorn (`uvicorn main:app`), handles API requests, processes commands, and queries the database. This code runs in a Docker container parallel to the frontend+nginx container. |
| **Database** | SQLite (stdlib `sqlite3`, no ORM) is the application database, serving as both the event store and the projection layer. If the database is lost, the event log can be restored from S3 and replayed to reconstruct all projections. |
| **Durability** | Boto3 syncs the event log to S3, the permanent backup that persists even if the EC2 instance fails. Projections are not backed up. Only the events are backed up, which are enough to rebuild state. |
| **Auth** | Google login verifies admins against an `ADMIN_EMAILS` allowlist, storing identity in a signed session cookie; `require_admin` gates writes and sensitive reads. Unset `GOOGLE_CLIENT_ID` (local dev) disables enforcement entirely. |

## Structure (`backend/`)

| File | Purpose |
| --- | --- |
| `db.py` | SQLite connection, schema defintions (append-only `events` store + projections + `sync_state` cursors), and `replay()` (rebuilds projections from the event log when they're empty). On startup, if the `events` table is empty it first restores the log from S3 (`s3_sync`) before replaying. Do not document column meanings with comments — this is already documented elsewhere in the repo. |
| `s3_sync.py` | Best-effort S3 backup of the event log, off the request path. A background thread uploads each new event as an immutable object keyed by seq, walking a contiguous `uploaded_through` cursor (stops at the first failed PUT so S3 never holds a gap); every 100-event block is compacted into one `agg-<start>-<end>.json` and the singles deleted. `restore_from_s3()` rebuilds the log on a fresh instance, deduped by seq and preserving the original seq. Disabled when `S3_BUCKET` is unset. |
| `projections/` | One module per aggregate (`player.py`, `league_event.py`), each exposing a `HANDLERS` map of `event_type -> handler(conn, aggregate_id, payload, created_at)`. `__init__.py` merges them into `apply_event()` (used by live commands and replay) and `KNOWN_EVENT_TYPES`. Add an aggregate: new module + add it to `_MODULES`. |
| `main.py` | FastAPI app with CQRS endpoints. |

## Endpoints & conventions
* **Routes have NO `/api` prefix.** nginx strips `/api` before proxying
  (`proxy_pass http://backend:8000/;`), so define routes as `/commands`, `/players`, etc.
* `POST /commands` (command): **aggregate-agnostic**, **admin-only**
  (`auth.require_admin` → 403 for non-admins; bypassed in local dev when Google login
  is unconfigured). Body `{ expected_version, events: [{ event_id, type, aggregate_id,
  data, created_at }] }`. Any `type` with a registered projection handler is accepted;
  handlers validate `data` (raise `ValueError` → 400). Rejects with `409
  {detail:{status:"conflict",version}}` when the log has advanced past
  `expected_version` by an event the batch is **not** resending
  (`db.stale_write_conflict`) — i.e. a genuinely stale write. A client resending
  its own un-acked events (server ahead only by ids present in the batch) is NOT a
  conflict. Batch is atomic; events are deduped by `event_id` (idempotent retry).
* Query endpoints (return data, never mutate): `GET /players`, `GET /league-events`
  (both `{ version, <rows> }`, non-deleted only), `GET /events?since=<seq>` (raw log
  for sync/replay). Query endpoints are open **except `GET /card-requests`**, which is
  admin-gated (`auth.require_admin` → 403) because the pairing data is sensitive; the
  frontend treats that 403 as an empty list.
* Projection tables carry the documented metadata (`created_at`, `updated_at`,
  `deleted_at`); soft-delete is `deleted_at IS NOT NULL` — never a boolean.
* Local DB file is `backend/hawkins.db` (gitignored, persists via the compose bind-mount).

## Database & Event Sourcing Architecture
* **Primary Event Store:** An append-only `events` table in local SQLite is the
  absolute, single source of truth. Events are never updated or deleted.
* **Expected Version:** When submitting offline events, the client includes the
  sequence number of the last event it synced. The write is rejected (409) only if
  the server has advanced past that seq by an event the client is **not** resending
  in this batch — the client must then discard its queued events and re-sync. The
  server being ahead purely because a prior batch from this same client committed
  but its ack was lost (so the client is resending those exact events, deduped by
  `event_id`) is not a conflict, so a dropped acknowledgement no longer invalidates
  the retry. This handles out-of-order writes from device failure and phone
  swapping, and replaces a last-write-wins policy. (See the root "Single Admin at a
  Time" constraint — the only legitimate reason the server is ahead is this
  client's own un-acked events, which is what lets the check stay this simple.)
* **CQRS:** Command endpoints (admin writes) accept data and return only success or
  failure. Query endpoints return data and never mutate. These concerns are strictly
  separated. Admin command workflows must not depend on query endpoints — all data
  needed to execute a command must already exist in local state.
* **Client-Generated IDs:** Clients generate UUIDs for all new entities before
  submitting a command. IDs are part of the event payload, never assigned by the
  server, enabling offline writes without a server round-trip.
* **Read Path (Projections):** Separate SQLite tables serve as the projection layer
  (read model). Immediately after an event is written, the server projects it into
  the relevant projection tables so subsequent read queries reflect updated state.

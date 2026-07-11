## Backend
`backend/` houses the Python (FastAPI) application that handles API requests, processes commands, and queries the SQLite database.

## FastAPI
* Python (FastAPI) is used to handle API requests, process commands, and query the SQLite database. Boto3 is used to sync event logs to S3. This code runs in a Docker container parallel to the frontend+nginx container.

* **Database**: SQLite is used as the application database, serving as both the event store and the projection layer. If the database is lost, the event log can be restored from S3 and replayed to reconstruct all projections.
* **Durability**: S3 serves as the permanent backup of the event log that will persist even if the EC2 instance running the application fails. While the projections are not backed up here, the events themselves are frequently synced so that application state may be rebuilt if the EC2 instance is lost or restarted.

## Structure
* `db.py`: SQLite connection, schema (append-only `events` store + projections + `sync_state` cursors), and `replay()` (rebuilds projections from the event log when they're empty). On startup, if the `events` table is empty it first restores the log from S3 (`s3_sync`) before replaying. Do not document column meanigs with comments. This is already documented elsewhere in the repo.
* `s3_sync.py`: best-effort S3 backup of the event log, off the request path. A background thread uploads each new event as an immutable object keyed by seq, walking a contiguous `uploaded_through` cursor (stops at the first failed PUT so S3 never holds a gap); every 100-event block is compacted into one `agg-<start>-<end>.json` and the singles deleted. `restore_from_s3()` rebuilds the log on a fresh instance, deduped by seq and preserving the original seq. Disabled when `S3_BUCKET` is unset.
* `projections/`: one module per aggregate (`player.py`, `league_event.py`), each exposing a `HANDLERS` map of `event_type -> handler(conn, aggregate_id, payload, created_at)`. `__init__.py` merges them into `apply_event()` (used by live commands and replay) and `KNOWN_EVENT_TYPES`. Add an aggregate: new module + add it to `_MODULES`.
* `main.py`: FastAPI app with CQRS endpoints.

## Endpoints & conventions
* **Routes have NO `/api` prefix.** nginx strips `/api` before proxying (`proxy_pass http://backend:8000/;`), so define routes as `/commands`, `/players`, etc.
* `POST /commands` (command): **aggregate-agnostic**. Body `{ expected_version, events: [{ event_id, type, aggregate_id, data, created_at }] }`. Any `type` with a registered projection handler is accepted; handlers validate `data` (raise `ValueError` → 400). Rejects with `409 {detail:{status:"conflict",version}}` if `expected_version` != server's max seq. Batch is atomic; events are deduped by `event_id` (idempotent retry).
* Query endpoints (return data, never mutate): `GET /players`, `GET /league-events` (both `{ version, <rows> }`, non-deleted only), `GET /events?since=<seq>` (raw log for sync/replay).
* Projection tables carry the documented metadata (`created_at`, `updated_at`, `deleted_at`); soft-delete is `deleted_at IS NOT NULL` — never a boolean.
* Local DB file is `backend/hawkins.db` (gitignored, persists via the compose bind-mount).

## Database & Event Sourcing Architecture
* **Primary Event Store:** An append-only `events` table in a local SQLite database is the absolute, single source of truth. Events are never updated or deleted.
* **Durability:** New events are frequently synced to S3. On a fresh instance, the event log is pulled from S3 and replayed to reconstruct all state.
* **Single Admin:** There is only ever one admin performing actions at a time, eliminating concurrent write conflicts.
* **Expected Version:** When submitting offline events, the client includes the sequence number of the last event it synced from the server. If the server's current sequence is higher, the write is rejected and the client must discard its queued events and re-sync from the server. This handles out-of-order writes caused by device failure and phone swapping, and replaces the need for a last-write-wins policy.
* **CQRS:** Command endpoints (admin writes) accept data and return only success or failure. Query endpoints return data and never mutate state. These concerns are strictly separated. Admin command workflows must not depend on query endpoints at any step — all data needed to execute a command must already exist in local state.
* **Client-Generated IDs:** Clients generate UUIDs for all new entities before submitting a command. IDs are part of the event payload, never assigned by the server, enabling offline writes without a server round-trip.
* **Read Path (Projections):** Separate SQLite tables serve as the projection layer (read model). Immediately after an event is written, the server projects it into the relevant projection tables so that subsequent read queries reflect updated state.

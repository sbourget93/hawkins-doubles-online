# Events

The `events` table is the append-only event log and the single source of truth for the whole application. It is never updated or deleted — new facts are only ever appended. Every projection table in this directory is rebuilt by replaying these events in `seq` order.

Writes go through the admin-only `/commands` endpoint: the client generates the events and posts a batch with an `expected_version`. The server accepts the batch only if `expected_version` matches the current max `seq`, otherwise it rejects with a 409 and the client re-syncs.

## Fields

| Field | Description |
| ----- | ----------- |
| `seq` | Server-assigned monotonic sequence number (autoincrement primary key). Defines global event order and doubles as the version used for the sync `expected_version` check. |
| `event_id` | Client-generated UUID that uniquely identifies the event. Acts as an idempotency key: re-posting an already-recorded event (e.g. a retry after a lost ack) is skipped, not duplicated. |
| `event_type` | The kind of event (e.g. player created, team assigned). Must have a registered projection handler (`KNOWN_EVENT_TYPES`) or the write is rejected. |
| `aggregate_id` | Client-generated UUID of the aggregate (player, league event, card, etc.) the event applies to. |
| `payload` | JSON blob of the event's data. Validated by the per-aggregate projection handler when applied; a rejected payload fails the whole batch. |

## Notes

- Backed up to S3 by a best-effort background loop; the local SQLite commit is the durable point (see [`backend/s3_sync.py`](../../backend/s3_sync.py)). Restored events keep their original `seq` so `expected_version` stays consistent.
- Because it is append-only, an entity is deleted by appending a deletion event, which sets `deleted_at` on the corresponding projection row.

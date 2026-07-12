/** Shared types for the local-first sync engine. */
import type { CommandEvent, SyncStatus } from '../api/commands'

export type { CommandEvent, SyncStatus }

/** The last server read model for one aggregate. */
export interface Snapshot<Row = unknown> {
  version: number
  rows: Row[]
}

/**
 * A batch of commands the server actively rejected (409 conflict or 4xx
 * validation). Kept for the admin to review and re-apply — never silently
 * dropped. `reason` distinguishes a stale queue (`conflict`) from an invalid
 * event (`rejected`, usually a bug).
 */
export interface DeadLetter {
  id: string
  events: CommandEvent[]
  reason: 'conflict' | 'rejected'
  detail?: string
  rejectedAt: string
}

/**
 * Everything the engine needs to manage one aggregate: how to load its server
 * snapshot, how to optimistically fold a queued event onto it, and a
 * human-readable label for the dead-letter review list. `reduce` must ignore
 * event types it doesn't own (return `rows` unchanged) — the engine folds the
 * whole global queue through every aggregate.
 */
export interface AggregateDescriptor<Row = unknown> {
  name: string
  eventTypes: readonly string[]
  fetch: () => Promise<Snapshot<Row>>
  reduce: (rows: Row[], event: CommandEvent) => Row[]
  describe: (event: CommandEvent) => string
}

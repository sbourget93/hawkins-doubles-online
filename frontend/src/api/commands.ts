import { newId } from '../lib/uuid'

/**
 * Shared command plumbing for the event-sourced backend. Every aggregate submits
 * the same generic event shape to POST /commands; per-aggregate stores build the
 * events and own their own read models.
 *
 * nginx routes /api to the backend in both dev and prod, so relative URLs work.
 */

/** A command event. Aggregate-agnostic — the backend routes by `type`. */
export interface CommandEvent {
  event_id: string
  type: string
  aggregate_id: string
  data?: Record<string, unknown>
  created_at: string
}

export interface CommandOk {
  status: 'ok'
  version: number
}

/** Sync state shared by the online stores. `conflict`/`offline` are surfaced in the UI. */
export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'conflict'

/** Build a client-generated command event (ids + timestamp filled in). */
export function newEvent(
  type: string,
  aggregateId: string,
  data?: Record<string, unknown>,
): CommandEvent {
  return {
    event_id: newId(),
    type,
    aggregate_id: aggregateId,
    data,
    created_at: new Date().toISOString(),
  }
}

/** Raised when the server rejects a command because the client is out of date. */
export class ConflictError extends Error {
  version: number
  constructor(version: number) {
    super('version conflict')
    this.name = 'ConflictError'
    this.version = version
  }
}

/** Submit events as a command. Resolves on success, throws ConflictError on 409. */
export async function postCommands(
  expectedVersion: number,
  events: CommandEvent[],
): Promise<CommandOk> {
  const res = await fetch('/api/commands', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_version: expectedVersion, events }),
  })

  if (res.status === 409) {
    const body = await res.json().catch(() => null)
    throw new ConflictError(body?.detail?.version ?? expectedVersion)
  }
  if (!res.ok) {
    throw new Error(`command failed: ${res.status}`)
  }
  return (await res.json()) as CommandOk
}

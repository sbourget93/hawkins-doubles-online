import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  ConflictError,
  RejectedError,
  newEvent,
  postCommands,
  type CommandEvent,
  type SyncStatus,
} from '../api/commands'
import { newId } from '../lib/uuid'
import * as db from './db'
import type { AggregateDescriptor, DeadLetter, Snapshot } from './types'

/**
 * Local-first sync engine.
 *
 * Every mutation is applied to the local read model and enqueued synchronously —
 * writes never wait on the network, so the UI runs at local speed whether online
 * or not. A background loop drains the queue to POST /commands as one atomic
 * batch (`expected_version` = the last synced server seq). On success it refetches
 * the authoritative snapshots and clears the flushed events. A rejection (409
 * conflict or 4xx) resets local state to the server and moves the batch to the
 * dead-letter list for review; a network failure leaves the queue to retry.
 *
 * The queue and version are global (the server has a single sequence). Each
 * aggregate contributes only a snapshot + a reducer; the rendered rows are
 * `snapshot folded through the queue` (see useAggregateRows).
 */

const PAUSED_KEY = 'hawkins.sync.paused'
const RETRY_INTERVAL_MS = 15000

interface EngineState {
  snapshots: Record<string, Snapshot>
  queue: CommandEvent[]
  deadLetter: DeadLetter[]
  version: number
  syncStatus: SyncStatus
  paused: boolean
  loaded: boolean
}

interface SyncContextValue {
  syncStatus: SyncStatus
  pendingCount: number
  deadLetter: DeadLetter[]
  paused: boolean
  loaded: boolean
  enqueue: (events: CommandEvent[]) => void
  setPaused: (paused: boolean) => void
  syncNow: () => void
  dismissDeadLetter: (id: string) => void
  retryDeadLetter: (id: string) => void
  describe: (event: CommandEvent) => string
  testReject: () => void
  testConflict: () => void
  // Internal: consumed by useAggregateRows.
  snapshots: Record<string, Snapshot>
  queue: CommandEvent[]
  aggregatesByName: Record<string, AggregateDescriptor>
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined)

interface FlushOptions {
  /** Bypass the pause guard (used by the test tools). */
  force?: boolean
  /** Override the expected_version sent to the server (used to force a 409). */
  versionOverride?: number
}

export function SyncProvider({
  aggregates,
  children,
}: {
  // Descriptors vary in their Row type; the engine treats rows opaquely, so the
  // heterogeneous array is typed loosely here.
  aggregates: AggregateDescriptor<any>[]
  children: ReactNode
}) {
  const { byName, byType } = useMemo(() => {
    const byName: Record<string, AggregateDescriptor> = {}
    const byType: Record<string, AggregateDescriptor> = {}
    for (const a of aggregates) {
      byName[a.name] = a
      for (const t of a.eventTypes) byType[t] = a
    }
    return { byName, byType }
  }, [aggregates])

  const [state, setState] = useState<EngineState>(() => ({
    snapshots: {},
    queue: [],
    deadLetter: [],
    version: 0,
    syncStatus: 'idle',
    paused: sessionStorage.getItem(PAUSED_KEY) === '1',
    loaded: false,
  }))

  // Mirror of committed state for synchronous reads inside async callbacks (so a
  // flush fired right after an enqueue sees the just-added event).
  const ref = useRef(state)
  const flushingRef = useRef(false)
  const flushRef = useRef<(opts?: FlushOptions) => Promise<void>>(async () => {})

  /** Commit new state and persist the mutable slots. */
  const commit = useCallback((patch: Partial<EngineState>) => {
    const next = { ...ref.current, ...patch }
    ref.current = next
    setState(next)
    if (next.loaded) {
      void db.saveQueue(next.queue)
      void db.saveDeadLetter(next.deadLetter)
      void db.saveVersion(next.version)
    }
  }, [])

  /** Refetch every aggregate's snapshot. Returns the fresh map + version, or null if offline. */
  const fetchSnapshots = useCallback(async (): Promise<{
    snapshots: Record<string, Snapshot>
    version: number
  } | null> => {
    try {
      const results = await Promise.all(
        aggregates.map(async (a) => [a.name, await a.fetch()] as const),
      )
      const snapshots: Record<string, Snapshot> = { ...ref.current.snapshots }
      let version = 0
      for (const [name, snap] of results) {
        snapshots[name] = snap
        version = Math.max(version, snap.version)
        void db.saveSnapshot(name, snap)
      }
      return { snapshots, version }
    } catch {
      return null
    }
  }, [aggregates])

  const flush = useCallback(
    async (opts: FlushOptions = {}) => {
      const s = ref.current
      if (flushingRef.current || !s.loaded) return
      if (s.paused && !opts.force) return
      if (s.queue.length === 0) return

      flushingRef.current = true
      const batch = s.queue
      const batchIds = new Set(batch.map((e) => e.event_id))
      const expected = opts.versionOverride ?? s.version
      commit({ syncStatus: 'syncing' })
      try {
        const res = await postCommands(expected, batch)
        // Success: adopt the authoritative snapshots and drop the flushed events
        // in one commit so the fold never double-applies.
        const fresh = await fetchSnapshots()
        const remaining = ref.current.queue.filter((e) => !batchIds.has(e.event_id))
        commit({
          snapshots: fresh?.snapshots ?? ref.current.snapshots,
          version: res.version,
          queue: remaining,
          syncStatus: 'idle',
        })
        if (remaining.length > 0) void flushRef.current()
      } catch (err) {
        if (err instanceof ConflictError || err instanceof RejectedError) {
          // Permanent rejection: reset local to server truth and dead-letter the
          // batch for review rather than dropping it silently.
          const reason = err instanceof ConflictError ? 'conflict' : 'rejected'
          const detail =
            err instanceof RejectedError ? err.detail : `server advanced to version ${err.version}`
          if (reason === 'rejected') console.error('command dead-lettered (rejected):', detail)
          const fresh = await fetchSnapshots()
          const entry: DeadLetter = {
            id: newId(),
            events: batch,
            reason,
            detail,
            rejectedAt: new Date().toISOString(),
          }
          const remaining = ref.current.queue.filter((e) => !batchIds.has(e.event_id))
          commit({
            snapshots: fresh?.snapshots ?? ref.current.snapshots,
            version: fresh?.version ?? ref.current.version,
            queue: remaining,
            deadLetter: [...ref.current.deadLetter, entry],
            syncStatus: 'idle',
          })
        } else {
          // Unreachable / 5xx: keep the queue and retry later.
          commit({ syncStatus: 'offline' })
        }
      } finally {
        flushingRef.current = false
      }
    },
    [commit, fetchSnapshots],
  )
  flushRef.current = flush

  const refresh = useCallback(async () => {
    const fresh = await fetchSnapshots()
    if (fresh) commit({ snapshots: fresh.snapshots, version: fresh.version })
  }, [commit, fetchSnapshots])

  // Boot: hydrate from IndexedDB (instant, offline-capable), then reconcile with
  // the server and flush anything pending.
  useEffect(() => {
    let alive = true
    void (async () => {
      const loaded = await db.loadState(aggregates.map((a) => a.name))
      if (!alive) return
      commit({ ...loaded, loaded: true })
      await refresh()
      void flushRef.current()
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Flush on reconnect and on a slow retry timer (covers offline → online with no
  // `online` event, e.g. a flaky connection that never fully dropped).
  useEffect(() => {
    const onOnline = () => void flushRef.current()
    window.addEventListener('online', onOnline)
    const id = window.setInterval(() => {
      if (ref.current.queue.length > 0 && !ref.current.paused) void flushRef.current()
    }, RETRY_INTERVAL_MS)
    return () => {
      window.removeEventListener('online', onOnline)
      window.clearInterval(id)
    }
  }, [])

  const enqueue = useCallback(
    (events: CommandEvent[]) => {
      commit({ queue: [...ref.current.queue, ...events] })
      if (!ref.current.paused) void flushRef.current()
    },
    [commit],
  )

  const setPaused = useCallback(
    (paused: boolean) => {
      sessionStorage.setItem(PAUSED_KEY, paused ? '1' : '0')
      commit({ paused })
      if (!paused) void flushRef.current()
    },
    [commit],
  )

  const syncNow = useCallback(() => {
    if (ref.current.queue.length > 0) void flushRef.current({ force: true })
    else void refresh()
  }, [refresh])

  const dismissDeadLetter = useCallback(
    (id: string) => {
      commit({ deadLetter: ref.current.deadLetter.filter((d) => d.id !== id) })
    },
    [commit],
  )

  const retryDeadLetter = useCallback(
    (id: string) => {
      const entry = ref.current.deadLetter.find((d) => d.id === id)
      if (!entry) return
      commit({
        queue: [...ref.current.queue, ...entry.events],
        deadLetter: ref.current.deadLetter.filter((d) => d.id !== id),
      })
      if (!ref.current.paused) void flushRef.current()
    },
    [commit],
  )

  const describe = useCallback(
    (event: CommandEvent) => byType[event.type]?.describe(event) ?? event.type,
    [byType],
  )

  // Test tools: queue a synthetic event the server is guaranteed to reject, then
  // force a flush past the pause guard. An unknown event type 400s (no reducer
  // touches it, so no bogus optimistic row); a stale expected_version 409s.
  const testReject = useCallback(() => {
    commit({ queue: [...ref.current.queue, newEvent('__TestReject__', newId(), { note: 'test 400' })] })
    void flushRef.current({ force: true })
  }, [commit])

  const testConflict = useCallback(() => {
    commit({ queue: [...ref.current.queue, newEvent('__TestConflict__', newId(), { note: 'test 409' })] })
    void flushRef.current({ force: true, versionOverride: ref.current.version - 1 })
  }, [commit])

  const value = useMemo<SyncContextValue>(
    () => ({
      syncStatus: state.syncStatus,
      pendingCount: state.queue.length,
      deadLetter: state.deadLetter,
      paused: state.paused,
      loaded: state.loaded,
      enqueue,
      setPaused,
      syncNow,
      dismissDeadLetter,
      retryDeadLetter,
      describe,
      testReject,
      testConflict,
      snapshots: state.snapshots,
      queue: state.queue,
      aggregatesByName: byName,
    }),
    [
      state,
      enqueue,
      setPaused,
      syncNow,
      dismissDeadLetter,
      retryDeadLetter,
      describe,
      testReject,
      testConflict,
      byName,
    ],
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext)
  if (ctx === undefined) {
    throw new Error('useSync must be used within a SyncProvider')
  }
  return ctx
}

/** The rendered rows for an aggregate: its server snapshot with the pending queue folded on top. */
export function useAggregateRows<Row>(name: string): Row[] {
  const { snapshots, queue, aggregatesByName } = useSync()
  return useMemo(() => {
    const snap = snapshots[name]
    if (!snap) return []
    const desc = aggregatesByName[name]
    if (!desc) return snap.rows as Row[]
    return queue.reduce((rows, ev) => desc.reduce(rows, ev), snap.rows) as Row[]
  }, [snapshots, queue, name, aggregatesByName])
}

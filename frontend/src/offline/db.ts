/**
 * Tiny promise wrapper over IndexedDB — the local-first persistence layer.
 *
 * Deliberately dependency-free (the app keeps a lean package.json). Two object
 * stores:
 *  - `kv`: single-record slots for the global queue, the dead-letter list, and
 *    the last-synced server version.
 *  - `snapshots`: the last server read model per aggregate, keyed by name.
 *
 * The rendered UI is always `snapshot + queue folded on top`, so both survive a
 * reload and the app boots offline from whatever was last persisted.
 */
import type { CommandEvent, DeadLetter, Snapshot } from './types'

const DB_NAME = 'hawkins-offline'
const DB_VERSION = 1
const KV = 'kv'
const SNAPSHOTS = 'snapshots'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV)
      if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function getDb(): Promise<IDBDatabase> {
  return (dbPromise ??= openDb())
}

function asPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await getDb()
  return asPromise(db.transaction(KV).objectStore(KV).get(key) as IDBRequest<T | undefined>)
}

async function kvPut(key: string, value: unknown): Promise<void> {
  const db = await getDb()
  await asPromise(db.transaction(KV, 'readwrite').objectStore(KV).put(value, key))
}

/** The full persisted state (used once on boot). Missing slots default empty. */
export async function loadState(names: string[]): Promise<{
  queue: CommandEvent[]
  deadLetter: DeadLetter[]
  version: number
  snapshots: Record<string, Snapshot>
}> {
  const db = await getDb()
  const snapStore = db.transaction(SNAPSHOTS).objectStore(SNAPSHOTS)
  const [queue, deadLetter, version, ...snaps] = await Promise.all([
    kvGet<CommandEvent[]>('queue'),
    kvGet<DeadLetter[]>('deadLetter'),
    kvGet<number>('version'),
    ...names.map((n) => asPromise(snapStore.get(n) as IDBRequest<Snapshot | undefined>)),
  ])
  const snapshots: Record<string, Snapshot> = {}
  names.forEach((n, i) => {
    if (snaps[i]) snapshots[n] = snaps[i] as Snapshot
  })
  return {
    queue: queue ?? [],
    deadLetter: deadLetter ?? [],
    version: version ?? 0,
    snapshots,
  }
}

export function saveQueue(queue: CommandEvent[]): Promise<void> {
  return kvPut('queue', queue)
}

export function saveDeadLetter(deadLetter: DeadLetter[]): Promise<void> {
  return kvPut('deadLetter', deadLetter)
}

export function saveVersion(version: number): Promise<void> {
  return kvPut('version', version)
}

export async function saveSnapshot(name: string, snapshot: Snapshot): Promise<void> {
  const db = await getDb()
  await asPromise(db.transaction(SNAPSHOTS, 'readwrite').objectStore(SNAPSHOTS).put(snapshot, name))
}

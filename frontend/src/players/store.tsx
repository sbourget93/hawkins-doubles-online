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
  newEvent,
  postCommands,
  type CommandEvent,
  type SyncStatus,
} from '../api/commands'
import { fetchPlayers } from '../api/players'
import { newId } from '../lib/uuid'
import type { Player, PlayerFields } from './types'

export type { SyncStatus }

/**
 * Online-only player store.
 *
 * The server (via the event-sourced command API) is the single source of truth:
 * the roster is loaded from GET /players, and each mutation POSTs a command and
 * then refreshes from the server. There is no local queue or persistence yet —
 * writes require connectivity.
 *
 * The public `usePlayers()` interface is intentionally identical to what an
 * offline-capable store would expose (e.g. `pendingCount`, `syncStatus`), so an
 * offline engine can later be dropped in behind this hook without touching any
 * component. `pendingCount` is always 0 today.
 */

interface PlayersContextValue {
  players: Player[]
  pendingCount: number
  syncStatus: SyncStatus
  addPlayer: (fields: PlayerFields) => void
  editPlayer: (playerId: string, fields: PlayerFields) => void
  deletePlayer: (playerId: string) => void
  sync: () => void
}

const PlayersContext = createContext<PlayersContextValue | undefined>(undefined)

export function PlayersProvider({ children }: { children: ReactNode }) {
  const [players, setPlayers] = useState<Player[]>([])
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')

  // Latest server version — the expected_version for the next command. Held in a
  // ref so async callbacks never read a stale value.
  const versionRef = useRef(0)

  const refresh = useCallback(async () => {
    setSyncStatus('syncing')
    try {
      const res = await fetchPlayers()
      versionRef.current = res.version
      setPlayers(res.players)
      setSyncStatus('idle')
    } catch {
      setSyncStatus('offline')
    }
  }, [])

  const submit = useCallback(
    async (event: CommandEvent) => {
      setSyncStatus('syncing')
      try {
        try {
          const res = await postCommands(versionRef.current, [event])
          versionRef.current = res.version
        } catch (err) {
          if (err instanceof ConflictError) {
            // Another writer advanced the server. Resync to the current version
            // and retry once (rare with a single admin).
            const latest = await fetchPlayers()
            versionRef.current = latest.version
            const res = await postCommands(versionRef.current, [event])
            versionRef.current = res.version
          } else {
            throw err
          }
        }
        await refresh()
      } catch {
        // Write failed (offline / server error). With no local queue yet the
        // change is dropped; resync so the UI still matches the server.
        setSyncStatus('offline')
      }
    },
    [refresh],
  )

  const addPlayer = useCallback(
    (fields: PlayerFields) => void submit(newEvent('PlayerAdded', newId(), { ...fields })),
    [submit],
  )
  const editPlayer = useCallback(
    (playerId: string, fields: PlayerFields) =>
      void submit(newEvent('PlayerEdited', playerId, { ...fields })),
    [submit],
  )
  const deletePlayer = useCallback(
    (playerId: string) => void submit(newEvent('PlayerDeleted', playerId)),
    [submit],
  )

  // Load on mount and when connectivity returns.
  useEffect(() => {
    void refresh()
    const onOnline = () => void refresh()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [refresh])

  const value = useMemo<PlayersContextValue>(
    () => ({
      players,
      pendingCount: 0,
      syncStatus,
      addPlayer,
      editPlayer,
      deletePlayer,
      sync: () => void refresh(),
    }),
    [players, syncStatus, addPlayer, editPlayer, deletePlayer, refresh],
  )

  return <PlayersContext.Provider value={value}>{children}</PlayersContext.Provider>
}

export function usePlayers(): PlayersContextValue {
  const ctx = useContext(PlayersContext)
  if (ctx === undefined) {
    throw new Error('usePlayers must be used within a PlayersProvider')
  }
  return ctx
}

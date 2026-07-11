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
import { fetchClosestToPins } from '../api/closestToPins'
import { newId } from '../lib/uuid'
import type { ClosestToPin } from './types'

/**
 * Online-only closest-to-pin store (app-wide provider). Holds every non-deleted
 * CTP across all league events; a league event's detail page filters this list
 * by its own id. Each mutation POSTs a command then refreshes — the same online
 * flow as the player, league-event, and registration stores.
 */

interface ClosestToPinsContextValue {
  closestToPins: ClosestToPin[]
  loaded: boolean
  syncStatus: SyncStatus
  addClosestToPin: (leagueEventId: string, holeNumber: number, prize: string) => void
  editClosestToPin: (closestToPinId: string, holeNumber: number, prize: string) => void
  removeClosestToPin: (closestToPinId: string) => void
}

const ClosestToPinsContext = createContext<ClosestToPinsContextValue | undefined>(undefined)

export function ClosestToPinsProvider({ children }: { children: ReactNode }) {
  const [closestToPins, setClosestToPins] = useState<ClosestToPin[]>([])
  const [loaded, setLoaded] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')

  // Latest server version — the expected_version for the next command.
  const versionRef = useRef(0)

  const refresh = useCallback(async () => {
    setSyncStatus('syncing')
    try {
      const res = await fetchClosestToPins()
      versionRef.current = res.version
      setClosestToPins(res.closest_to_pins)
      setSyncStatus('idle')
    } catch {
      setSyncStatus('offline')
    } finally {
      setLoaded(true)
    }
  }, [])

  // Submits one or more events as a single atomic command (all-or-nothing).
  const submit = useCallback(
    async (events: CommandEvent[]) => {
      setSyncStatus('syncing')
      try {
        try {
          const res = await postCommands(versionRef.current, events)
          versionRef.current = res.version
        } catch (err) {
          if (err instanceof ConflictError) {
            const latest = await fetchClosestToPins()
            versionRef.current = latest.version
            const res = await postCommands(versionRef.current, events)
            versionRef.current = res.version
          } else {
            throw err
          }
        }
        await refresh()
      } catch {
        setSyncStatus('offline')
      }
    },
    [refresh],
  )

  const addClosestToPin = useCallback(
    (leagueEventId: string, holeNumber: number, prize: string) =>
      void submit([
        newEvent('ClosestToPinCreated', newId(), {
          league_event_id: leagueEventId,
          hole_number: holeNumber,
          prize,
        }),
      ]),
    [submit],
  )
  const editClosestToPin = useCallback(
    (closestToPinId: string, holeNumber: number, prize: string) =>
      void submit([
        newEvent('ClosestToPinEdited', closestToPinId, {
          hole_number: holeNumber,
          prize,
        }),
      ]),
    [submit],
  )
  const removeClosestToPin = useCallback(
    (closestToPinId: string) =>
      void submit([newEvent('ClosestToPinDeleted', closestToPinId)]),
    [submit],
  )

  useEffect(() => {
    void refresh()
    const onOnline = () => void refresh()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [refresh])

  const value = useMemo<ClosestToPinsContextValue>(
    () => ({
      closestToPins,
      loaded,
      syncStatus,
      addClosestToPin,
      editClosestToPin,
      removeClosestToPin,
    }),
    [closestToPins, loaded, syncStatus, addClosestToPin, editClosestToPin, removeClosestToPin],
  )

  return (
    <ClosestToPinsContext.Provider value={value}>{children}</ClosestToPinsContext.Provider>
  )
}

export function useClosestToPins(): ClosestToPinsContextValue {
  const ctx = useContext(ClosestToPinsContext)
  if (ctx === undefined) {
    throw new Error('useClosestToPins must be used within a ClosestToPinsProvider')
  }
  return ctx
}

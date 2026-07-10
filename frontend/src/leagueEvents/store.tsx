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
import { fetchLeagueEvents } from '../api/leagueEvents'
import { newId } from '../lib/uuid'
import type { LeagueEvent, LeagueEventState } from './types'

/**
 * Online-only league-event store (app-wide provider). Holds the list of league
 * nights; both the list page and a single night's detail page read from it, so
 * the detail page needs no separate fetch. Each mutation POSTs a command then
 * refreshes — same online flow as the player store. The shared
 * submit/refresh/conflict logic will be unified into a generic engine when
 * offline support is added.
 */

interface LeagueEventsContextValue {
  leagueEvents: LeagueEvent[]
  loaded: boolean
  syncStatus: SyncStatus
  refresh: () => Promise<void>
  createLeagueEvent: (date: string) => void
  setLeagueEventState: (leagueEventId: string, state: LeagueEventState) => void
  deleteLeagueEvent: (leagueEventId: string) => void
}

const LeagueEventsContext = createContext<LeagueEventsContextValue | undefined>(undefined)

export function LeagueEventsProvider({ children }: { children: ReactNode }) {
  const [leagueEvents, setLeagueEvents] = useState<LeagueEvent[]>([])
  const [loaded, setLoaded] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')

  // Latest server version — the expected_version for the next command.
  const versionRef = useRef(0)

  const refresh = useCallback(async () => {
    setSyncStatus('syncing')
    try {
      const res = await fetchLeagueEvents()
      versionRef.current = res.version
      setLeagueEvents(res.league_events)
      setSyncStatus('idle')
    } catch {
      setSyncStatus('offline')
    } finally {
      setLoaded(true)
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
            const latest = await fetchLeagueEvents()
            versionRef.current = latest.version
            const res = await postCommands(versionRef.current, [event])
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

  const createLeagueEvent = useCallback(
    (date: string) => void submit(newEvent('LeagueEventCreated', newId(), { date })),
    [submit],
  )
  const setLeagueEventState = useCallback(
    (leagueEventId: string, state: LeagueEventState) =>
      void submit(newEvent('LeagueEventStateChanged', leagueEventId, { state })),
    [submit],
  )
  const deleteLeagueEvent = useCallback(
    (leagueEventId: string) => void submit(newEvent('LeagueEventDeleted', leagueEventId)),
    [submit],
  )

  useEffect(() => {
    void refresh()
    const onOnline = () => void refresh()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [refresh])

  const value = useMemo<LeagueEventsContextValue>(
    () => ({
      leagueEvents,
      loaded,
      syncStatus,
      refresh,
      createLeagueEvent,
      setLeagueEventState,
      deleteLeagueEvent,
    }),
    [
      leagueEvents,
      loaded,
      syncStatus,
      refresh,
      createLeagueEvent,
      setLeagueEventState,
      deleteLeagueEvent,
    ],
  )

  return <LeagueEventsContext.Provider value={value}>{children}</LeagueEventsContext.Provider>
}

export function useLeagueEvents(): LeagueEventsContextValue {
  const ctx = useContext(LeagueEventsContext)
  if (ctx === undefined) {
    throw new Error('useLeagueEvents must be used within a LeagueEventsProvider')
  }
  return ctx
}

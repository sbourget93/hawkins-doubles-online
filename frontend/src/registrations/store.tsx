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
import { fetchRegistrations } from '../api/registrations'
import { newId } from '../lib/uuid'
import type { Registration } from './types'

/**
 * Online-only registration store (app-wide provider). Holds every non-deleted
 * registration across all league events; a league event's detail page filters
 * this list by its own id. Each mutation POSTs a command then refreshes — the
 * same online flow as the player and league-event stores. New registrations
 * start unpaid; `setPaid` toggles it when the player pays.
 */

interface RegistrationsContextValue {
  registrations: Registration[]
  loaded: boolean
  syncStatus: SyncStatus
  refresh: () => Promise<void>
  registerPlayer: (leagueEventId: string, playerId: string) => void
  setPaid: (registrationId: string, isPaid: boolean) => void
  unregister: (registrationId: string) => void
  createAndRegisterPlayer: (
    leagueEventId: string,
    player: { first_name: string; last_name: string; default_pool: string; is_woman: boolean },
  ) => Promise<void>
}

const RegistrationsContext = createContext<RegistrationsContextValue | undefined>(undefined)

export function RegistrationsProvider({ children }: { children: ReactNode }) {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [loaded, setLoaded] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')

  // Latest server version — the expected_version for the next command.
  const versionRef = useRef(0)

  const refresh = useCallback(async () => {
    setSyncStatus('syncing')
    try {
      const res = await fetchRegistrations()
      versionRef.current = res.version
      setRegistrations(res.registrations)
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
            const latest = await fetchRegistrations()
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

  const registerPlayer = useCallback(
    (leagueEventId: string, playerId: string) =>
      void submit([
        newEvent('RegistrationAdded', newId(), {
          league_event_id: leagueEventId,
          player_id: playerId,
        }),
      ]),
    [submit],
  )
  const setPaid = useCallback(
    (registrationId: string, isPaid: boolean) =>
      void submit([newEvent('RegistrationPaidChanged', registrationId, { is_paid: isPaid })]),
    [submit],
  )
  const unregister = useCallback(
    (registrationId: string) => void submit([newEvent('RegistrationRemoved', registrationId)]),
    [submit],
  )
  // Create a brand-new player and register them into the event in one atomic
  // command. Returns the submit promise so the caller can refresh the roster
  // afterwards.
  const createAndRegisterPlayer = useCallback(
    (
      leagueEventId: string,
      player: { first_name: string; last_name: string; default_pool: string; is_woman: boolean },
    ) => {
      const playerId = newId()
      return submit([
        newEvent('PlayerAdded', playerId, { ...player }),
        newEvent('RegistrationAdded', newId(), {
          league_event_id: leagueEventId,
          player_id: playerId,
        }),
      ])
    },
    [submit],
  )

  useEffect(() => {
    void refresh()
    const onOnline = () => void refresh()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [refresh])

  const value = useMemo<RegistrationsContextValue>(
    () => ({
      registrations,
      loaded,
      syncStatus,
      refresh,
      registerPlayer,
      setPaid,
      unregister,
      createAndRegisterPlayer,
    }),
    [
      registrations,
      loaded,
      syncStatus,
      refresh,
      registerPlayer,
      setPaid,
      unregister,
      createAndRegisterPlayer,
    ],
  )

  return (
    <RegistrationsContext.Provider value={value}>{children}</RegistrationsContext.Provider>
  )
}

export function useRegistrations(): RegistrationsContextValue {
  const ctx = useContext(RegistrationsContext)
  if (ctx === undefined) {
    throw new Error('useRegistrations must be used within a RegistrationsProvider')
  }
  return ctx
}

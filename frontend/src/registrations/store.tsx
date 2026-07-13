import { newEvent, type SyncStatus } from '../api/commands'
import { useAggregateRows, useSync } from '../offline/SyncEngine'
import { newId } from '../lib/uuid'
import type { Registration } from './types'

/**
 * Registration store — a thin local-first view over the sync engine. Holds every
 * non-deleted registration across events; a detail page filters by its own id.
 * `createAndRegisterPlayer` enqueues a two-event batch (PlayerCreated +
 * RegistrationCreated); the engine folds each through its own aggregate, so both
 * the roster and the registration list update at once. Public shape unchanged.
 */

interface RegistrationsValue {
  registrations: Registration[]
  loaded: boolean
  syncStatus: SyncStatus
  refresh: () => Promise<void>
  registerPlayer: (leagueEventId: string, playerId: string) => void
  setPaid: (registrationId: string, isPaid: boolean) => void
  setPoolOverride: (registrationId: string, poolOverride: string | null) => void
  unregister: (registrationId: string) => void
  createAndRegisterPlayer: (
    leagueEventId: string,
    player: { first_name: string; last_name: string; default_pool: string; is_woman: boolean },
  ) => Promise<void>
}

export function useRegistrations(): RegistrationsValue {
  const { enqueue, loaded, syncStatus, refresh } = useSync()
  const registrations = useAggregateRows<Registration>('registrations')

  return {
    registrations,
    loaded,
    syncStatus,
    refresh,
    registerPlayer: (leagueEventId, playerId) =>
      enqueue([
        newEvent('RegistrationCreated', newId(), {
          league_event_id: leagueEventId,
          player_id: playerId,
        }),
      ]),
    setPaid: (registrationId, isPaid) =>
      enqueue([newEvent('RegistrationPaidChanged', registrationId, { is_paid: isPaid })]),
    setPoolOverride: (registrationId, poolOverride) =>
      enqueue([
        newEvent('RegistrationPoolOverrideChanged', registrationId, {
          pool_override: poolOverride,
        }),
      ]),
    unregister: (registrationId) =>
      enqueue([newEvent('RegistrationDeleted', registrationId)]),
    createAndRegisterPlayer: async (leagueEventId, player) => {
      const playerId = newId()
      enqueue([
        newEvent('PlayerCreated', playerId, { ...player }),
        newEvent('RegistrationCreated', newId(), {
          league_event_id: leagueEventId,
          player_id: playerId,
        }),
      ])
    },
  }
}

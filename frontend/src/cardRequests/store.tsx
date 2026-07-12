import { newEvent, type SyncStatus } from '../api/commands'
import { useAggregateRows, useSync } from '../offline/SyncEngine'
import { newId } from '../lib/uuid'
import type { CardRequest, RequestType } from './types'

/**
 * Card-request store — a thin local-first view over the sync engine. Holds every
 * non-deleted card request across events; a detail page filters by its own id.
 * A request links two players (not registrations) so it can be entered before
 * either player has registered.
 */

interface CardRequestsValue {
  cardRequests: CardRequest[]
  loaded: boolean
  syncStatus: SyncStatus
  addCardRequest: (
    leagueEventId: string,
    playerIdA: string,
    playerIdB: string,
    requestType: RequestType,
  ) => void
  editCardRequest: (
    cardRequestId: string,
    playerIdA: string,
    playerIdB: string,
    requestType: RequestType,
  ) => void
  removeCardRequest: (cardRequestId: string) => void
}

export function useCardRequests(): CardRequestsValue {
  const { enqueue, loaded, syncStatus } = useSync()
  const cardRequests = useAggregateRows<CardRequest>('cardRequests')

  return {
    cardRequests,
    loaded,
    syncStatus,
    addCardRequest: (leagueEventId, playerIdA, playerIdB, requestType) =>
      enqueue([
        newEvent('CardRequestCreated', newId(), {
          league_event_id: leagueEventId,
          player_id_a: playerIdA,
          player_id_b: playerIdB,
          request_type: requestType,
        }),
      ]),
    editCardRequest: (cardRequestId, playerIdA, playerIdB, requestType) =>
      enqueue([
        newEvent('CardRequestEdited', cardRequestId, {
          player_id_a: playerIdA,
          player_id_b: playerIdB,
          request_type: requestType,
        }),
      ]),
    removeCardRequest: (cardRequestId) =>
      enqueue([newEvent('CardRequestDeleted', cardRequestId)]),
  }
}

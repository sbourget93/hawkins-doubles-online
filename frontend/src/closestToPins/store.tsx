import { newEvent, type SyncStatus } from '../api/commands'
import { useAggregateRows, useSync } from '../offline/SyncEngine'
import { newId } from '../lib/uuid'
import type { ClosestToPin } from './types'

/**
 * Closest-to-pin store — a thin local-first view over the sync engine. Holds
 * every non-deleted CTP across events; a detail page filters by its own id.
 * Public shape unchanged from the old online store.
 */

interface ClosestToPinsValue {
  closestToPins: ClosestToPin[]
  loaded: boolean
  syncStatus: SyncStatus
  addClosestToPin: (leagueEventId: string, holeNumber: number, prize: string) => void
  editClosestToPin: (closestToPinId: string, holeNumber: number, prize: string) => void
  removeClosestToPin: (closestToPinId: string) => void
}

export function useClosestToPins(): ClosestToPinsValue {
  const { enqueue, loaded, syncStatus } = useSync()
  const closestToPins = useAggregateRows<ClosestToPin>('closestToPins')

  return {
    closestToPins,
    loaded,
    syncStatus,
    addClosestToPin: (leagueEventId, holeNumber, prize) =>
      enqueue([
        newEvent('ClosestToPinCreated', newId(), {
          league_event_id: leagueEventId,
          hole_number: holeNumber,
          prize,
        }),
      ]),
    editClosestToPin: (closestToPinId, holeNumber, prize) =>
      enqueue([
        newEvent('ClosestToPinEdited', closestToPinId, { hole_number: holeNumber, prize }),
      ]),
    removeClosestToPin: (closestToPinId) =>
      enqueue([newEvent('ClosestToPinDeleted', closestToPinId)]),
  }
}

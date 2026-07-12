import { newEvent } from '../api/commands'
import { useSync, useAggregateRows } from '../offline/SyncEngine'
import { newId } from '../lib/uuid'
import type { Player, PlayerFields } from './types'
import type { SyncStatus } from '../api/commands'

export type { SyncStatus }

/**
 * Player store — a thin local-first view over the sync engine.
 *
 * The roster is the players snapshot with the pending queue folded on top
 * (useAggregateRows). Each mutation builds a command event and enqueues it: the
 * change is reflected locally at once and synced in the background. The public
 * shape is unchanged, so no component or page needed touching when this moved
 * off the old online-only store.
 */

interface PlayersValue {
  players: Player[]
  pendingCount: number
  syncStatus: SyncStatus
  addPlayer: (fields: PlayerFields) => void
  editPlayer: (playerId: string, fields: PlayerFields) => void
  deletePlayer: (playerId: string) => void
  sync: () => void
}

export function usePlayers(): PlayersValue {
  const { enqueue, pendingCount, syncStatus, syncNow } = useSync()
  const players = useAggregateRows<Player>('players')

  return {
    players,
    pendingCount,
    syncStatus,
    addPlayer: (fields) => enqueue([newEvent('PlayerCreated', newId(), { ...fields })]),
    editPlayer: (playerId, fields) => enqueue([newEvent('PlayerEdited', playerId, { ...fields })]),
    deletePlayer: (playerId) => enqueue([newEvent('PlayerDeleted', playerId)]),
    sync: syncNow,
  }
}

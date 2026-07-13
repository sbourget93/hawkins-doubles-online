import { newEvent } from '../api/commands'
import { useSync, useAggregateRows } from '../offline/SyncEngine'
import { newId } from '../lib/uuid'
import type { Bounty, BountyFields } from './types'
import type { SyncStatus } from '../api/commands'

export type { SyncStatus }

/**
 * Bounty store — a thin local-first view over the sync engine. Mirrors the
 * player store: the list is the bounties snapshot with the pending queue folded
 * on top (useAggregateRows), and each mutation builds a command event and
 * enqueues it so the change shows locally at once and syncs in the background.
 */

interface BountiesValue {
  bounties: Bounty[]
  loaded: boolean
  pendingCount: number
  syncStatus: SyncStatus
  addBounty: (fields: BountyFields) => void
  editBounty: (bountyId: string, fields: BountyFields) => void
  deleteBounty: (bountyId: string) => void
}

export function useBounties(): BountiesValue {
  const { enqueue, loaded, pendingCount, syncStatus } = useSync()
  const bounties = useAggregateRows<Bounty>('bounties')

  return {
    bounties,
    loaded,
    pendingCount,
    syncStatus,
    addBounty: (fields) => enqueue([newEvent('BountyCreated', newId(), { ...fields })]),
    editBounty: (bountyId, fields) => enqueue([newEvent('BountyEdited', bountyId, { ...fields })]),
    deleteBounty: (bountyId) => enqueue([newEvent('BountyDeleted', bountyId)]),
  }
}

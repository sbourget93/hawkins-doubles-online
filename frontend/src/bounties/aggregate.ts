/**
 * Bounty aggregate descriptor — plugs the bounty list into the generic sync
 * engine. Registered in main.tsx's SyncProvider.
 */
import { fetchBounties } from '../api/bounties'
import { describeBounty, reduceBounties } from '../offline/reducers/bounties'
import type { AggregateDescriptor } from '../offline/types'
import type { Bounty } from './types'

export const bountiesAggregate: AggregateDescriptor<Bounty> = {
  name: 'bounties',
  eventTypes: ['BountyCreated', 'BountyEdited', 'BountyDeleted'],
  fetch: async () => {
    const res = await fetchBounties()
    return { version: res.version, rows: res.bounties }
  },
  reduce: reduceBounties,
  describe: describeBounty,
}

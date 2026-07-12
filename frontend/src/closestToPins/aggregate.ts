/** Closest-to-pin aggregate descriptor — plugs CTPs into the sync engine. */
import { fetchClosestToPins } from '../api/closestToPins'
import { describeClosestToPin, reduceClosestToPins } from '../offline/reducers/closestToPins'
import type { AggregateDescriptor } from '../offline/types'
import type { ClosestToPin } from './types'

export const closestToPinsAggregate: AggregateDescriptor<ClosestToPin> = {
  name: 'closestToPins',
  eventTypes: ['ClosestToPinCreated', 'ClosestToPinEdited', 'ClosestToPinDeleted'],
  fetch: async () => {
    const res = await fetchClosestToPins()
    return { version: res.version, rows: res.closest_to_pins }
  },
  reduce: reduceClosestToPins,
  describe: describeClosestToPin,
}

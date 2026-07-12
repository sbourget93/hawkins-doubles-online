/** Card-request aggregate descriptor — plugs card requests into the sync engine. */
import { fetchCardRequests } from '../api/cardRequests'
import { describeCardRequest, reduceCardRequests } from '../offline/reducers/cardRequests'
import type { AggregateDescriptor } from '../offline/types'
import type { CardRequest } from './types'

export const cardRequestsAggregate: AggregateDescriptor<CardRequest> = {
  name: 'cardRequests',
  eventTypes: ['CardRequestCreated', 'CardRequestEdited', 'CardRequestDeleted'],
  fetch: async () => {
    const res = await fetchCardRequests()
    return { version: res.version, rows: res.card_requests }
  },
  reduce: reduceCardRequests,
  describe: describeCardRequest,
}

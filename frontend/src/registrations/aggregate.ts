/** Registration aggregate descriptor — plugs registrations into the sync engine. */
import { fetchRegistrations } from '../api/registrations'
import { describeRegistration, reduceRegistrations } from '../offline/reducers/registrations'
import type { AggregateDescriptor } from '../offline/types'
import type { Registration } from './types'

export const registrationsAggregate: AggregateDescriptor<Registration> = {
  name: 'registrations',
  eventTypes: [
    'RegistrationCreated',
    'RegistrationPaidChanged',
    'RegistrationTeamAssigned',
    'RegistrationPoolOverrideChanged',
    'RegistrationDeleted',
  ],
  fetch: async () => {
    const res = await fetchRegistrations()
    return { version: res.version, rows: res.registrations }
  },
  reduce: reduceRegistrations,
  describe: describeRegistration,
}

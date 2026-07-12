/** League-event aggregate descriptor — plugs the event list into the sync engine. */
import { fetchLeagueEvents } from '../api/leagueEvents'
import { describeLeagueEvent, reduceLeagueEvents } from '../offline/reducers/leagueEvents'
import type { AggregateDescriptor } from '../offline/types'
import type { LeagueEvent } from './types'

export const leagueEventsAggregate: AggregateDescriptor<LeagueEvent> = {
  name: 'leagueEvents',
  eventTypes: [
    'LeagueEventCreated',
    'LeagueEventEdited',
    'LeagueEventStateChanged',
    'LeagueEventDeleted',
  ],
  fetch: async () => {
    const res = await fetchLeagueEvents()
    return { version: res.version, rows: res.league_events }
  },
  reduce: reduceLeagueEvents,
  describe: describeLeagueEvent,
}

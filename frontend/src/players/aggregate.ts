/**
 * Player aggregate descriptor — plugs the roster into the generic sync engine.
 * Add the analogous descriptor for other aggregates and pass it to SyncProvider.
 */
import { fetchPlayers } from '../api/players'
import { describePlayer, reducePlayers } from '../offline/reducers/players'
import type { AggregateDescriptor } from '../offline/types'
import type { Player } from './types'

export const playersAggregate: AggregateDescriptor<Player> = {
  name: 'players',
  eventTypes: ['PlayerCreated', 'PlayerEdited', 'PlayerDeleted'],
  fetch: async () => {
    const res = await fetchPlayers()
    return { version: res.version, rows: res.players }
  },
  reduce: reducePlayers,
  describe: describePlayer,
}

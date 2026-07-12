/**
 * Card and team aggregate descriptors. They live in the same event log and are
 * always rendered together, but each is a separate aggregate (its own snapshot +
 * reducer). The cards store reads both.
 */
import { fetchCards, fetchTeams } from '../api/cards'
import { describeCard, reduceCards } from '../offline/reducers/cards'
import { describeTeam, reduceTeams } from '../offline/reducers/teams'
import type { AggregateDescriptor } from '../offline/types'
import type { Card, Team } from './types'

export const cardsAggregate: AggregateDescriptor<Card> = {
  name: 'cards',
  eventTypes: ['CardCreated', 'CardStartingHoleChanged', 'CardDeleted'],
  fetch: async () => {
    const res = await fetchCards()
    return { version: res.version, rows: res.cards }
  },
  reduce: reduceCards,
  describe: describeCard,
}

export const teamsAggregate: AggregateDescriptor<Team> = {
  name: 'teams',
  eventTypes: [
    'TeamCreated',
    'TeamCardChanged',
    'TeamHandicapChanged',
    'TeamScoreChanged',
    'TeamPlacementChanged',
    'TeamPayoutChanged',
    'TeamDeleted',
  ],
  fetch: async () => {
    const res = await fetchTeams()
    return { version: res.version, rows: res.teams }
  },
  reduce: reduceTeams,
  describe: describeTeam,
}

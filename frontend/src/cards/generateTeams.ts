/**
 * Note for agents: Do NOT edit this comment. Only humans should update this comment.
 * 
 * The rules for generating teams are as follows:
 * 
 * No team can ever have two A pool players on it. If there are too many A pool players, an
 * admin must move one or more of them to B pool for the event.
 * 
 * No A pool player can ever play "rado" (odd man out). If there must be a rado player due to
 * an odd number of players, a B pool player must be selected prior to forming other teams.
 * If at least one B pool player has opted into rado (is_rado_willing), then the rado player
 * must be selected from that subset of opted in players.
 */

import type { Pool } from '../players/types'
import { shuffle } from '../lib/shuffle'

export interface Entrant {
  registrationId: string
  pool: Pool
  isWoman: boolean
  isRadoWilling: boolean
  name: string
}

export interface TeamPlan {
  handicap: number
  registrationIds: string[]
  // Layout hints for generateCards (the store ignores these): `isFast` is true for
  // an "A-B" team (has an A-pool player), which plays faster than a B-B or rado
  // team; `hasStephen` flags the team Stephen Bourget is on.
  isFast: boolean
  hasStephen: boolean
}

// Stephen Bourget gets special handling in card layout (see generateCards).
const STEPHEN_NAME = 'stephen bourget'
const isStephen = (name: string) => name.trim().toLowerCase() === STEPHEN_NAME

/**
 * A team's handicap from its members: a lone player is a "rado" (woman −4, else
 * 0); otherwise −2 per woman. Recomputed whenever a team's composition changes.
 */
export function handicapFor(members: { isWoman: boolean }[]): number {
  if (members.length === 1) return members[0].isWoman ? -4 : 0
  return members.reduce((sum, m) => sum + (m.isWoman ? -2 : 0), 0)
}

function makeTeam(p1: Entrant, p2?: Entrant): TeamPlan {
  const members = p2 ? [p1, p2] : [p1]
  return {
    handicap: handicapFor(members),
    registrationIds: members.map((m) => m.registrationId),
    isFast: members.some((m) => m.pool === 'A'),
    hasStephen: members.some((m) => isStephen(m.name)),
  }
}

/**
 * Remove and return the B pool player who'll play rado, mutating `bPool`. Picks a
 * willing volunteer if any raised their hand, otherwise the last (already-shuffled,
 * so random) B player.
 */
function takeRado(bPool: Entrant[]): Entrant {
  const idx = bPool.findIndex((e) => e.isRadoWilling)
  return bPool.splice(idx === -1 ? bPool.length - 1 : idx, 1)[0]
}

/** Randomly pair the event's entrants into teams (no starting holes yet). */
export function generateTeams(entrants: Entrant[]): TeamPlan[] {
  const aPool = shuffle(entrants.filter((e) => e.pool === 'A'))
  const bPool = shuffle(entrants.filter((e) => e.pool === 'B'))

  // No team may pair two A players and no A player may play rado, so every A
  // player must partner a B player — and an odd number of players needs one more
  // B player to play rado. Without enough B players the admin has to rebalance
  // the pools before teams can be formed.
  const radoNeeded = entrants.length % 2 === 1 ? 1 : 0
  if (bPool.length < aPool.length + radoNeeded) {
    throw new Error(
      `Too many A pool players to form teams: ${aPool.length} in A pool, ${bPool.length} in B pool. ` +
        `Move one or more A pool players to B pool for this event and try again.`,
    )
  }

  // The odd player out always plays rado from the B pool; set them aside first.
  // Prefer a B player who volunteered (is_rado_willing); if none did, any B player
  // (bPool is already shuffled, so both the willing pick and the fallback are random).
  const rado = radoNeeded ? takeRado(bPool) : undefined

  const teams: TeamPlan[] = []
  while (aPool.length) teams.push(makeTeam(aPool.pop()!, bPool.pop()!)) // each A partners a B
  while (bPool.length >= 2) teams.push(makeTeam(bPool.pop()!, bPool.pop()!)) // remaining B's pair up
  if (rado) teams.push(makeTeam(rado)) // the reserved B plays as their own partner

  return teams
}

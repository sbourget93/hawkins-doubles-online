/**
 * Pure team-generation logic. Given the entrants (each registration's pool and
 * whether the player is a woman), it randomly forms teams and chunks them into
 * cards with starting holes 1..N. It returns a plan keyed by registration id; the
 * store turns that plan into card/team/registration events with real UUIDs.
 *
 * Rules (see documentation/models/team.md):
 * - No team ever pairs two "A pool" players together.
 * - A + B pairs are formed first, then B + B pairs; a leftover B (or, rarely, a
 *   leftover A) plays as their own partner ("rado").
 * - Handicap: -2 per woman on a normal team; a rado woman gets -4, a rado man 0.
 */

import type { Pool } from '../players/types'

export interface Entrant {
  registrationId: string
  pool: Pool
  isWoman: boolean
}

export interface TeamPlan {
  handicap: number
  registrationIds: string[]
}

export interface CardPlan {
  startingHole: number
  teams: TeamPlan[]
}

/**
 * A team's handicap from its members: a lone player is a "rado" (woman −4, else
 * 0); otherwise −2 per woman. Recomputed whenever a team's composition changes.
 */
export function handicapFor(members: { isWoman: boolean }[]): number {
  if (members.length === 1) return members[0].isWoman ? -4 : 0
  return members.reduce((sum, m) => sum + (m.isWoman ? -2 : 0), 0)
}

/** Fisher–Yates shuffle (returns the same array, shuffled in place). */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function makeTeam(p1: Entrant, p2?: Entrant): TeamPlan {
  const members = p2 ? [p1, p2] : [p1]
  return { handicap: handicapFor(members), registrationIds: members.map((m) => m.registrationId) }
}

/** Build a random card/team plan from the event's entrants. */
export function buildTeamPlan(entrants: Entrant[]): CardPlan[] {
  const a = shuffle(entrants.filter((e) => e.pool === 'A'))
  const b = shuffle(entrants.filter((e) => e.pool === 'B'))

  const teams: TeamPlan[] = []
  while (a.length && b.length) teams.push(makeTeam(a.pop()!, b.pop()!)) // never two A's
  while (b.length >= 2) teams.push(makeTeam(b.pop()!, b.pop()!))
  if (b.length) teams.push(makeTeam(b.pop()!)) // lone B = rado
  while (a.length) teams.push(makeTeam(a.pop()!)) // (rare) lone A

  shuffle(teams)

  // Chunk into cards of two teams, assigning starting holes 1..N.
  const cards: CardPlan[] = []
  for (let i = 0; i < teams.length; i += 2) {
    cards.push({ startingHole: cards.length + 1, teams: teams.slice(i, i + 2) })
  }
  return cards
}

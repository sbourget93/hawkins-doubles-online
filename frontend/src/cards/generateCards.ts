/**
 * Note for agents: Do NOT edit this comment. Only humans should update this comment.
 * 
 * The rules for generating cards (once teams are formed) are as follows:
 * 
 * Generate as many cards of 2 teams as possible with the following exception:
 * never generate a card of 1 team. If there is an odd number of teams make a card
 * of 3 teams.
 * 
 * Since B-B teams are slower, always spread out the teams so that as many cards as
 * possible have both an A-B and a B-B team on them (except for the following case).
 * 
 * If there is a card of 3 teams, make sure it is as fast as possible by putting 3 A-B 
 * teams on it and starting it on the closest hole (hole 10).
 * 
 * Ensure that faster cards (cards with A-B) are not closely following slower 
 * (B-B and 3 team) cards.
 * 
 * Ensure that the holes assigned for X cards are the first X elements of the ordered
 * list of holes at the top of this file.
 * 
 * If Stephen Bourget is playing, ensure he is not on the card of three teams. This rule
 * takes priority over the "3 team cards must have as many A-B teams as possible" rule.
 */
import { shuffle } from '../lib/shuffle'
import type { TeamPlan } from './generateTeams'

// Starting holes ordered by closeness (hole 10 is closest). When there are N
// cards, the holes used are the first N entries of this list.
export const HOLE_ORDER = [1, 10, 3, 12, 9, 18, 14, 5, 15, 11, 13, 16, 17, 2, 4, 6, 7, 8]

export interface CardPlan {
  startingHole: number
  teams: TeamPlan[]
}

// How many holes ahead the next occupied starting hole is, wrapping 18 -> 1. A
// larger gap means more clear holes in front of the card before it reaches the
// group ahead, so faster cards are placed on the largest gaps.
function gapInFront(hole: number, usedHoles: number[]): number {
  let smallest = 18
  for (const other of usedHoles) {
    if (other === hole) continue
    let ahead = other - hole
    if (ahead <= 0) ahead += 18
    if (ahead < smallest) smallest = ahead
  }
  return smallest
}

// A card's speed = how many fast (A-B) teams it holds; higher is faster.
function cardSpeed(teams: TeamPlan[]): number {
  return teams.filter((t) => t.isFast).length
}

/**
 * Lay the formed teams onto cards and assign starting holes. See the rules
 * comment at the top of this file for the intent. In short: cards hold two teams
 * (one card holds three when the team count is odd); the three-team card is made
 * of the fastest teams — never Stephen's — and pinned to hole 10; the rest pair a
 * fast team with a slow one where possible and are placed fastest-first onto the
 * holes with the largest gaps ahead of them.
 */
export function generateCards(teams: TeamPlan[]): CardPlan[] {
  if (teams.length === 0) return []

  const pool = shuffle(teams.slice())
  const hasBigCard = pool.length % 2 === 1 && pool.length >= 3

  // 1. The card of three (only for an odd team count): the fastest teams, but
  //    never Stephen — keeping him off it wins over maximizing fast teams.
  const cardTeams: TeamPlan[][] = []
  let remaining = pool
  if (hasBigCard) {
    const ranked = pool.slice().sort((a, b) => {
      if (a.hasStephen !== b.hasStephen) return a.hasStephen ? 1 : -1 // Stephen last
      return Number(b.isFast) - Number(a.isFast) // then fast first
    })
    const big = ranked.slice(0, 3)
    cardTeams.push(big)
    remaining = pool.filter((t) => !big.includes(t))
  }

  // 2. Remaining teams -> cards of two, pairing a fast (A-B) team with a slow
  //    (B-B/rado) one where possible so cards are mixed; leftovers pair by kind.
  const fast = remaining.filter((t) => t.isFast)
  const slow = remaining.filter((t) => !t.isFast)
  while (fast.length && slow.length) cardTeams.push([fast.pop()!, slow.pop()!])
  while (fast.length >= 2) cardTeams.push([fast.pop()!, fast.pop()!])
  while (slow.length >= 2) cardTeams.push([slow.pop()!, slow.pop()!])
  const leftover = [...fast, ...slow]
  if (leftover.length) cardTeams.push(leftover) // only when a lone team is unavoidable

  // 3. Assign holes. The holes used are the first N of the closeness list. The big
  //    card is pinned to hole 10; the rest go fastest-first onto the largest gaps.
  const usedHoles = HOLE_ORDER.slice(0, cardTeams.length)
  const cards: CardPlan[] = []

  let assignable = cardTeams
  let openHoles = usedHoles
  if (hasBigCard) {
    cards.push({ startingHole: HOLE_ORDER[0], teams: cardTeams[0] }) // hole 10
    assignable = cardTeams.slice(1)
    openHoles = usedHoles.filter((h) => h !== HOLE_ORDER[0])
  }

  const byGap = openHoles
    .slice()
    .sort((a, b) => gapInFront(b, usedHoles) - gapInFront(a, usedHoles))
  const bySpeed = assignable.slice().sort((a, b) => cardSpeed(b) - cardSpeed(a))
  bySpeed.forEach((teamsOnCard, i) => {
    cards.push({ startingHole: byGap[i], teams: teamsOnCard })
  })

  return cards.sort((a, b) => a.startingHole - b.startingHole)
}

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
 * Attempt to satisfy card requests in the order they were created. This takes priority over 
 * the "make fast cards" rules, but not over the "Stephen stays on a 2 card" rule.
 * 
 * Once all cards are created, if Stephen Bourget is on a card of 3 teams, move him to a 
 * card of 2 teams if there is a way to do it without breaking any granted card requests.
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

/**
 * A card request resolved to the two teams its players landed on, in the order
 * the request was created. `prefer` wants the two teams on the same card; `avoid`
 * wants them on different cards. Built by the caller, which owns the player →
 * registration → team mapping.
 */
export interface CardRequestPlan {
  teamA: TeamPlan
  teamB: TeamPlan
  type: 'prefer' | 'avoid'
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
 * of the fastest teams and pinned to hole 10; the rest pair a fast team with a
 * slow one where possible, honoring card requests first, and are placed
 * fastest-first onto the holes with the largest gaps ahead of them. Finally, if
 * Stephen landed on the three-team card he's swapped onto a two-team card when
 * that won't break a granted request.
 */
export function generateCards(teams: TeamPlan[], requests: CardRequestPlan[] = []): CardPlan[] {
  if (teams.length === 0) return []

  const pool = shuffle(teams.slice())
  const hasBigCard = pool.length % 2 === 1 && pool.length >= 3

  // 1. The card of three (only for an odd team count): the fastest teams, so it
  //    plays as quickly as possible. Stephen is handled last (step 5), not here.
  const cardTeams: TeamPlan[][] = []
  let remaining = pool
  if (hasBigCard) {
    const ranked = pool.slice().sort((a, b) => Number(b.isFast) - Number(a.isFast)) // fast first
    const big = ranked.slice(0, 3)
    cardTeams.push(big)
    remaining = pool.filter((t) => !big.includes(t))
  }

  // 2. Resolve card requests over the teams free to pair (those not on the
  //    three-team card; a request touching a big-card team is skipped). Honored in
  //    creation order: each request is kept only if it doesn't contradict one
  //    already accepted. A `prefer` becomes a forced pair; an `avoid` becomes a
  //    forbidden pair. Requests win over the "make fast cards" spreading below, so
  //    accepted pairs are placed first.
  const free = new Set(remaining)
  const forcedPartner = new Map<TeamPlan, TeamPlan>()
  const forbidden = new Map<TeamPlan, Set<TeamPlan>>()
  const isForbidden = (a: TeamPlan, b: TeamPlan) => forbidden.get(a)?.has(b) ?? false
  const forbid = (a: TeamPlan, b: TeamPlan) => {
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const set = forbidden.get(x) ?? new Set<TeamPlan>()
      set.add(y)
      forbidden.set(x, set)
    }
  }
  for (const { teamA, teamB, type } of requests) {
    // Same team => already on the same card: prefer is met, avoid is impossible.
    if (teamA === teamB) continue
    if (type === 'prefer') {
      // A prefer is honored by pairing two teams, which only works if both are
      // free (a big-card team can't be re-paired). Skip if either is already
      // promised elsewhere, or an earlier avoid forbids this pair (earlier wins).
      if (!free.has(teamA) || !free.has(teamB)) continue
      if (forcedPartner.has(teamA) || forcedPartner.has(teamB)) continue
      if (isForbidden(teamA, teamB)) continue
      forcedPartner.set(teamA, teamB)
      forcedPartner.set(teamB, teamA)
    } else {
      // Record every avoid, even one touching the big card: the Stephen swap in
      // step 5 relocates a big-card team and must respect it. An earlier prefer
      // that already pinned the pair together wins over this avoid.
      if (forcedPartner.get(teamA) === teamB) continue
      forbid(teamA, teamB)
    }
  }

  // 3. Emit the forced (prefer) pairs first so they always land on the same card.
  const paired = new Set<TeamPlan>()
  for (const t of remaining) {
    const p = forcedPartner.get(t)
    if (p && !paired.has(t) && !paired.has(p)) {
      cardTeams.push([t, p])
      paired.add(t)
      paired.add(p)
    }
  }

  // 4. Pair the rest into cards of two, preferring a fast (A-B) team with a slow
  //    (B-B/rado) one so cards are mixed, while never pairing an `avoid` pair.
  //    `remaining` is always even (an odd total is absorbed by the big card), so
  //    everyone pairs; a forbidden pair is only used as a last resort when it's
  //    the sole way to avoid an illegal lone card. Scoring: an allowed partner
  //    (+2) outweighs a mixed-speed one (+1), so avoid beats spreading.
  const rest = remaining.filter((t) => !paired.has(t))
  const used = new Array<boolean>(rest.length).fill(false)
  for (let i = 0; i < rest.length; i++) {
    if (used[i]) continue
    used[i] = true
    let best = -1
    let bestScore = -1
    for (let j = i + 1; j < rest.length; j++) {
      if (used[j]) continue
      const score =
        (isForbidden(rest[i], rest[j]) ? 0 : 2) + (rest[i].isFast !== rest[j].isFast ? 1 : 0)
      if (score > bestScore) {
        bestScore = score
        best = j
      }
    }
    if (best === -1) {
      cardTeams.push([rest[i]]) // guard: only if a lone team is truly unavoidable
    } else {
      used[best] = true
      cardTeams.push([rest[i], rest[best]])
    }
  }

  // 5. Stephen off the three-team card (done last). If Stephen's team landed on the
  //    big card, swap it onto a two-team card, elevating one of that card's teams to
  //    the big card in his place. A legal swap must not break any request:
  //      - the target can't be a prefer pair (elevating a team would split it), and
  //      - no avoid may end up co-carded — neither Stephen's team with the team that
  //        stays, nor the elevated team with either team left on the big card.
  //    Avoids touching the big card were still recorded in step 2 for exactly this.
  //    Prefer elevating a fast team so the big card stays quick; best effort — if no
  //    legal swap exists, Stephen stays on the three-team card.
  if (hasBigCard) {
    const big = cardTeams[0]
    const stephenTeam = big.find((t) => t.hasStephen)
    if (stephenTeam) {
      const bigOthers = big.filter((t) => t !== stephenTeam)
      const legalMoves: { up: TeamPlan; card: TeamPlan[] }[] = []
      for (const card of cardTeams.slice(1)) {
        if (card.length !== 2 || card.some((t) => forcedPartner.has(t))) continue
        for (const up of card) {
          const keep = card[0] === up ? card[1] : card[0]
          if (isForbidden(stephenTeam, keep)) continue
          if (bigOthers.some((o) => isForbidden(up, o))) continue
          legalMoves.push({ up, card })
        }
      }
      const move = legalMoves.find((m) => m.up.isFast) ?? legalMoves[0]
      if (move) {
        big[big.indexOf(stephenTeam)] = move.up
        move.card[move.card.indexOf(move.up)] = stephenTeam
      }
    }
  }

  // 6. Assign holes. The holes used are the first N of the closeness list. The big
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

/**
 * Note for agents: Do NOT edit this comment. Only humans should update this comment.
 * 
 * The rules for generating cards (once teams are formed) are as follows. Earlier rules
 * take priority. This is not a sequence to follow, rather they are rules about the final
 * state:
 * 
 * A) Cards must all have exactly two teams. If there is an odd number of teams, make
 * exactly one card of 3 teams. NEVER make a card of 1 team.
 * 
 * B) If a card of 3 teams must be made, it must have as many A-B teams on it as possible.
 * 
 * C) Card requests (avoid and prefer) are granted in order of creation. Grant a request
 * only if it can be honored without making it impossible to keep every already-granted
 * request satisfied; otherwise skip it permanently (a prefer puts its two teams on the
 * same card; an avoid keeps them on different cards).
 * 
 * D) Assuming all other conditions are satisfied, remaining teams must be assigned to
 * cards randomly.
 * 
 * The rules for hole assignments are as follows:
 * 
 * A) Ensure that the holes assigned for X cards are the first X elements of the ordered
 * list of holes at the top of this file.
 * 
 * B) A card of 3 teams, if it exists, will be slow. Minimize the extra walking time by
 * starting them on the closest hole, hole 1.
 * 
 * C) Arrange cards so that, as much as possible, faster cards are as far behind slower
 * cards on the course as possible. (hole 18 wraps around to hole 1). In order of fastest to
 * slowest, the cards are:
 *   1) A-B/A-B
 *   2) A-B/B-B
 *.  3) B-B/B-B
 *   4) Any card with 3 teams
 * (a rado player is treated as B-B in terms of pace of play).
 */
import { shuffle } from '../lib/shuffle'
import type { TeamPlan } from './generateTeams'

// Starting holes ordered by closeness (hole 1, the first entry, is closest). When
// there are N cards, the holes used are the first N entries of this list.
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

/** A valid seating: the optional three-team card plus the two-team cards. */
interface Layout {
  big: TeamPlan[] | null
  normals: TeamPlan[][]
}

/**
 * Try to seat every team onto cards honoring the given prefer/avoid constraints
 * and rule B (the three-team card carries `bigFastTarget` fast teams). Returns a
 * concrete seating, or null when the constraints can't all be met at once.
 *
 * Only teams named in a constraint are placed by the backtracking search; the
 * rest ("filler") are interchangeable and dropped into the leftover slots at the
 * end, so the search stays tied to the number of requests, not the field size.
 * `prefer` links union teams into clusters that must share a card; `avoid` links
 * forbid a shared card. Because a request is only ever recorded as a constraint
 * (never as a committed pairing), an earlier request is free to be realized any
 * way that lets later ones fit — the whole set is solved together here.
 */
function solveLayout(
  teams: TeamPlan[],
  prefers: [TeamPlan, TeamPlan][],
  avoids: [TeamPlan, TeamPlan][],
  hasBigCard: boolean,
  numNormalCards: number,
  bigFastTarget: number,
): Layout | null {
  const avoidSet = new Map<TeamPlan, Set<TeamPlan>>()
  const link = (a: TeamPlan, b: TeamPlan) => {
    const set = avoidSet.get(a) ?? new Set<TeamPlan>()
    set.add(b)
    avoidSet.set(a, set)
  }
  for (const [a, b] of avoids) {
    link(a, b)
    link(b, a)
  }
  const conflicts = (t: TeamPlan, card: TeamPlan[]) => card.some((o) => avoidSet.get(t)?.has(o))

  // Constrained teams = those named in any request. Prefer links union them into
  // clusters that must ride the same card; an avoid-only team is its own cluster.
  const constrained = new Set<TeamPlan>()
  for (const [a, b] of [...prefers, ...avoids]) {
    constrained.add(a)
    constrained.add(b)
  }
  const parent = new Map<TeamPlan, TeamPlan>()
  for (const t of constrained) parent.set(t, t)
  const find = (t: TeamPlan): TeamPlan => {
    let root = t
    while (parent.get(root) !== root) root = parent.get(root)!
    return root
  }
  for (const [a, b] of prefers) parent.set(find(a), find(b))
  const byRoot = new Map<TeamPlan, TeamPlan[]>()
  for (const t of constrained) {
    const root = find(t)
    const arr = byRoot.get(root) ?? []
    arr.push(t)
    byRoot.set(root, arr)
  }
  // Largest clusters first: a size-3 cluster can only be the big card, so placing
  // it early prunes the search hard.
  const clusters = [...byRoot.values()].sort((a, b) => b.length - a.length)

  // A cluster is unseatable up front if it wants two mutually-avoiding teams on one
  // card, is bigger than any card, or needs the big card when there isn't one.
  for (const c of clusters) {
    if (c.length > 3) return null
    if (c.length === 3 && !hasBigCard) return null
    for (let i = 0; i < c.length; i++)
      for (let j = i + 1; j < c.length; j++)
        if (avoidSet.get(c[i])?.has(c[j])) return null
  }

  const filler = teams.filter((t) => !constrained.has(t))
  const fastIn = (card: TeamPlan[]) => card.filter((t) => t.isFast).length

  const big: TeamPlan[] = []
  const normals: TeamPlan[][] = []

  // All clusters placed: drop filler into the empty slots. Slot counts always
  // balance, so the only thing to verify is rule B — the big card's fast quota.
  const finish = (): Layout | null => {
    const fillerFast = filler.filter((t) => t.isFast)
    const fillerSlow = filler.filter((t) => !t.isFast)
    let resultBig: TeamPlan[] | null = null
    if (hasBigCard) {
      resultBig = big.slice()
      const needFast = bigFastTarget - fastIn(resultBig)
      const emptyBig = 3 - resultBig.length
      const needSlow = emptyBig - needFast
      if (needFast < 0 || needFast > emptyBig) return null
      if (needFast > fillerFast.length || needSlow > fillerSlow.length) return null
      for (let i = 0; i < needFast; i++) resultBig.push(fillerFast.pop()!)
      for (let i = 0; i < needSlow; i++) resultBig.push(fillerSlow.pop()!)
    }
    const rest = [...fillerFast, ...fillerSlow]
    const resultNormals = normals.map((c) => c.slice())
    for (const card of resultNormals) while (card.length < 2) card.push(rest.pop()!)
    while (resultNormals.length < numNormalCards) resultNormals.push([rest.pop()!, rest.pop()!])
    return { big: resultBig, normals: resultNormals }
  }

  const place = (idx: number): Layout | null => {
    if (idx === clusters.length) return finish()
    const cluster = clusters[idx]
    // Try the big card, then any two-team card with room, then a fresh card.
    if (hasBigCard && big.length + cluster.length <= 3 && !cluster.some((t) => conflicts(t, big))) {
      big.push(...cluster)
      const done = place(idx + 1)
      big.length -= cluster.length
      if (done) return done
    }
    for (const card of normals) {
      if (card.length + cluster.length <= 2 && !cluster.some((t) => conflicts(t, card))) {
        const before = card.length
        card.push(...cluster)
        const done = place(idx + 1)
        card.length = before
        if (done) return done
      }
    }
    if (cluster.length <= 2 && normals.length < numNormalCards) {
      normals.push(cluster.slice())
      const done = place(idx + 1)
      normals.pop()
      if (done) return done
    }
    return null
  }

  return place(0)
}

/**
 * Lay the formed teams onto cards and assign starting holes, following the rules
 * in the header comment. Composition (rules A–D): cards hold two teams, or one
 * holds three when the count is odd; that three-team card carries as many fast
 * (A-B) teams as the field allows; card requests are then granted in creation
 * order, each kept only while every already-granted request stays satisfiable;
 * any remaining choice is random. Holes: the three-team card starts on the closest
 * hole, and the rest are placed fastest-first onto the holes with the most clear
 * course ahead, so faster cards sit as far behind slower ones as possible.
 */
export function generateCards(teams: TeamPlan[], requests: CardRequestPlan[] = []): CardPlan[] {
  if (teams.length === 0) return []
  // A lone team can't make a legal card of two, but it has to go somewhere.
  if (teams.length === 1) return [{ startingHole: HOLE_ORDER[0], teams: teams.slice() }]

  const n = teams.length
  const hasBigCard = n % 2 === 1
  const numCards = hasBigCard ? (n - 1) / 2 : n / 2
  const numNormalCards = hasBigCard ? numCards - 1 : numCards
  const totalFast = teams.filter((t) => t.isFast).length
  const bigFastTarget = hasBigCard ? Math.min(3, totalFast) : 0

  // Grant requests in creation order (rule C): keep a request only if the full
  // constraint set — every request kept so far plus this one, and rule B — still
  // has a valid seating. A request naming the same team twice is a no-op (a prefer
  // is already met, an avoid is impossible), so it's skipped.
  const prefers: [TeamPlan, TeamPlan][] = []
  const avoids: [TeamPlan, TeamPlan][] = []
  for (const { teamA, teamB, type } of requests) {
    if (teamA === teamB) continue
    const trial: [TeamPlan, TeamPlan] = [teamA, teamB]
    const nextPrefers = type === 'prefer' ? [...prefers, trial] : prefers
    const nextAvoids = type === 'avoid' ? [...avoids, trial] : avoids
    if (solveLayout(teams, nextPrefers, nextAvoids, hasBigCard, numNormalCards, bigFastTarget)) {
      if (type === 'prefer') prefers.push(trial)
      else avoids.push(trial)
    }
  }

  // Final seating from the granted constraints. Shuffle first so the filler teams
  // (rule D) land randomly; the constraints still hold — they name team objects,
  // not positions. Each granted set was checked, so this is never null.
  const seating =
    solveLayout(shuffle(teams.slice()), prefers, avoids, hasBigCard, numNormalCards, bigFastTarget) ??
    ({ big: null, normals: [] } as Layout)

  // Assign holes. Holes used are the first N of the closeness list. The three-team
  // card is pinned to the closest hole (the first of that list) so its slower pace
  // costs the least extra walking (rule B); the rest go fastest-first onto the holes
  // with the largest gap ahead, keeping faster cards well behind slower ones.
  const usedHoles = HOLE_ORDER.slice(0, numCards)
  const bigHole = HOLE_ORDER[0]
  const cards: CardPlan[] = []

  let openHoles = usedHoles
  if (seating.big) {
    cards.push({ startingHole: bigHole, teams: seating.big })
    openHoles = usedHoles.filter((h) => h !== bigHole)
  }

  const byGap = openHoles.slice().sort((a, b) => gapInFront(b, usedHoles) - gapInFront(a, usedHoles))
  const bySpeed = seating.normals.slice().sort((a, b) => cardSpeed(b) - cardSpeed(a))
  bySpeed.forEach((teamsOnCard, i) => {
    cards.push({ startingHole: byGap[i], teams: teamsOnCard })
  })

  return cards.sort((a, b) => a.startingHole - b.startingHole)
}

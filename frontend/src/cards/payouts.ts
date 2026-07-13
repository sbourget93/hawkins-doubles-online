/**
 * PDGA-style amateur payouts (top ~45% of the field).
 *
 * The per-place dollar amounts come from the PDGA amateur "top 45%" payout table
 * (the Am-Mid curve), keyed by the number of teams in the event. Each row lists
 * the whole-dollar payout for 1st, 2nd, 3rd, … place; the row's length is the
 * number of cashing places. Every row sums to $14 × teams — the whole pool at $7
 * per player for teams of two — so the entire pool is paid out.
 *
 * Ams here play as doubles teams, not individuals, so the table is keyed by team
 * count. What was actually collected is $7 per player, which the table assumes is
 * $14 per team — but a "rado" (a lone player who paid once) brings only $7, and a
 * rare team of three brings $21. Any gap between the collected pool and the table
 * total is spread evenly across the cashing teams, with the leftover dollars
 * landing on the leading teams first (they have the most to gain or lose). See
 * `computePayouts`.
 *
 * The guiding rule: never pay out less than was collected. Tie splits and the
 * pool reconciliation always round in the players' favour, so the total may run a
 * dollar or two over — never under.
 *
 * The amounts are stored as a deterministic constant (never fetched at runtime)
 * so the calculation is pure and reproducible.
 */

/** 
 * Payout per place, in whole dollars, keyed by number of teams (2–32). 
 * 
 * This is pretty much the PDGA AM 45% payout , with odd amounts rounded up.
 */
export const PDGA_AM_PAYOUTS: Record<number, number[]> = {
  2: [28],
  3: [42],
  4: [34, 22],
  5: [42, 28],
  6: [38, 28, 20],
  7: [44, 32, 22],
  8: [44, 34, 22, 14],
  9: [50, 38, 26, 16],
  10: [42, 36, 28, 22, 14],
  11: [46, 40, 32, 24, 16],
  12: [42, 38, 30, 26, 20, 14],
  13: [46, 40, 34, 28, 22, 16],
  14: [50, 44, 36, 30, 24, 16],
  15: [44, 40, 36, 30, 26, 22, 16],
  16: [48, 44, 38, 32, 28, 22, 16],
  17: [46, 40, 36, 32, 30, 24, 20, 14],
  18: [48, 44, 38, 34, 30, 26, 20, 16],
  19: [46, 40, 38, 32, 30, 28, 22, 20, 16],
  20: [48, 42, 40, 34, 32, 28, 22, 20, 18],
  21: [44, 42, 38, 36, 32, 26, 24, 22, 18, 16],
  22: [46, 44, 40, 38, 34, 28, 26, 22, 18, 16],
  23: [48, 46, 42, 40, 36, 30, 26, 24, 20, 16],
  24: [48, 44, 40, 38, 34, 30, 28, 24, 20, 18, 18],
  25: [50, 46, 42, 38, 36, 32, 28, 26, 22, 18, 18],
  26: [48, 44, 40, 36, 34, 34, 30, 26, 22, 22, 18, 16],
  27: [50, 46, 42, 38, 34, 34, 30, 26, 24, 24, 20, 16],
  28: [46, 44, 42, 38, 36, 32, 30, 28, 26, 24, 20, 18, 16],
  29: [48, 46, 44, 40, 38, 34, 30, 28, 26, 24, 20, 18, 16],
  30: [46, 42, 40, 38, 36, 34, 32, 30, 28, 26, 22, 20, 18, 14],
  31: [48, 44, 42, 40, 38, 36, 34, 32, 28, 26, 22, 20, 18, 14],
  32: [46, 44, 40, 38, 36, 34, 32, 30, 28, 28, 26, 22, 20, 18, 14],
}

/** Entry fee that flows into the cash pool, per player. */
const DOLLARS_PER_PLAYER = 7

export interface PayoutTeam {
  teamId: string
  /** Finishing place (1 = best); teams with an equal score share a place. Null
   *  when the team has no score yet, so it does not cash. */
  placement: number | null
  /** Registrations on the team: 2 normally, 1 for a rado, 3 rarely. */
  playerCount: number
}

export interface PayoutResult {
  teamId: string
  /** Whole-dollar winnings; 0 for a scored team out of the money, null when the
   *  team has no score. */
  payout_amount: number | null
}

/**
 * Compute each team's payout from the PDGA amateur table.
 *
 * Teams are ranked by `placement`; equal placements are a tie and split the
 * combined cash for the positions they occupy, rounded up so tied teams always
 * receive the same amount. Positions past the paid places pay $0, so a tie
 * straddling the cash line splits it correctly.
 *
 * The table assumes $14 per team, but the pool actually collected is $7 per
 * player. The difference — a team of three adds to it, a rado subtracts — is
 * spread evenly across the cashing teams, with the odd dollars falling on the
 * leading teams first (most to gain, or most to lose). Rounding only ever favours
 * the players, so the total never drops below what was collected.
 *
 * Fewer than 2 or more than 32 teams falls outside the table, so every team is
 * left blank for the admin to enter manually.
 */
export function computePayouts(teams: PayoutTeam[]): PayoutResult[] {
  const table = PDGA_AM_PAYOUTS[teams.length]
  if (!table) return teams.map((t) => ({ teamId: t.teamId, payout_amount: null }))

  const paidPlaces = table.length
  const tableTotal = table.reduce((a, b) => a + b, 0) // == 14 * teams

  // What was collected ($7 per player) vs. what the table assumes ($14 per team).
  // A team of three makes `diff` positive; a rado makes it negative.
  const pool = teams.reduce((sum, t) => sum + t.playerCount * DOLLARS_PER_PLAYER, 0)
  const diff = pool - tableTotal

  // Scored teams start at $0 (out of the money by default); unscored stay null.
  const amount = new Map<string, number | null>()
  for (const t of teams) amount.set(t.teamId, t.placement == null ? null : 0)

  const scored = teams.filter((t) => t.placement != null)
  const places = Array.from(new Set(scored.map((t) => t.placement as number))).sort(
    (a, b) => a - b,
  )

  // Walk the field best-place first. Positions are count-driven (not read from
  // the placement value), so ties and any gaps in placement numbers stay
  // consistent. `cashing` collects paid teams in finishing order; `tieGroups`
  // remembers which of them must end up equal.
  const cashing: PayoutTeam[] = []
  const tieGroups: PayoutTeam[][] = []
  let position = 1
  for (const place of places) {
    const group = scored
      .filter((t) => t.placement === place)
      .sort((a, b) => a.teamId.localeCompare(b.teamId))

    let posSum = 0
    for (let i = 0; i < group.length; i++) {
      const pos = position + i
      if (pos <= paidPlaces) posSum += table[pos - 1]
    }
    position += group.length
    if (posSum === 0) continue // out of the money

    // Tied teams split evenly, rounded up so none is shorted.
    const share = Math.ceil(posSum / group.length)
    for (const t of group) {
      amount.set(t.teamId, share)
      cashing.push(t)
    }
    if (group.length > 1) tieGroups.push(group)
  }

  // Reconcile the collected pool with the table total, spreading `diff` across
  // the cashing teams; the remainder falls on the leading teams first.
  if (diff !== 0 && cashing.length > 0) {
    const step = diff > 0 ? 1 : -1
    const magnitude = Math.abs(diff)
    const per = Math.floor(magnitude / cashing.length)
    const rem = magnitude % cashing.length
    cashing.forEach((t, i) => {
      const delta = step * (per + (i < rem ? 1 : 0))
      amount.set(t.teamId, (amount.get(t.teamId) as number) + delta)
    })
  }

  // The reconciliation can leave tied teams a dollar apart; level each group up
  // to its highest member so ties always pay equally (adding, never subtracting).
  for (const group of tieGroups) {
    const max = Math.max(...group.map((t) => amount.get(t.teamId) as number))
    for (const t of group) amount.set(t.teamId, max)
  }

  return teams.map((t) => ({ teamId: t.teamId, payout_amount: amount.get(t.teamId) ?? null }))
}

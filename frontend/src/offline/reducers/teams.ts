/**
 * Client-side projection for the team aggregate — the TS mirror of backend
 * `projections/team.py`. Score, placement, and payout start null and are set
 * later. Order follows insertion (GET /teams orders by created_at).
 */
import type { CommandEvent } from '../../api/commands'
import type { Team } from '../../cards/types'

export function reduceTeams(rows: Team[], event: CommandEvent): Team[] {
  const data = (event.data ?? {}) as Record<string, unknown>
  switch (event.type) {
    case 'TeamCreated':
      return [
        ...rows,
        {
          team_id: event.aggregate_id,
          card_id: String(data.card_id ?? ''),
          handicap: Number(data.handicap ?? 0),
          score: null,
          placement: null,
          payout_amount: null,
        },
      ]
    case 'TeamCardChanged':
      return rows.map((t) =>
        t.team_id === event.aggregate_id ? { ...t, card_id: String(data.card_id ?? t.card_id) } : t,
      )
    case 'TeamHandicapChanged':
      return rows.map((t) =>
        t.team_id === event.aggregate_id ? { ...t, handicap: Number(data.handicap ?? t.handicap) } : t,
      )
    case 'TeamScoreChanged':
      return rows.map((t) =>
        t.team_id === event.aggregate_id ? { ...t, score: (data.score as number | null) ?? null } : t,
      )
    case 'TeamPlacementChanged':
      return rows.map((t) =>
        t.team_id === event.aggregate_id
          ? { ...t, placement: (data.placement as number | null) ?? null }
          : t,
      )
    case 'TeamPayoutChanged':
      return rows.map((t) =>
        t.team_id === event.aggregate_id
          ? { ...t, payout_amount: (data.payout_amount as number | null) ?? null }
          : t,
      )
    case 'TeamDeleted':
      return rows.filter((t) => t.team_id !== event.aggregate_id)
    default:
      return rows
  }
}

export function describeTeam(event: CommandEvent): string {
  switch (event.type) {
    case 'TeamCreated':
      return 'Create team'
    case 'TeamCardChanged':
      return 'Move team'
    case 'TeamHandicapChanged':
      return 'Update team handicap'
    case 'TeamScoreChanged':
      return 'Set team score'
    case 'TeamPlacementChanged':
      return 'Set team placement'
    case 'TeamPayoutChanged':
      return 'Set team payout'
    case 'TeamDeleted':
      return 'Delete team'
    default:
      return event.type
  }
}

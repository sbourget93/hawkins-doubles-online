/**
 * Client-side projection for the registration aggregate — the TS mirror of
 * backend `projections/registration.py`. New registrations start unpaid and
 * unassigned; order follows insertion (GET /registrations orders by created_at).
 */
import type { CommandEvent } from '../../api/commands'
import type { Registration } from '../../registrations/types'

export function reduceRegistrations(
  rows: Registration[],
  event: CommandEvent,
): Registration[] {
  const data = (event.data ?? {}) as Record<string, unknown>
  switch (event.type) {
    case 'RegistrationCreated':
      return [
        ...rows,
        {
          registration_id: event.aggregate_id,
          league_event_id: String(data.league_event_id ?? ''),
          player_id: String(data.player_id ?? ''),
          team_id: null,
          is_paid: false,
          pool_override: null,
        },
      ]
    case 'RegistrationPaidChanged':
      return rows.map((r) =>
        r.registration_id === event.aggregate_id ? { ...r, is_paid: !!data.is_paid } : r,
      )
    case 'RegistrationTeamAssigned':
      return rows.map((r) =>
        r.registration_id === event.aggregate_id
          ? { ...r, team_id: (data.team_id as string | null) ?? null }
          : r,
      )
    case 'RegistrationDeleted':
      return rows.filter((r) => r.registration_id !== event.aggregate_id)
    default:
      return rows
  }
}

export function describeRegistration(event: CommandEvent): string {
  switch (event.type) {
    case 'RegistrationCreated':
      return 'Register player'
    case 'RegistrationPaidChanged':
      return (event.data as { is_paid?: boolean })?.is_paid ? 'Mark paid' : 'Mark unpaid'
    case 'RegistrationTeamAssigned':
      return 'Assign player to team'
    case 'RegistrationDeleted':
      return 'Unregister player'
    default:
      return event.type
  }
}

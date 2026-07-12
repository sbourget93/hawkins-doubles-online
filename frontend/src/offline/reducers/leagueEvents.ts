/**
 * Client-side projection for the league-event aggregate — the TS mirror of
 * backend `projections/league_event.py`. Ordering matches GET /league-events
 * (date descending). Approximate is fine: the server snapshot overwrites this on
 * every successful sync.
 */
import type { CommandEvent } from '../../api/commands'
import type { LeagueEvent, LeagueEventState } from '../../leagueEvents/types'

function byDateDesc(a: LeagueEvent, b: LeagueEvent): number {
  return b.date.localeCompare(a.date)
}

export function reduceLeagueEvents(rows: LeagueEvent[], event: CommandEvent): LeagueEvent[] {
  const data = (event.data ?? {}) as Record<string, unknown>
  switch (event.type) {
    case 'LeagueEventCreated':
      return [
        ...rows,
        {
          league_event_id: event.aggregate_id,
          date: String(data.date ?? ''),
          title: String(data.title ?? '').trim() || 'Hawkins Dubs',
          state: 'registration' as LeagueEventState,
        },
      ].sort(byDateDesc)
    case 'LeagueEventEdited':
      return rows
        .map((e) =>
          e.league_event_id === event.aggregate_id
            ? { ...e, date: String(data.date ?? e.date), title: String(data.title ?? e.title) }
            : e,
        )
        .sort(byDateDesc)
    case 'LeagueEventStateChanged':
      return rows.map((e) =>
        e.league_event_id === event.aggregate_id
          ? { ...e, state: data.state as LeagueEventState }
          : e,
      )
    case 'LeagueEventDeleted':
      return rows.filter((e) => e.league_event_id !== event.aggregate_id)
    default:
      return rows
  }
}

export function describeLeagueEvent(event: CommandEvent): string {
  const data = (event.data ?? {}) as Record<string, unknown>
  switch (event.type) {
    case 'LeagueEventCreated':
      return `Create event ${data.date ?? ''}`.trim()
    case 'LeagueEventEdited':
      return `Edit event ${data.date ?? ''}`.trim()
    case 'LeagueEventStateChanged':
      return `Set event to ${data.state ?? ''}`.trim()
    case 'LeagueEventDeleted':
      return 'Delete event'
    default:
      return event.type
  }
}

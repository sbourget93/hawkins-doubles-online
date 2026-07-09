import type { LeagueEventsResponse } from '../leagueEvents/types'

/** All non-deleted league events (most recent first) plus the server version. */
export async function fetchLeagueEvents(): Promise<LeagueEventsResponse> {
  const res = await fetch('/api/league-events')
  if (!res.ok) {
    throw new Error(`fetch league events failed: ${res.status}`)
  }
  return (await res.json()) as LeagueEventsResponse
}

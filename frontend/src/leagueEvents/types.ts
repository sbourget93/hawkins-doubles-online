/** Domain types for the league-event aggregate. */

export type LeagueEventState =
  | 'registration'
  | 'forming_teams'
  | 'ready'
  | 'in_progress'
  | 'completed'

export interface LeagueEvent {
  league_event_id: string
  date: string
  title: string
  state: LeagueEventState
}

export interface LeagueEventsResponse {
  version: number
  league_events: LeagueEvent[]
}

/** Domain types for the registration aggregate (a player's entry into an event). */

export interface Registration {
  registration_id: string
  league_event_id: string
  player_id: string
  team_id: string | null
  is_paid: boolean
  pool_override: string | null
  payout_amount: number | null
}

export interface RegistrationsResponse {
  version: number
  registrations: Registration[]
}

/** Domain types for the closest-to-pin aggregate (a CTP prize on a hole). */

export interface ClosestToPin {
  closest_to_pin_id: string
  league_event_id: string
  winner_registration_id: string | null
  hole_number: number
  prize: string
}

export interface ClosestToPinsResponse {
  version: number
  closest_to_pins: ClosestToPin[]
}

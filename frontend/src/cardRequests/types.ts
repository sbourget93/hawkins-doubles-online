/** Domain types for the card-request aggregate (a pairing preference for two players). */

export type RequestType = 'prefer' | 'avoid'

export interface CardRequest {
  card_request_id: string
  league_event_id: string
  player_id_a: string
  player_id_b: string
  request_type: RequestType
}

export interface CardRequestsResponse {
  version: number
  card_requests: CardRequest[]
}

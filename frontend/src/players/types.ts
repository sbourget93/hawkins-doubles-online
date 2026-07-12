/** Domain types for the player aggregate. */

export type Pool = 'A' | 'B'

export interface Player {
  player_id: string
  first_name: string
  last_name: string
  is_woman: boolean
  default_pool: Pool
  is_rado_willing: boolean
}

/** The full set of admin-editable player fields (used by add and edit). */
export interface PlayerFields {
  first_name: string
  last_name: string
  is_woman: boolean
  default_pool: Pool
  is_rado_willing: boolean
}

export interface PlayersResponse {
  version: number
  players: Player[]
}

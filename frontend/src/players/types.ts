/** Domain types for the player aggregate. */

export type Pool = 'A' | 'B'

export interface Player {
  player_id: string
  first_name: string
  last_name: string
  /** Shown in lieu of "first last" when set; null/empty means use the real name. */
  display_name: string | null
  is_woman: boolean
  default_pool: Pool
  is_rado_willing: boolean
}

/** The full set of admin-editable player fields (used by add and edit). */
export interface PlayerFields {
  first_name: string
  last_name: string
  /** Optional; an empty string means "no display name, use first + last". */
  display_name: string
  is_woman: boolean
  default_pool: Pool
  is_rado_willing: boolean
}

export interface PlayersResponse {
  version: number
  players: Player[]
}

import type { Pool } from '../players/types'

/** One player's row on the rankings board (computed server-side). */
export interface PlayerRanking {
  player_id: string
  first_name: string
  last_name: string
  is_woman: boolean
  default_pool: Pool
  /** Mean inclusive score-percentile across the player's scored events (0–100). */
  percentile: number
  /** How many scored events fed the average. */
  leagues: number
  /** 1-based rank by percentile; ties share a rank. */
  rank: number
}

export interface PlayerRankingsResponse {
  version: number
  rankings: PlayerRanking[]
}

/** Player rankings, aggregated by the backend from the scored teams. */
export async function fetchPlayerRankings(): Promise<PlayerRankingsResponse> {
  const res = await fetch('/api/player-rankings')
  if (!res.ok) {
    throw new Error(`fetch player rankings failed: ${res.status}`)
  }
  return (await res.json()) as PlayerRankingsResponse
}

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

/** Optional window for the board: a single calendar `season`, or a rolling
 * `years` window. Omit both for all-time. */
export interface RankingsWindow {
  years?: number
  season?: number
}

/** Player rankings, aggregated by the backend from the scored teams. */
export async function fetchPlayerRankings(
  window: RankingsWindow = {},
): Promise<PlayerRankingsResponse> {
  const params = new URLSearchParams()
  if (window.season != null) params.set('season', String(window.season))
  else if (window.years != null) params.set('years', String(window.years))
  const query = params.toString()
  const res = await fetch(
    query ? `/api/player-rankings?${query}` : '/api/player-rankings',
  )
  if (!res.ok) {
    throw new Error(`fetch player rankings failed: ${res.status}`)
  }
  return (await res.json()) as PlayerRankingsResponse
}

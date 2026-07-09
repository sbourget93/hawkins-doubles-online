import type { PlayersResponse } from '../players/types'

/** The current roster (non-deleted players) plus the server version. */
export async function fetchPlayers(): Promise<PlayersResponse> {
  const res = await fetch('/api/players')
  if (!res.ok) {
    throw new Error(`fetch players failed: ${res.status}`)
  }
  return (await res.json()) as PlayersResponse
}

import type { CardsResponse, TeamsResponse } from '../cards/types'

/** All non-deleted cards (by starting hole) plus the server version. */
export async function fetchCards(): Promise<CardsResponse> {
  const res = await fetch('/api/cards')
  if (!res.ok) {
    throw new Error(`fetch cards failed: ${res.status}`)
  }
  return (await res.json()) as CardsResponse
}

/** All non-deleted teams plus the server version. */
export async function fetchTeams(): Promise<TeamsResponse> {
  const res = await fetch('/api/teams')
  if (!res.ok) {
    throw new Error(`fetch teams failed: ${res.status}`)
  }
  return (await res.json()) as TeamsResponse
}

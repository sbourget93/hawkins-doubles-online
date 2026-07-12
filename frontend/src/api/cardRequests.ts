import type { CardRequestsResponse } from '../cardRequests/types'

/** All non-deleted card requests plus the server version. */
export async function fetchCardRequests(): Promise<CardRequestsResponse> {
  const res = await fetch('/api/card-requests')
  if (!res.ok) {
    throw new Error(`fetch card-requests failed: ${res.status}`)
  }
  return (await res.json()) as CardRequestsResponse
}

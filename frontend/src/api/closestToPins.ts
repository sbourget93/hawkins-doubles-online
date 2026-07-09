import type { ClosestToPinsResponse } from '../closestToPins/types'

/** All non-deleted closest-to-pins plus the server version. */
export async function fetchClosestToPins(): Promise<ClosestToPinsResponse> {
  const res = await fetch('/api/closest-to-pins')
  if (!res.ok) {
    throw new Error(`fetch closest-to-pins failed: ${res.status}`)
  }
  return (await res.json()) as ClosestToPinsResponse
}

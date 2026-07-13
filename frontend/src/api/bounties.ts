import type { BountiesResponse } from '../bounties/types'

/** All non-deleted bounties plus the server version. */
export async function fetchBounties(): Promise<BountiesResponse> {
  const res = await fetch('/api/bounties')
  if (!res.ok) {
    throw new Error(`fetch bounties failed: ${res.status}`)
  }
  return (await res.json()) as BountiesResponse
}

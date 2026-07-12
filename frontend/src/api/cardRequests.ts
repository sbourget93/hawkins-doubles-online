import type { CardRequestsResponse } from '../cardRequests/types'

/** All non-deleted card requests plus the server version.
 *
 * The endpoint is admin-only: a non-admin gets a 403, which we treat as "no card
 * requests" (empty rows, version 0) rather than an error, so the shared snapshot
 * fetch — which loads every aggregate together — still succeeds for non-admins.
 * The whole card-request UI is hidden from them anyway.
 */
export async function fetchCardRequests(): Promise<CardRequestsResponse> {
  const res = await fetch('/api/card-requests')
  if (res.status === 403) {
    return { version: 0, card_requests: [] }
  }
  if (!res.ok) {
    throw new Error(`fetch card-requests failed: ${res.status}`)
  }
  return (await res.json()) as CardRequestsResponse
}

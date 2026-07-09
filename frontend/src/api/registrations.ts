import type { RegistrationsResponse } from '../registrations/types'

/** All non-deleted registrations plus the server version. */
export async function fetchRegistrations(): Promise<RegistrationsResponse> {
  const res = await fetch('/api/registrations')
  if (!res.ok) {
    throw new Error(`fetch registrations failed: ${res.status}`)
  }
  return (await res.json()) as RegistrationsResponse
}

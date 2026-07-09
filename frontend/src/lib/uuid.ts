/**
 * Client-generated IDs. Entities and events get their UUIDs on the client before
 * any server round-trip, so writes can happen fully offline (see agents.md).
 */
export function newId(): string {
  return crypto.randomUUID()
}

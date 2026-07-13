/**
 * Client-side projection for the bounty aggregate — the TypeScript mirror of the
 * backend's `projections/bounty.py`. It folds a queued command onto the local
 * bounty list so an offline write shows up immediately.
 *
 * It only needs to be good enough to reflect the admin's own pending action: on
 * every successful sync the authoritative server snapshot overwrites this, so
 * any drift self-corrects. Ordering mirrors GET /bounties (by name).
 */
import type { CommandEvent } from '../../api/commands'
import type { Bounty } from '../../bounties/types'

function byName(a: Bounty, b: Bounty): number {
  return a.name.localeCompare(b.name)
}

export function reduceBounties(rows: Bounty[], event: CommandEvent): Bounty[] {
  const data = (event.data ?? {}) as Partial<Bounty>
  switch (event.type) {
    case 'BountyCreated':
      return [
        ...rows,
        {
          bounty_id: event.aggregate_id,
          name: data.name ?? '',
          prize: data.prize ?? '',
        },
      ].sort(byName)
    case 'BountyEdited':
      return rows
        .map((b) =>
          b.bounty_id === event.aggregate_id
            ? { ...b, name: data.name ?? b.name, prize: data.prize ?? b.prize }
            : b,
        )
        .sort(byName)
    case 'BountyDeleted':
      return rows.filter((b) => b.bounty_id !== event.aggregate_id)
    default:
      return rows
  }
}

export function describeBounty(event: CommandEvent): string {
  const data = (event.data ?? {}) as Partial<Bounty>
  switch (event.type) {
    case 'BountyCreated':
      return data.name ? `Add bounty ${data.name}` : 'Add bounty'
    case 'BountyEdited':
      return data.name ? `Edit bounty ${data.name}` : 'Edit bounty'
    case 'BountyDeleted':
      return 'Delete bounty'
    default:
      return event.type
  }
}

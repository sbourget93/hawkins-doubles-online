/**
 * Client-side projection for the player aggregate — the TypeScript mirror of the
 * backend's `projections/player.py`. It folds a queued command onto the local
 * roster so an offline write shows up immediately.
 *
 * It only needs to be good enough to reflect the admin's own pending action: on
 * every successful sync the authoritative server snapshot overwrites this, so
 * any drift self-corrects. Ordering mirrors GET /players (last name, then first).
 */
import type { CommandEvent } from '../../api/commands'
import type { Player, Pool } from '../../players/types'

function byName(a: Player, b: Player): number {
  return a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)
}

export function reducePlayers(rows: Player[], event: CommandEvent): Player[] {
  const data = (event.data ?? {}) as Partial<Player>
  switch (event.type) {
    case 'PlayerCreated':
      return [
        ...rows,
        {
          player_id: event.aggregate_id,
          first_name: data.first_name ?? '',
          last_name: data.last_name ?? '',
          display_name: data.display_name?.trim() || null,
          is_woman: !!data.is_woman,
          default_pool: (data.default_pool ?? 'A') as Pool,
          is_rado_willing: !!data.is_rado_willing,
        },
      ].sort(byName)
    case 'PlayerEdited':
      return rows
        .map((p) =>
          p.player_id === event.aggregate_id
            ? {
                ...p,
                first_name: data.first_name ?? p.first_name,
                last_name: data.last_name ?? p.last_name,
                display_name:
                  data.display_name !== undefined
                    ? data.display_name?.trim() || null
                    : p.display_name,
                is_woman: data.is_woman ?? p.is_woman,
                default_pool: data.default_pool ?? p.default_pool,
                is_rado_willing: data.is_rado_willing ?? p.is_rado_willing,
              }
            : p,
        )
        .sort(byName)
    case 'PlayerDeleted':
      return rows.filter((p) => p.player_id !== event.aggregate_id)
    default:
      return rows
  }
}

export function describePlayer(event: CommandEvent): string {
  const data = (event.data ?? {}) as Partial<Player>
  const name =
    data.display_name?.trim() || [data.first_name, data.last_name].filter(Boolean).join(' ')
  switch (event.type) {
    case 'PlayerCreated':
      return name ? `Add player ${name}` : 'Add player'
    case 'PlayerEdited':
      return name ? `Edit player ${name}` : 'Edit player'
    case 'PlayerDeleted':
      return 'Delete player'
    default:
      return event.type
  }
}

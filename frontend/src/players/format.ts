import type { Player } from './types'

/**
 * The name to show for a player: their custom `display_name` when set, otherwise
 * "first last". Centralizes name rendering so every surface shows the same label.
 * Pass `undefined` (e.g. a player not found in the roster) to get a placeholder.
 */
export function playerName(
  player: Pick<Player, 'first_name' | 'last_name' | 'display_name'> | undefined | null,
): string {
  if (!player) return 'Unknown player'
  return player.display_name?.trim() || `${player.first_name} ${player.last_name}`.trim()
}

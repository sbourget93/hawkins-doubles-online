/**
 * Client-side projection for the card aggregate — the TS mirror of backend
 * `projections/card.py`. Order follows starting_hole.
 */
import type { CommandEvent } from '../../api/commands'
import type { Card } from '../../cards/types'

function byHole(a: Card, b: Card): number {
  return a.starting_hole - b.starting_hole
}

export function reduceCards(rows: Card[], event: CommandEvent): Card[] {
  const data = (event.data ?? {}) as Record<string, unknown>
  switch (event.type) {
    case 'CardCreated':
      return [
        ...rows,
        {
          card_id: event.aggregate_id,
          league_event_id: String(data.league_event_id ?? ''),
          starting_hole: Number(data.starting_hole ?? 0),
        },
      ].sort(byHole)
    case 'CardStartingHoleChanged':
      return rows
        .map((c) =>
          c.card_id === event.aggregate_id
            ? { ...c, starting_hole: Number(data.starting_hole ?? c.starting_hole) }
            : c,
        )
        .sort(byHole)
    case 'CardDeleted':
      return rows.filter((c) => c.card_id !== event.aggregate_id)
    default:
      return rows
  }
}

export function describeCard(event: CommandEvent): string {
  const data = (event.data ?? {}) as Record<string, unknown>
  switch (event.type) {
    case 'CardCreated':
      return `Create card (hole ${data.starting_hole ?? '?'})`
    case 'CardStartingHoleChanged':
      return `Move card to hole ${data.starting_hole ?? '?'}`
    case 'CardDeleted':
      return 'Delete card'
    default:
      return event.type
  }
}

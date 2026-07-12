/**
 * Client-side projection for the closest-to-pin aggregate — the TS mirror of
 * backend `projections/closest_to_pin.py`. A CTP has no winner-set event, so
 * `winner_registration_id` stays null. Order follows hole_number.
 */
import type { CommandEvent } from '../../api/commands'
import type { ClosestToPin } from '../../closestToPins/types'

function byHole(a: ClosestToPin, b: ClosestToPin): number {
  return a.hole_number - b.hole_number
}

export function reduceClosestToPins(
  rows: ClosestToPin[],
  event: CommandEvent,
): ClosestToPin[] {
  const data = (event.data ?? {}) as Record<string, unknown>
  switch (event.type) {
    case 'ClosestToPinCreated':
      return [
        ...rows,
        {
          closest_to_pin_id: event.aggregate_id,
          league_event_id: String(data.league_event_id ?? ''),
          winner_registration_id: null,
          hole_number: Number(data.hole_number ?? 0),
          prize: String(data.prize ?? ''),
        },
      ].sort(byHole)
    case 'ClosestToPinEdited':
      return rows
        .map((c) =>
          c.closest_to_pin_id === event.aggregate_id
            ? {
                ...c,
                hole_number: Number(data.hole_number ?? c.hole_number),
                prize: String(data.prize ?? c.prize),
              }
            : c,
        )
        .sort(byHole)
    case 'ClosestToPinDeleted':
      return rows.filter((c) => c.closest_to_pin_id !== event.aggregate_id)
    default:
      return rows
  }
}

export function describeClosestToPin(event: CommandEvent): string {
  const data = (event.data ?? {}) as Record<string, unknown>
  switch (event.type) {
    case 'ClosestToPinCreated':
      return `Add closest-to-pin (hole ${data.hole_number ?? '?'})`
    case 'ClosestToPinEdited':
      return `Edit closest-to-pin (hole ${data.hole_number ?? '?'})`
    case 'ClosestToPinDeleted':
      return 'Remove closest-to-pin'
    default:
      return event.type
  }
}

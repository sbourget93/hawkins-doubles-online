/**
 * Client-side projection for the card-request aggregate — the TS mirror of
 * backend `projections/card_request.py`. A card request links two players (so it
 * can be entered before either registers) with a `prefer`/`avoid` type. Order
 * follows creation order (newest last), matching the server query.
 */
import type { CommandEvent } from '../../api/commands'
import type { CardRequest, RequestType } from '../../cardRequests/types'

export function reduceCardRequests(
  rows: CardRequest[],
  event: CommandEvent,
): CardRequest[] {
  const data = (event.data ?? {}) as Record<string, unknown>
  switch (event.type) {
    case 'CardRequestCreated':
      return [
        ...rows,
        {
          card_request_id: event.aggregate_id,
          league_event_id: String(data.league_event_id ?? ''),
          player_id_a: String(data.player_id_a ?? ''),
          player_id_b: String(data.player_id_b ?? ''),
          request_type: (data.request_type as RequestType) ?? 'prefer',
        },
      ]
    case 'CardRequestEdited':
      return rows.map((r) =>
        r.card_request_id === event.aggregate_id
          ? {
              ...r,
              player_id_a: String(data.player_id_a ?? r.player_id_a),
              player_id_b: String(data.player_id_b ?? r.player_id_b),
              request_type: (data.request_type as RequestType) ?? r.request_type,
            }
          : r,
      )
    case 'CardRequestDeleted':
      return rows.filter((r) => r.card_request_id !== event.aggregate_id)
    default:
      return rows
  }
}

export function describeCardRequest(event: CommandEvent): string {
  const data = (event.data ?? {}) as Record<string, unknown>
  switch (event.type) {
    case 'CardRequestCreated':
      return `Add card request (${data.request_type ?? '?'})`
    case 'CardRequestEdited':
      return `Edit card request (${data.request_type ?? '?'})`
    case 'CardRequestDeleted':
      return 'Remove card request'
    default:
      return event.type
  }
}

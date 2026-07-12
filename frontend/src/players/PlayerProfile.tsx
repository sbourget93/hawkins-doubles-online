import { formatDate } from '../leagueEvents/format'
import type { PlacementEntry } from './usePlayerHistories'

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", etc. */
function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`
}

/**
 * A player's profile: their full placement history — how many events they've
 * attended and, for each, where they finished and with whom. Reused anywhere a
 * player can be drilled into (roster page, rankings board, …); pass the player's
 * history from `usePlayerHistories()`.
 */
export default function PlayerProfile({ history }: { history: PlacementEntry[] }) {
  return (
    <div className="player-history">
      {history.length === 0 ? (
        <p className="player-history-empty">No recorded placements yet.</p>
      ) : (
        <>
          <p className="player-history-total">
            <strong>{history.length}</strong>{' '}
            {history.length === 1 ? 'event' : 'events'} attended
          </p>
          <ul className="player-history-list">
            {history.map((h) => (
              <li key={h.event.league_event_id} className="player-history-item">
                <span className="ph-place">
                  <strong>{ordinal(h.placement)}</strong>
                  {h.teamCount > 0 && ` (of ${h.teamCount})`}
                </span>
                <span className="ph-event">{formatDate(h.event.date)}</span>
                <span className="ph-partner">
                  {h.partners.length > 0 ? (
                    <>
                      with{' '}
                      {h.partners.map((partner, i) => (
                        <span key={i}>
                          {i > 0 && ' + '}
                          <strong>{partner}</strong>
                        </span>
                      ))}
                    </>
                  ) : (
                    'rado (no partner)'
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

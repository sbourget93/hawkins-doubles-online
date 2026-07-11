import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeagueEvents } from '../leagueEvents/store'
import { eventLabel, statusLabel } from '../leagueEvents/format'
import LeagueEventModal from '../leagueEvents/LeagueEventModal'

/**
 * Landing page: lists every league event and lets the admin create a new one via
 * a popup (default but editable date + title). Each row links into that event's
 * detail page and shows its title and current status.
 */
export default function LeagueEventsPage() {
  const { leagueEvents, createLeagueEvent } = useLeagueEvents()
  const [creating, setCreating] = useState(false)

  return (
    <section>
      <div className="league-form">
        <button type="button" className="full-width" onClick={() => setCreating(true)}>
          New League Event
        </button>
      </div>

      {leagueEvents.length === 0 ? (
        <p className="muted">No league events yet.</p>
      ) : (
        <ul className="league-list">
          {leagueEvents.map((le) => (
            <li key={le.league_event_id} className="league-row">
              <Link to={`/league-events/${le.league_event_id}`} className="league-row-link">
                <span className="league-title">{eventLabel(le)}</span>
                <span className={`status-badge status-badge--${le.state}`}>
                  {statusLabel(le.state)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <LeagueEventModal
          onClose={() => setCreating(false)}
          onSubmit={(date, title) => createLeagueEvent(date, title)}
        />
      )}
    </section>
  )
}

import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useLeagueEvents } from '../leagueEvents/store'
import { formatDate, statusLabel, todayIso } from '../leagueEvents/format'

/**
 * Landing page: lists every league event and lets the admin create a new one.
 * Each row links into that event's detail page. Kept deliberately simple — a row
 * shows "Hawkins Doubles - <date>" and the current status.
 */
export default function LeagueEventsPage() {
  const { leagueEvents, createLeagueEvent } = useLeagueEvents()

  return (
    <section>
      <h2>League Events</h2>

      <NewLeagueEventForm onCreate={createLeagueEvent} />

      {leagueEvents.length === 0 ? (
        <p className="muted">No league events yet.</p>
      ) : (
        <ul className="league-list">
          {leagueEvents.map((le) => (
            <li key={le.league_event_id} className="league-row">
              <Link to={`/league-events/${le.league_event_id}`} className="league-row-link">
                <span className="league-title">Hawkins Doubles - {formatDate(le.date)}</span>
                <span className={`status-badge status-badge--${le.state}`}>
                  {statusLabel(le.state)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function NewLeagueEventForm({ onCreate }: { onCreate: (date: string) => void }) {
  const [date, setDate] = useState(todayIso)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!date) return
    onCreate(date)
  }

  return (
    <form className="league-form" onSubmit={submit}>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        aria-label="League event date"
      />
      <button type="submit">New League Event</button>
    </form>
  )
}

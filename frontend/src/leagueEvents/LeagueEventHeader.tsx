import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLeagueEvents } from './store'
import { eventLabel } from './format'
import LeagueEventModal from './LeagueEventModal'
import PencilIcon from '../components/PencilIcon'
import TrashIcon from '../components/TrashIcon'

/**
 * Small title bar shown at the top of every league-event page: the event's title
 * plus pencil (edit) and trash (delete) buttons. Reads the event from the
 * app-wide store by id, so it drops into any of the per-state pages without
 * extra plumbing. Deleting returns to the events list.
 */
export default function LeagueEventHeader({ leagueEventId }: { leagueEventId: string }) {
  const { leagueEvents, editLeagueEvent, deleteLeagueEvent } = useLeagueEvents()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const leagueEvent = leagueEvents.find((le) => le.league_event_id === leagueEventId)

  if (!leagueEvent) return null

  const onDelete = () => {
    if (window.confirm('Delete this league event? This cannot be undone.')) {
      deleteLeagueEvent(leagueEvent.league_event_id)
      navigate('/')
    }
  }

  return (
    <div className="event-header le-header">
      <h2>{eventLabel(leagueEvent)}</h2>
      <div className="header-actions">
        <button
          type="button"
          className="icon-btn"
          aria-label="Edit league event"
          title="Edit league event"
          onClick={() => setEditing(true)}
        >
          <PencilIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Delete league event"
          title="Delete league event"
          onClick={onDelete}
        >
          <TrashIcon />
        </button>
      </div>
      {editing && (
        <LeagueEventModal
          initial={{ date: leagueEvent.date, title: leagueEvent.title }}
          onClose={() => setEditing(false)}
          onSubmit={(date, title) =>
            editLeagueEvent(leagueEvent.league_event_id, date, title)
          }
        />
      )}
    </div>
  )
}

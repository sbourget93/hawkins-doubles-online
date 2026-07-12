import { useMemo, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { usePlayers } from '../players/store'
import { useRegistrations } from '../registrations/store'
import { useCards } from '../cards/store'
import { useLeagueEvents } from '../leagueEvents/store'
import { formatDate } from '../leagueEvents/format'
import PlayerBadges from '../players/PlayerBadges'
import PlayerModal from '../players/PlayerModal'
import PencilIcon from '../components/PencilIcon'
import type { Player } from '../players/types'
import type { LeagueEvent } from '../leagueEvents/types'

/** One of a player's past finishes: where they placed, at which event, and with whom. */
interface PlacementEntry {
  event: LeagueEvent
  placement: number
  /** How many teams were ranked at the event, for context (e.g. "2nd of 5"). */
  teamCount: number
  partners: string[]
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", etc. */
function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`
}

/**
 * Players page. Everyone sees the roster; admins can add, edit, and soft-delete.
 * Rows mirror the registration page's styling. A search box filters the roster by
 * a case-insensitive name match; the + button and each row's pencil open the
 * shared add/edit popup. Clicking a player expands the row to show their full
 * placement history and who they partnered with.
 */
export default function PlayersPage() {
  const { isAdmin } = useAuth()
  const { players, addPlayer, editPlayer, deletePlayer } = usePlayers()
  const { registrations } = useRegistrations()
  const { cards, teams } = useCards()
  const { leagueEvents } = useLeagueEvents()
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  // When set, the edit modal is open for this player.
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  // player_ids whose placement history is expanded.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())

  // Full placement history for every player, keyed by player_id. A player's
  // placements come from their registrations that were assigned to a team whose
  // score (and therefore placement) has been entered; the team's other members
  // are the partner(s). Recomputed only when the underlying data changes.
  const historyByPlayer = useMemo(() => {
    const playerName = (id: string) => {
      const p = players.find((pl) => pl.player_id === id)
      return p ? `${p.first_name} ${p.last_name}` : 'Unknown player'
    }
    const teamById = new Map(teams.map((t) => [t.team_id, t]))
    const eventByCard = new Map(cards.map((c) => [c.card_id, c.league_event_id]))
    const eventById = new Map(leagueEvents.map((e) => [e.league_event_id, e]))
    const regsByTeam = new Map<string, typeof registrations>()
    for (const r of registrations) {
      if (!r.team_id) continue
      const list = regsByTeam.get(r.team_id) ?? []
      list.push(r)
      regsByTeam.set(r.team_id, list)
    }

    // How many teams were ranked (have a placement) at each event, so a player's
    // finish can be shown with context, e.g. "2nd of 5".
    const teamCountByEvent = new Map<string, number>()
    for (const team of teams) {
      if (team.placement == null) continue
      const eventId = eventByCard.get(team.card_id)
      if (!eventId) continue
      teamCountByEvent.set(eventId, (teamCountByEvent.get(eventId) ?? 0) + 1)
    }

    const byPlayer = new Map<string, PlacementEntry[]>()
    for (const r of registrations) {
      if (!r.team_id) continue
      const team = teamById.get(r.team_id)
      if (!team || team.placement == null) continue
      const event = eventById.get(r.league_event_id)
      if (!event) continue
      const partners = (regsByTeam.get(r.team_id) ?? [])
        .filter((o) => o.player_id !== r.player_id)
        .map((o) => playerName(o.player_id))
      const list = byPlayer.get(r.player_id) ?? []
      list.push({
        event,
        placement: team.placement,
        teamCount: teamCountByEvent.get(event.league_event_id) ?? 0,
        partners,
      })
      byPlayer.set(r.player_id, list)
    }
    // Most recent first.
    for (const list of byPlayer.values()) {
      list.sort((a, b) => b.event.date.localeCompare(a.event.date))
    }
    return byPlayer
  }, [players, registrations, cards, teams, leagueEvents])

  const toggle = (playerId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(playerId)) next.delete(playerId)
      else next.add(playerId)
      return next
    })

  const q = query.trim().toLowerCase()
  const visible = players
    .filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q))
    .sort((a, b) =>
      `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`),
    )

  return (
    <section>
      <div className="search-row">
        <div className="search-input-wrap">
          <input
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players…"
            aria-label="Search players"
          />
          {query && (
            <button
              type="button"
              className="search-clear"
              aria-label="Clear search"
              title="Clear search"
              onClick={() => setQuery('')}
            >
              ✕
            </button>
          )}
        </div>
        <button
          type="button"
          className="add-btn"
          aria-label="Add player"
          title={isAdmin ? 'Add player' : 'Admins only'}
          disabled={!isAdmin}
          onClick={() => setAdding(true)}
        >
          +
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="muted registered-empty">
          {players.length === 0 ? 'No players yet.' : 'No players match your search.'}
        </p>
      ) : (
        <div className="registered-panel">
          <ul className="player-list">
            {visible.map((player) => (
              <PlayerRow
                key={player.player_id}
                player={player}
                isAdmin={isAdmin}
                history={historyByPlayer.get(player.player_id) ?? []}
                expanded={expanded.has(player.player_id)}
                onToggle={() => toggle(player.player_id)}
                onEdit={() => setEditingPlayer(player)}
                onDelete={() => {
                  if (
                    window.confirm(`Delete ${player.first_name} ${player.last_name}?`)
                  ) {
                    deletePlayer(player.player_id)
                  }
                }}
              />
            ))}
          </ul>
        </div>
      )}

      {adding && (
        <PlayerModal onClose={() => setAdding(false)} onSubmit={(fields) => addPlayer(fields)} />
      )}
      {editingPlayer && (
        <PlayerModal
          initial={editingPlayer}
          onClose={() => setEditingPlayer(null)}
          onSubmit={(fields) => editPlayer(editingPlayer.player_id, fields)}
        />
      )}
    </section>
  )
}

function PlayerRow({
  player,
  isAdmin,
  history,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  player: Player
  isAdmin: boolean
  history: PlacementEntry[]
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const name = `${player.first_name} ${player.last_name}`
  return (
    <li className="player-entry">
      <div className="player-row">
        <button
          type="button"
          className="player-name-toggle"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          <span className="player-name">
            {name}
            <PlayerBadges pool={player.default_pool} isWoman={player.is_woman} />
          </span>
        </button>
        <span className="player-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label={`Edit ${name}`}
            title={isAdmin ? 'Edit player' : 'Admins only'}
            disabled={!isAdmin}
            onClick={onEdit}
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            className="subtle"
            aria-label={`Delete ${name}`}
            title={isAdmin ? 'Delete player' : 'Admins only'}
            disabled={!isAdmin}
            onClick={onDelete}
          >
            ✕
          </button>
        </span>
      </div>
      {expanded && (
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
      )}
    </li>
  )
}

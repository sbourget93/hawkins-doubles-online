import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useLeagueEvents } from '../leagueEvents/store'
import LeagueEventHeader from '../leagueEvents/LeagueEventHeader'
import { usePlayers } from '../players/store'
import { playerName as formatName } from '../players/format'
import { useRegistrations } from '../registrations/store'
import { useCards } from '../cards/store'
import { HOLE_ORDER } from '../cards/generateCards'
import type { Pool } from '../players/types'
import type { Registration } from '../registrations/types'
import type { Card, Team } from '../cards/types'

/** A net score for display: over-par scores get a leading "+" (e.g. 3 -> "+3");
    par and under-par are shown as-is (0, -2). */
function formatScore(score: number): string {
  return score > 0 ? `+${score}` : `${score}`
}

/** A place as an ordinal: 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 11 -> "11th", … */
function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

/**
 * Completed round. A read-only mirror of the in-progress scoresheet: every team's
 * net score, placement, and payout, plus the payout-vs-pool tally — but nothing
 * is editable. The single action re-opens the event (back to `in_progress`) so
 * the admin can correct a score or payout. More may be added here later.
 */
export default function RoundCompletedPage() {
  const { leagueEventId } = useParams()
  const { isAdmin } = useAuth()
  const { leagueEvents, loaded: eventsLoaded, setLeagueEventState } = useLeagueEvents()
  const { players } = usePlayers()
  const { registrations } = useRegistrations()
  const { cards, teams, loaded: cardsLoaded } = useCards()

  const leagueEvent = leagueEvents.find((le) => le.league_event_id === leagueEventId)

  const playerById = (playerId: string) => players.find((pl) => pl.player_id === playerId)
  const playerName = (playerId: string) => formatName(playerById(playerId))
  const poolFor = (r: Registration): Pool =>
    (r.pool_override ?? playerById(r.player_id)?.default_pool ?? 'B') as Pool

  const eventCards = cards.filter((c) => c.league_event_id === leagueEvent?.league_event_id)
  const cardById = new Map<string, Card>(eventCards.map((c) => [c.card_id, c]))
  const eventCardIds = new Set(eventCards.map((c) => c.card_id))
  const eventTeams = teams.filter((t) => eventCardIds.has(t.card_id))
  const teamById = new Map<string, Team>(eventTeams.map((t) => [t.team_id, t]))
  const regsByTeam = new Map<string, Registration[]>()
  for (const r of registrations) {
    if (r.team_id && r.league_event_id === leagueEvent?.league_event_id) {
      const list = regsByTeam.get(r.team_id) ?? []
      list.push(r)
      regsByTeam.set(r.team_id, list)
    }
  }

  // All registrations shown on this sheet (used for the pool tally below).
  const shownRegs = Array.from(regsByTeam.values()).flat()

  const holeRank = (hole: number) => {
    const i = HOLE_ORDER.indexOf(hole)
    return i === -1 ? HOLE_ORDER.length : i
  }
  const rankHole = (t: Team) => holeRank(cardById.get(t.card_id)?.starting_hole ?? 99)

  // Competition rank of every scored team from scores (equal scores share a rank).
  const scored = eventTeams
    .filter((t) => t.score != null)
    .slice()
    .sort((a, b) => a.score! - b.score!)
  const baseRankById = new Map<string, number>()
  let rank = 1
  scored.forEach((t, i) => {
    if (i === 0 || t.score !== scored[i - 1].score) rank = i + 1
    baseRankById.set(t.team_id, rank)
  })

  // Displayed place: the stored placement (which may be a manual tie pick),
  // falling back to the tied baseline. Null for unscored teams.
  const placeOf = (t: Team): number | null =>
    t.score == null ? null : t.placement ?? baseRankById.get(t.team_id) ?? null

  // Scored teams first (by score, then their place, then a stable card/id order),
  // unscored teams last.
  const sortKey = (t: Team) => [
    t.score == null ? Infinity : t.score,
    placeOf(t) ?? Infinity,
    rankHole(t),
    t.team_id,
  ]
  const order = eventTeams
    .slice()
    .sort((a, b) => {
      const ka = sortKey(a)
      const kb = sortKey(b)
      for (let i = 0; i < ka.length; i++) {
        if (ka[i] < kb[i]) return -1
        if (ka[i] > kb[i]) return 1
      }
      return 0
    })
    .map((t) => t.team_id)

  const totalPlayers = shownRegs.length
  const collected = totalPlayers * 7
  const totalPaid = eventTeams.reduce((sum, t) => sum + (t.payout_amount ?? 0), 0)
  const payoutsCoverPool = totalPaid >= collected

  if (!leagueEvent) {
    return (
      <section>
        <Link to="/" className="back-link">← League Events</Link>
        <p className="muted">{eventsLoaded ? 'League event not found.' : 'Loading…'}</p>
      </section>
    )
  }

  // Team members, each on their own line, sorted A-pool first then by name.
  const teamPlayers = (team: Team) => {
    const teamRegs = (regsByTeam.get(team.team_id) ?? []).slice().sort((a, b) => {
      const poolA = poolFor(a)
      const poolB = poolFor(b)
      if (poolA !== poolB) return poolA === 'A' ? -1 : 1
      return playerName(a.player_id).localeCompare(playerName(b.player_id))
    })
    const isRado = teamRegs.length === 1
    return (
      <div className="score-players">
        {teamRegs.map((r) => (
          <span key={r.registration_id} className="score-player">
            {playerName(r.player_id)}
            {isRado && <span className="summary-rado"> (rado)</span>}
          </span>
        ))}
      </div>
    )
  }

  const renderRow = (teamId: string) => {
    const team = teamById.get(teamId)
    if (!team) return null
    const place = placeOf(team)
    return (
      <li key={team.team_id} className="player-entry">
        <div className="score-row">
          <div className={`score-place${place == null ? ' chip--empty' : ''}`}>
            {place == null ? '—' : ordinal(place)}
          </div>
          <div className={`score-value${team.score == null ? ' chip--empty' : ''}`}>
            {team.score == null ? '—' : formatScore(team.score)}
          </div>
          {teamPlayers(team)}
          <div className={`score-payout${team.payout_amount == null ? ' chip--empty' : ''}`}>
            {`$${team.payout_amount ?? '—'}`}
          </div>
        </div>
      </li>
    )
  }

  return (
    <section>
      <LeagueEventHeader leagueEventId={leagueEvent.league_event_id} />
      {!cardsLoaded ? (
        <p className="muted">Loading…</p>
      ) : order.length === 0 ? (
        <p className="muted registered-empty">No teams for this event.</p>
      ) : (
        <div className="registered-panel">
          <ul className="player-list">{order.map((teamId) => renderRow(teamId))}</ul>
        </div>
      )}

      <p className={`payout-check${payoutsCoverPool ? '' : ' payout-check--short'}`}>
        Paid out ${totalPaid} of ${collected} collected ($7 × {totalPlayers}{' '}
        {totalPlayers === 1 ? 'player' : 'players'})
      </p>

      <div className="summary-actions">
        <button
          type="button"
          className="secondary"
          disabled={!isAdmin}
          title={isAdmin ? undefined : 'Admins only'}
          onClick={() => setLeagueEventState(leagueEvent.league_event_id, 'in_progress')}
        >
          Re-open League Event
        </button>
      </div>
    </section>
  )
}

import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useLeagueEvents } from '../leagueEvents/store'
import LeagueEventHeader from '../leagueEvents/LeagueEventHeader'
import { usePlayers } from '../players/store'
import { useRegistrations } from '../registrations/store'
import { useClosestToPins } from '../closestToPins/store'
import { useCards } from '../cards/store'
import { HOLE_ORDER } from '../cards/generateCards'
import { computeDisplayNames } from '../players/displayNames'
import type { Pool } from '../players/types'
import type { Registration } from '../registrations/types'
import type { ClosestToPin } from '../closestToPins/types'
import type { Card, Team } from '../cards/types'

/** How many holes into its round a card starting on `startingHole` plays `hole`.
 * All cards tee off at once (shotgun start), so the card with the smallest
 * offset reaches a hole first and the one with the largest reaches it last. */
function holeOffset(hole: number, startingHole: number): number {
  return ((hole - startingHole) % 18 + 18) % 18
}

/** CTP flags a card must carry out (it plays the hole first) or bring back in
 * (it plays the hole last), keyed by card id. */
function ctpFlagsByCard(
  cards: Card[],
  ctps: ClosestToPin[],
): Map<string, { out: ClosestToPin[]; in: ClosestToPin[] }> {
  const byCard = new Map<string, { out: ClosestToPin[]; in: ClosestToPin[] }>()
  const slot = (cardId: string) => {
    let s = byCard.get(cardId)
    if (!s) byCard.set(cardId, (s = { out: [], in: [] }))
    return s
  }
  for (const ctp of ctps) {
    let first: Card | undefined
    let last: Card | undefined
    let minOff = Infinity
    let maxOff = -Infinity
    for (const card of cards) {
      const off = holeOffset(ctp.hole_number, card.starting_hole)
      if (off < minOff) {
        minOff = off
        first = card
      }
      if (off > maxOff) {
        maxOff = off
        last = card
      }
    }
    if (first) slot(first.card_id).out.push(ctp)
    if (last) slot(last.card_id).in.push(ctp)
  }
  return byCard
}

/**
 * Round summary / read-off sheet. Shown once the admin confirms teams and the
 * event moves to `ready`. Lists every card farthest-hole-first (so the admin
 * calls out the far cards to send first), each team with its handicap (handicap
 * teams tinted pink), and which CTP flags each card carries out or brings back
 * in. Everything here is read-only — nothing is draggable or movable.
 */
export default function RoundSummaryPage() {
  const { leagueEventId } = useParams()
  const { isAdmin } = useAuth()
  const { leagueEvents, loaded: eventsLoaded, setLeagueEventState } = useLeagueEvents()
  const { players } = usePlayers()
  const { registrations } = useRegistrations()
  const { closestToPins } = useClosestToPins()
  const { cards, teams, loaded: cardsLoaded } = useCards()

  const leagueEvent = leagueEvents.find((le) => le.league_event_id === leagueEventId)

  if (!leagueEvent) {
    return (
      <section>
        <Link to="/" className="back-link">← League Events</Link>
        <p className="muted">{eventsLoaded ? 'League event not found.' : 'Loading…'}</p>
      </section>
    )
  }

  const playerById = (playerId: string) => players.find((pl) => pl.player_id === playerId)
  const playerName = (playerId: string) => {
    const p = playerById(playerId)
    return p ? `${p.first_name} ${p.last_name}` : 'Unknown player'
  }
  const poolFor = (r: Registration): Pool =>
    (r.pool_override ?? playerById(r.player_id)?.default_pool ?? 'B') as Pool

  const eventCards = cards.filter((c) => c.league_event_id === leagueEvent.league_event_id)
  const eventCardIds = new Set(eventCards.map((c) => c.card_id))
  const eventTeams = teams.filter((t) => eventCardIds.has(t.card_id))
  const teamsByCard = new Map<string, Team[]>()
  for (const t of eventTeams) {
    const list = teamsByCard.get(t.card_id) ?? []
    list.push(t)
    teamsByCard.set(t.card_id, list)
  }
  const regsByTeam = new Map<string, Registration[]>()
  for (const r of registrations) {
    if (r.team_id && r.league_event_id === leagueEvent.league_event_id) {
      const list = regsByTeam.get(r.team_id) ?? []
      list.push(r)
      regsByTeam.set(r.team_id, list)
    }
  }

  // Compact names computed over just the players shown on this sheet: first name
  // only when unique, otherwise the shortest last-name prefix that disambiguates.
  const shownRegs = Array.from(regsByTeam.values()).flat()
  const displayNames = computeDisplayNames(
    shownRegs.map((r) => {
      const p = playerById(r.player_id)
      return { playerId: r.player_id, first: p?.first_name ?? '', last: p?.last_name ?? '' }
    }),
  )
  const displayName = (playerId: string) => displayNames.get(playerId) ?? playerName(playerId)

  const eventCtps = closestToPins.filter(
    (c) => c.league_event_id === leagueEvent.league_event_id,
  )
  const ctpFlags = ctpFlagsByCard(eventCards, eventCtps)

  // Farthest hole first: cards are handed holes in closeness order (HOLE_ORDER,
  // closest first), so reversing that order lists the far cards — the ones to
  // send out first — at the top.
  const holeRank = (hole: number) => {
    const i = HOLE_ORDER.indexOf(hole)
    return i === -1 ? HOLE_ORDER.length : i
  }
  const sortedCards = eventCards
    .slice()
    .sort((a, b) => holeRank(b.starting_hole) - holeRank(a.starting_hole))

  const renderTeam = (team: Team) => {
    // A players first within a team, then alphabetical.
    const teamRegs = (regsByTeam.get(team.team_id) ?? []).slice().sort((a, b) => {
      const poolA = poolFor(a)
      const poolB = poolFor(b)
      if (poolA !== poolB) return poolA === 'A' ? -1 : 1
      return playerName(a.player_id).localeCompare(playerName(b.player_id))
    })
    const isRado = teamRegs.length === 1
    const hasHandicap = team.handicap !== 0
    return (
      <div key={team.team_id} className="summary-team">
        <span className="summary-team-players">
          {teamRegs.map((r) => displayName(r.player_id)).join(' + ')}
          {isRado && <span className="summary-rado"> (rado)</span>}
        </span>
        {hasHandicap && (
          <span className="summary-hcap" title={`${-team.handicap} handicap strokes`}>
            {team.handicap}
          </span>
        )}
      </div>
    )
  }

  return (
    <section>
      <LeagueEventHeader leagueEventId={leagueEvent.league_event_id} />
      {!cardsLoaded ? (
        <p className="muted">Loading…</p>
      ) : sortedCards.length === 0 ? (
        <p className="muted">No cards for this event.</p>
      ) : (
        <div>
          {sortedCards.map((card) => {
            const flags = ctpFlags.get(card.card_id)
            return (
              <div key={card.card_id} className="cards-card summary-card">
                <div className="hole-badge">
                  <span className="h">{card.starting_hole}</span>
                </div>
                <div className="summary-card-body">
                  <div className="summary-teams">
                    {(teamsByCard.get(card.card_id) ?? []).map((t) => renderTeam(t))}
                  </div>
                  {flags && (flags.out.length > 0 || flags.in.length > 0) && (
                    <div className="summary-ctps">
                      {flags.out.map((ctp) => (
                        <p key={`out-${ctp.closest_to_pin_id}`} className="summary-ctp">
                          🚩 Bring <b>out</b> the CTP flag on hole {ctp.hole_number}
                        </p>
                      ))}
                      {flags.in.map((ctp) => (
                        <p key={`in-${ctp.closest_to_pin_id}`} className="summary-ctp">
                          🏁 Bring <b>in</b> the CTP flag on hole {ctp.hole_number}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {isAdmin && (
        <div className="summary-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => setLeagueEventState(leagueEvent.league_event_id, 'forming_teams')}
          >
            Back to teams
          </button>
          <button
            type="button"
            onClick={() => setLeagueEventState(leagueEvent.league_event_id, 'in_progress')}
          >
            Start Round
          </button>
        </div>
      )}
    </section>
  )
}

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLeagueEvents } from '../leagueEvents/store'
import { usePlayers } from '../players/store'
import { useRegistrations } from '../registrations/store'
import { useCards, type MoveMember, type PlayerDrop } from '../cards/store'
import { formatDate } from '../leagueEvents/format'
import type { Pool } from '../players/types'
import type { Registration } from '../registrations/types'
import type { Team } from '../cards/types'

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1)

interface NameInfo {
  playerId: string
  first: string
  last: string
}

/**
 * Compact display names: show just the first name when it's unique among the
 * shown players; otherwise append the shortest last-name prefix that tells the
 * same-first-name players apart (full last name if two share first and last).
 */
function computeDisplayNames(infos: NameInfo[]): Map<string, string> {
  const byFirst = new Map<string, NameInfo[]>()
  for (const info of infos) {
    const key = info.first.toLowerCase()
    const group = byFirst.get(key) ?? []
    group.push(info)
    byFirst.set(key, group)
  }
  const labels = new Map<string, string>()
  for (const group of byFirst.values()) {
    if (group.length === 1) {
      labels.set(group[0].playerId, group[0].first)
      continue
    }
    for (const info of group) {
      const last = info.last
      let label = `${info.first} ${last}`.trim() // fallback: full last name
      for (let len = 1; len <= last.length; len++) {
        const prefix = last.slice(0, len).toLowerCase()
        const collisions = group.filter((o) => o.last.toLowerCase().startsWith(prefix)).length
        if (collisions === 1) {
          label = `${info.first} ${last.slice(0, len)}`
          break
        }
      }
      labels.set(info.playerId, label)
    }
  }
  return labels
}

/**
 * Cards & Starting Holes. Shows the generated cards (one per hole) with their
 * teams. The admin can drag a whole team by its handle onto another card/empty
 * hole, and drag an individual player by their handle to: another player (swap),
 * another team (join it, incl. filling a rado gap), a card's empty "ghost" team
 * slot (start a second team there), or an empty hole (start a new card). Every
 * move persists via the cards store. Reached from a league event in forming_teams.
 */
export default function CardsPage() {
  const { leagueEventId } = useParams()
  const { leagueEvents, loaded: eventsLoaded, refresh: refreshLeagueEvents } = useLeagueEvents()
  const { players } = usePlayers()
  const { registrations, refresh: refreshRegistrations } = useRegistrations()
  const { cards, teams, loaded: cardsLoaded, moveTeam, movePlayer, clearTeams } = useCards()

  const [busy, setBusy] = useState(false)

  // Refs so the drag callbacks can read the latest read model without changing
  // identity (which would re-subscribe the window listeners on every render).
  const registrationsRef = useRef(registrations)
  registrationsRef.current = registrations
  const playersRef = useRef(players)
  playersRef.current = players

  const onTeamDrop = useCallback(
    (teamId: string, toHole: number) => {
      if (leagueEventId) void moveTeam(leagueEventId, teamId, toHole)
    },
    [moveTeam, leagueEventId],
  )

  const onPlayerDrop = useCallback(
    async (registrationId: string, drop: PlayerDrop) => {
      if (!leagueEventId) return
      // Rebuild team memberships (with gender) from the latest read model.
      const membersByTeam = new Map<string, MoveMember[]>()
      for (const r of registrationsRef.current) {
        if (!r.team_id || r.league_event_id !== leagueEventId) continue
        const isWoman =
          playersRef.current.find((p) => p.player_id === r.player_id)?.is_woman ?? false
        const list = membersByTeam.get(r.team_id) ?? []
        list.push({ registrationId: r.registration_id, isWoman })
        membersByTeam.set(r.team_id, list)
      }
      await movePlayer(leagueEventId, registrationId, drop, membersByTeam)
      await refreshRegistrations()
    },
    [movePlayer, leagueEventId, refreshRegistrations],
  )

  const { clone, hover, onTeamGripDown, onPlayerGripDown } = useBoardDrag(onTeamDrop, onPlayerDrop)

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

  // Derive the board: cards for this event, each with its teams, and each team
  // with its registrations (the players on it).
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
  const teamById = new Map(eventTeams.map((t) => [t.team_id, t]))

  // Compact names computed over just the players shown on the board.
  const shownRegs = Array.from(regsByTeam.values()).flat()
  const displayNames = computeDisplayNames(
    shownRegs.map((r) => {
      const p = playerById(r.player_id)
      return { playerId: r.player_id, first: p?.first_name ?? '', last: p?.last_name ?? '' }
    }),
  )
  const displayName = (playerId: string) => displayNames.get(playerId) ?? playerName(playerId)

  // Cards ordered by hole, plus the single next unassigned hole as a drop target.
  const sortedCards = eventCards.slice().sort((a, b) => a.starting_hole - b.starting_hole)
  const occupiedHoles = new Set(eventCards.map((c) => c.starting_hole))
  const nextEmptyHole = HOLES.find((h) => !occupiedHoles.has(h)) ?? null

  const backToRegistration = async () => {
    if (
      !window.confirm(
        'Go back to registration? This deletes all generated teams and cards for this event.',
      )
    ) {
      return
    }
    setBusy(true)
    try {
      const assignedIds = registrations
        .filter((r) => r.league_event_id === leagueEvent.league_event_id && r.team_id)
        .map((r) => r.registration_id)
      await clearTeams(leagueEvent.league_event_id, assignedIds)
      await Promise.all([refreshRegistrations(), refreshLeagueEvents()])
    } finally {
      setBusy(false)
    }
  }

  const beginRound = () => {
    // Not implemented yet — just surface a placeholder indicator for now.
    console.log('Begin round: not implemented yet')
    window.alert('Begin round is not implemented yet.')
  }

  // ' drop-hi' when `key` is the currently hovered drop target, else ''.
  const hl = (key: string) => (hover === key ? ' drop-hi' : '')

  const renderPlayerRow = (r: Registration, asClone = false) => {
    const pool = poolFor(r)
    const dragged = !asClone && clone?.kind === 'player' && clone.id === r.registration_id
    return (
      <div
        key={r.registration_id}
        className={`cards-pl-row cards-pl-row--${pool === 'A' ? 'a' : 'b'}${
          dragged ? ' cards-pl-row--dragging' : ''
        }${asClone ? '' : hl(`player:${r.registration_id}`)}`}
        data-registration-id={asClone ? undefined : r.registration_id}
        title={asClone ? undefined : 'Drag to move player'}
        onPointerDown={asClone ? undefined : (e) => onPlayerGripDown(e, r.registration_id)}
      >
        <span className="cards-pl">{displayName(r.player_id)}</span>
      </div>
    )
  }

  const renderTeam = (team: Team, teamDimmed: boolean) => {
    // A players first within a team, then alphabetical.
    const teamRegs = (regsByTeam.get(team.team_id) ?? []).slice().sort((a, b) => {
      const poolA = poolFor(a)
      const poolB = poolFor(b)
      if (poolA !== poolB) return poolA === 'A' ? -1 : 1
      return playerName(a.player_id).localeCompare(playerName(b.player_id))
    })
    const isRado = teamRegs.length === 1
    // A complete team is exactly 2 players; rado (1) and three-player teams warn.
    const teamWarn = teamRegs.length !== 2
    return (
      <div
        key={team.team_id}
        data-team-id={team.team_id}
        className={`cards-team${teamWarn ? ' cards-team--warn' : ''}${
          teamDimmed ? ' cards-team--dragging' : ''
        }${hl(`team:${team.team_id}`)}`}
      >
        <div
          className="grip"
          title="Drag to move team"
          onPointerDown={(e) => onTeamGripDown(e, team.team_id)}
        >
          ⠿
        </div>
        <div className="cards-team-players">
          {teamRegs.map((r) => renderPlayerRow(r))}
          {isRado && (
            <div className="cards-rado-slot" title="Rado — drop a player here to fill">
              rado
            </div>
          )}
        </div>
      </div>
    )
  }

  const cloneTeam = clone?.kind === 'team' ? teamById.get(clone.id) : undefined
  const cloneReg =
    clone?.kind === 'player'
      ? registrations.find((r) => r.registration_id === clone.id)
      : undefined

  return (
    <section>
      <div className="event-header cards-date-header">
        <h2>{formatDate(leagueEvent.date)}</h2>
      </div>

      {!cardsLoaded ? (
        <p className="muted">Loading…</p>
      ) : eventTeams.length === 0 ? (
        <p className="muted">No teams yet — press Regenerate to generate them.</p>
      ) : (
        <div>
          {sortedCards.map((card) => {
            const cardTeams = teamsByCard.get(card.card_id) ?? []
            return (
              <div
                key={card.card_id}
                data-hole={card.starting_hole}
                className={`cards-card${cardTeams.length !== 2 ? ' cards-card--warn' : ''}${hl(
                  `hole:${card.starting_hole}`,
                )}`}
              >
                <div className="hole-badge">
                  <span className="h">{card.starting_hole}</span>
                </div>
                <div className="cards-card-teams">
                  {cardTeams.map((t) =>
                    renderTeam(t, clone?.kind === 'team' && clone.id === t.team_id),
                  )}
                  {cardTeams.length === 1 && (
                    <div
                      className={`cards-ghost-team${hl(`ghost:${card.card_id}`)}`}
                      data-ghost-card-id={card.card_id}
                      aria-label="Empty team slot — drop a player here"
                    />
                  )}
                </div>
              </div>
            )
          })}
          {nextEmptyHole != null && (
            <div
              data-hole={nextEmptyHole}
              className={`cards-empty-hole${hl(`hole:${nextEmptyHole}`)}`}
            >
              <div className="hole-badge">
                <span className="h">{nextEmptyHole}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="cards-actions">
        <button type="button" className="secondary" onClick={backToRegistration} disabled={busy}>
          Back to registration
        </button>
        <button type="button" onClick={beginRound} disabled={busy}>
          Confirm teams
        </button>
      </div>

      {clone && cloneTeam && (
        <div className="cards-drag-clone" style={{ left: clone.x, top: clone.y }}>
          {renderTeam(cloneTeam, false)}
        </div>
      )}
      {clone && cloneReg && (
        <div
          className="cards-drag-clone cards-drag-clone--player"
          style={{ left: clone.x, top: clone.y }}
        >
          <div className="cards-team">
            <div className="cards-team-players">{renderPlayerRow(cloneReg, true)}</div>
          </div>
        </div>
      )}
    </section>
  )
}

interface DragState {
  kind: 'team' | 'player'
  id: string
  fromHole?: number
  fromTeamId?: string
  startX: number
  startY: number
  offX: number
  offY: number
  active: boolean
}

interface CloneState {
  kind: 'team' | 'player'
  id: string
  x: number
  y: number
}

/**
 * Pointer-based drag & drop (touch + mouse) for both teams and players. A drag
 * starts on a grip handle and, once moved past a small threshold, follows the
 * pointer with a floating clone. On release it resolves the drop target under the
 * pointer and calls the matching handler. `hover` is the key of the current drop
 * target, used to highlight it while dragging.
 */
function useBoardDrag(
  onTeamDrop: (teamId: string, toHole: number) => void,
  onPlayerDrop: (registrationId: string, drop: PlayerDrop) => void,
) {
  const dragRef = useRef<DragState | null>(null)
  const [clone, setClone] = useState<CloneState | null>(null)
  const [hover, setHover] = useState<string | null>(null)

  const teamHoleAt = (x: number, y: number): number | null => {
    const zone = document.elementFromPoint(x, y)?.closest('[data-hole]') as HTMLElement | null
    return zone ? Number(zone.dataset.hole) : null
  }

  // Resolve where a dragged player would land, plus a highlight key.
  const playerTargetAt = (
    x: number,
    y: number,
    d: DragState,
  ): { drop: PlayerDrop; key: string } | null => {
    const el = document.elementFromPoint(x, y)
    if (!el) return null
    const playerEl = el.closest('[data-registration-id]') as HTMLElement | null
    if (playerEl && playerEl.dataset.registrationId !== d.id) {
      const withId = playerEl.dataset.registrationId!
      return { drop: { kind: 'swap', withRegistrationId: withId }, key: `player:${withId}` }
    }
    const ghostEl = el.closest('[data-ghost-card-id]') as HTMLElement | null
    if (ghostEl) {
      const cardId = ghostEl.dataset.ghostCardId!
      return { drop: { kind: 'newTeamOnCard', cardId }, key: `ghost:${cardId}` }
    }
    const teamEl = el.closest('[data-team-id]') as HTMLElement | null
    if (teamEl && teamEl.dataset.teamId !== d.fromTeamId) {
      const teamId = teamEl.dataset.teamId!
      return { drop: { kind: 'addToTeam', teamId }, key: `team:${teamId}` }
    }
    const emptyEl = el.closest('.cards-empty-hole') as HTMLElement | null
    if (emptyEl) {
      const hole = Number(emptyEl.dataset.hole)
      return { drop: { kind: 'newCardAtHole', hole }, key: `hole:${hole}` }
    }
    return null
  }

  const onTeamGripDown = useCallback((e: ReactPointerEvent, teamId: string) => {
    const teamEl = (e.target as HTMLElement).closest('.cards-team') as HTMLElement | null
    const holeEl = (e.target as HTMLElement).closest('[data-hole]') as HTMLElement | null
    if (!teamEl || !holeEl) return
    e.preventDefault()
    const r = teamEl.getBoundingClientRect()
    dragRef.current = {
      kind: 'team',
      id: teamId,
      fromHole: Number(holeEl.dataset.hole),
      startX: e.clientX,
      startY: e.clientY,
      offX: e.clientX - r.left,
      offY: e.clientY - r.top,
      active: false,
    }
  }, [])

  const onPlayerGripDown = useCallback((e: ReactPointerEvent, registrationId: string) => {
    const rowEl = (e.target as HTMLElement).closest('.cards-pl-row') as HTMLElement | null
    const teamEl = (e.target as HTMLElement).closest('.cards-team') as HTMLElement | null
    if (!rowEl) return
    e.preventDefault()
    const r = rowEl.getBoundingClientRect()
    dragRef.current = {
      kind: 'player',
      id: registrationId,
      fromTeamId: teamEl?.dataset.teamId,
      startX: e.clientX,
      startY: e.clientY,
      offX: e.clientX - r.left,
      offY: e.clientY - r.top,
      active: false,
    }
  }, [])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      if (!d.active) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return
        d.active = true
      }
      setClone({ kind: d.kind, id: d.id, x: e.clientX - d.offX, y: e.clientY - d.offY })
      if (d.kind === 'team') {
        const hole = teamHoleAt(e.clientX, e.clientY)
        setHover(hole != null && hole !== d.fromHole ? `hole:${hole}` : null)
      } else {
        setHover(playerTargetAt(e.clientX, e.clientY, d)?.key ?? null)
      }
    }
    const up = (e: PointerEvent) => {
      const d = dragRef.current
      dragRef.current = null
      if (d?.active) {
        if (d.kind === 'team') {
          const toHole = teamHoleAt(e.clientX, e.clientY)
          if (toHole != null && toHole !== d.fromHole) onTeamDrop(d.id, toHole)
        } else {
          const target = playerTargetAt(e.clientX, e.clientY, d)
          if (target) onPlayerDrop(d.id, target.drop)
        }
      }
      setClone(null)
      setHover(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [onTeamDrop, onPlayerDrop])

  return { clone, hover, onTeamGripDown, onPlayerGripDown }
}

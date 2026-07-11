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
import { HOLE_ORDER } from '../cards/generateCards'
import { computeDisplayNames } from '../players/displayNames'
import type { Pool } from '../players/types'
import type { Registration } from '../registrations/types'
import type { Team } from '../cards/types'

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
  const {
    leagueEvents,
    loaded: eventsLoaded,
    refresh: refreshLeagueEvents,
    setLeagueEventState,
  } = useLeagueEvents()
  const { players } = usePlayers()
  const { registrations, refresh: refreshRegistrations } = useRegistrations()
  const {
    cards,
    teams,
    loaded: cardsLoaded,
    moveTeam,
    changeCardHole,
    swapTeams,
    movePlayer,
    clearTeams,
  } = useCards()

  const [busy, setBusy] = useState(false)
  // The card whose starting hole is being reassigned (badge tapped), or null.
  const [holePickerCardId, setHolePickerCardId] = useState<string | null>(null)

  // Refs so the drag callbacks can read the latest read model without changing
  // identity (which would re-subscribe the window listeners on every render).
  const registrationsRef = useRef(registrations)
  registrationsRef.current = registrations
  const playersRef = useRef(players)
  playersRef.current = players

  const onTeamDrop = useCallback(
    (teamId: string, drop: TeamDrop) => {
      if (!leagueEventId) return
      if (drop.kind === 'swap') void swapTeams(teamId, drop.withTeamId)
      else void moveTeam(leagueEventId, teamId, drop.hole)
    },
    [moveTeam, swapTeams, leagueEventId],
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

  // Cards and the trailing next-unassigned-hole drop target both follow the
  // generateCards closeness ordering (the order holes are handed out during
  // generation), not plain numeric order. Holes off the list sort last.
  const holeRank = (hole: number) => {
    const i = HOLE_ORDER.indexOf(hole)
    return i === -1 ? HOLE_ORDER.length : i
  }
  const sortedCards = eventCards
    .slice()
    .sort((a, b) => holeRank(a.starting_hole) - holeRank(b.starting_hole))
  const occupiedHoles = new Set(eventCards.map((c) => c.starting_hole))
  const nextEmptyHole = HOLE_ORDER.find((h) => !occupiedHoles.has(h)) ?? null

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

  // Confirm the teams: move the event to `ready`. Once the store refreshes, the
  // parent route re-renders as the read-off summary page. The event can still be
  // pulled back to forming_teams from there if a late change is needed.
  const confirmTeams = () => {
    setLeagueEventState(leagueEvent.league_event_id, 'ready')
  }

  const pickerCard = eventCards.find((c) => c.card_id === holePickerCardId)
  const onPickHole = async (hole: number) => {
    setHolePickerCardId(null)
    if (pickerCard) await changeCardHole(leagueEvent.league_event_id, pickerCard.card_id, hole)
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
      {!cardsLoaded ? (
        <p className="muted">Loading…</p>
      ) : eventTeams.length === 0 ? (
        <p className="muted">No teams yet — press Regenerate to generate them.</p>
      ) : (
        <div>
          {sortedCards.map((card) => {
            const cardTeams = teamsByCard.get(card.card_id) ?? []
            // A card should hold two teams. Three teams is a soft (yellow) warning;
            // any other wrong count (one team, or four or more) is a hard (red) one.
            const warn =
              cardTeams.length === 3
                ? ' cards-card--warn-soft'
                : cardTeams.length !== 2
                  ? ' cards-card--warn'
                  : ''
            return (
              <div
                key={card.card_id}
                data-hole={card.starting_hole}
                className={`cards-card${warn}${hl(`hole:${card.starting_hole}`)}`}
              >
                <button
                  type="button"
                  className="hole-badge hole-badge--btn"
                  title="Change starting hole"
                  onClick={() => setHolePickerCardId(card.card_id)}
                >
                  <span className="h">{card.starting_hole}</span>
                </button>
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
        <button type="button" onClick={confirmTeams} disabled={busy}>
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

      {pickerCard && (
        <div
          className="hole-picker-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Change starting hole"
          onClick={() => setHolePickerCardId(null)}
        >
          <div className="hole-picker" onClick={(e) => e.stopPropagation()}>
            <p className="hole-picker-title">Move card to hole</p>
            <div className="hole-picker-grid">
              {Array.from({ length: 18 }, (_, i) => i + 1).map((hole) => {
                const isCurrent = hole === pickerCard.starting_hole
                const taken = occupiedHoles.has(hole) && !isCurrent
                return (
                  <button
                    key={hole}
                    type="button"
                    className={`hole-picker-cell${isCurrent ? ' hole-picker-cell--current' : ''}`}
                    disabled={taken || isCurrent}
                    onClick={() => void onPickHole(hole)}
                  >
                    {hole}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              className="secondary hole-picker-cancel"
              onClick={() => setHolePickerCardId(null)}
            >
              Cancel
            </button>
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
  // Players pick up only after being held still; the timer is cleared if the
  // finger moves first (a scroll) or is lifted. Teams don't use this.
  holdTimer: ReturnType<typeof setTimeout> | null
}

// How long a player chip must be held still before it's picked up, and how far
// the finger may drift in that window before we treat the gesture as a scroll.
const PLAYER_HOLD_MS = 250
const PLAYER_HOLD_MOVE_TOLERANCE = 10

// While dragging, holding within this many pixels of the top/bottom of the
// viewport auto-scrolls the page, ramping up to this many pixels per frame at
// the very edge so far-away cards can be reached without lifting the finger.
const EDGE_SCROLL_ZONE = 90
const EDGE_SCROLL_MAX_SPEED = 16

interface CloneState {
  kind: 'team' | 'player'
  id: string
  x: number
  y: number
}

/** Where a dragged team was dropped: onto another team (swap) or onto a hole. */
type TeamDrop = { kind: 'swap'; withTeamId: string } | { kind: 'toHole'; hole: number }

/**
 * Pointer-based drag & drop (touch + mouse) for both teams and players. A team
 * drag starts on its grip handle and picks up as soon as the pointer moves past
 * a small threshold. A player drag is a press-and-hold: the chip is only picked
 * up after the finger is held still for a moment, so a quick swipe on a chip
 * scrolls the page instead of dragging. Once active, the item follows the pointer
 * with a floating clone; on release the drop target under the pointer is resolved
 * and the matching handler is called. `hover` is the key of the current drop
 * target, used to highlight it while dragging. While a drag is active, holding
 * near the top or bottom edge auto-scrolls the page so off-screen holes can be
 * reached without lifting the finger.
 */
function useBoardDrag(
  onTeamDrop: (teamId: string, drop: TeamDrop) => void,
  onPlayerDrop: (registrationId: string, drop: PlayerDrop) => void,
) {
  const dragRef = useRef<DragState | null>(null)
  const [clone, setClone] = useState<CloneState | null>(null)
  const [hover, setHover] = useState<string | null>(null)

  // Latest pointer position (viewport coords) and the edge auto-scroll loop.
  // `startAutoScroll` is assigned by the effect so the grip handlers can kick it.
  const pointerRef = useRef({ x: 0, y: 0 })
  const rafRef = useRef<number | null>(null)
  const startAutoScrollRef = useRef<() => void>(() => {})

  // Resolve where a dragged team would land, plus a highlight key. Over another
  // team on a different card it's a swap; otherwise it's a move to that hole.
  const teamTargetAt = (
    x: number,
    y: number,
    d: DragState,
  ): { drop: TeamDrop; key: string } | null => {
    const el = document.elementFromPoint(x, y)
    if (!el) return null
    const teamEl = el.closest('[data-team-id]') as HTMLElement | null
    if (teamEl && teamEl.dataset.teamId !== d.id) {
      const teamHole = teamEl.closest('[data-hole]') as HTMLElement | null
      const hole = teamHole ? Number(teamHole.dataset.hole) : null
      if (hole != null && hole !== d.fromHole) {
        const withTeamId = teamEl.dataset.teamId!
        return { drop: { kind: 'swap', withTeamId }, key: `team:${withTeamId}` }
      }
    }
    const holeEl = el.closest('[data-hole]') as HTMLElement | null
    if (holeEl) {
      const hole = Number(holeEl.dataset.hole)
      if (hole !== d.fromHole) return { drop: { kind: 'toHole', hole }, key: `hole:${hole}` }
    }
    return null
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

  // The drop-target highlight key under a point for the current drag (or null).
  const resolveHoverKey = (x: number, y: number, d: DragState): string | null => {
    if (d.kind === 'team') return teamTargetAt(x, y, d)?.key ?? null
    return playerTargetAt(x, y, d)?.key ?? null
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
      holdTimer: null,
    }
    pointerRef.current = { x: e.clientX, y: e.clientY }
    startAutoScrollRef.current()
  }, [])

  const onPlayerGripDown = useCallback((e: ReactPointerEvent, registrationId: string) => {
    const rowEl = (e.target as HTMLElement).closest('.cards-pl-row') as HTMLElement | null
    const teamEl = (e.target as HTMLElement).closest('.cards-team') as HTMLElement | null
    if (!rowEl) return
    // Don't preventDefault here: while waiting for the hold we let the browser
    // scroll the page normally if the finger moves.
    const r = rowEl.getBoundingClientRect()
    // Pick up only after the finger is held still for PLAYER_HOLD_MS.
    const holdTimer = setTimeout(() => {
      const d = dragRef.current
      if (!d || d.id !== registrationId || d.active) return
      d.active = true
      d.holdTimer = null
      setClone({ kind: 'player', id: d.id, x: d.startX - d.offX, y: d.startY - d.offY })
      navigator.vibrate?.(15)
    }, PLAYER_HOLD_MS)
    dragRef.current = {
      kind: 'player',
      id: registrationId,
      fromTeamId: teamEl?.dataset.teamId,
      startX: e.clientX,
      startY: e.clientY,
      offX: e.clientX - r.left,
      offY: e.clientY - r.top,
      active: false,
      holdTimer,
    }
    pointerRef.current = { x: e.clientX, y: e.clientY }
    startAutoScrollRef.current()
  }, [])

  useEffect(() => {
    const stopAutoScroll = () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    const clearDrag = () => {
      const d = dragRef.current
      if (d?.holdTimer) clearTimeout(d.holdTimer)
      dragRef.current = null
      stopAutoScroll()
      setClone(null)
      setHover(null)
    }
    const move = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      pointerRef.current = { x: e.clientX, y: e.clientY }
      if (!d.active) {
        const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY)
        if (d.kind === 'player') {
          // Still waiting for the hold — real movement means the user is
          // scrolling, so abandon the drag and let the page scroll.
          if (dist > PLAYER_HOLD_MOVE_TOLERANCE) clearDrag()
          return
        }
        // Teams pick up immediately once past a small threshold.
        if (dist < 6) return
        d.active = true
      }
      setClone({ kind: d.kind, id: d.id, x: e.clientX - d.offX, y: e.clientY - d.offY })
      setHover(resolveHoverKey(e.clientX, e.clientY, d))
    }
    const up = (e: PointerEvent) => {
      const d = dragRef.current
      if (d?.holdTimer) clearTimeout(d.holdTimer)
      dragRef.current = null
      stopAutoScroll()
      if (d?.active) {
        if (d.kind === 'team') {
          const target = teamTargetAt(e.clientX, e.clientY, d)
          if (target) onTeamDrop(d.id, target.drop)
        } else {
          const target = playerTargetAt(e.clientX, e.clientY, d)
          if (target) onPlayerDrop(d.id, target.drop)
        }
      }
      setClone(null)
      setHover(null)
    }
    // Once a drag is active, auto-scroll the page while the finger sits near the
    // top or bottom edge, then refresh the highlighted drop target since new
    // cards have moved under the (stationary) pointer.
    const tick = () => {
      const d = dragRef.current
      if (!d) {
        rafRef.current = null
        return
      }
      if (d.active) {
        const { x, y } = pointerRef.current
        const h = window.innerHeight
        let speed = 0
        if (y < EDGE_SCROLL_ZONE) {
          speed = -EDGE_SCROLL_MAX_SPEED * ((EDGE_SCROLL_ZONE - y) / EDGE_SCROLL_ZONE)
        } else if (y > h - EDGE_SCROLL_ZONE) {
          speed = EDGE_SCROLL_MAX_SPEED * ((y - (h - EDGE_SCROLL_ZONE)) / EDGE_SCROLL_ZONE)
        }
        if (speed !== 0) {
          window.scrollBy(0, speed)
          setHover(resolveHoverKey(x, y, d))
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    startAutoScrollRef.current = () => {
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick)
    }
    // Once a player drag is active, stop the browser from scrolling underneath
    // it (touch-action lets the page pan until pickup, so we block it here).
    const blockScroll = (e: TouchEvent) => {
      if (dragRef.current?.active) e.preventDefault()
    }
    // If the page actually scrolls while a press is still waiting to pick up, the
    // user is scrolling, not dragging — cancel the pending pickup so the scroll
    // flows normally. This matters most on a dense board where every touch lands
    // on a chip. Scrolls while a drag is active (incl. our own edge auto-scroll)
    // are ignored.
    const onScroll = () => {
      const d = dragRef.current
      if (d && !d.active) clearDrag()
    }
    // A long press pops the browser's context menu, which swallows the pointerup
    // that ends a drag — leaving it stuck active and permanently blocking scroll.
    // While a press is in progress, suppress that menu and reset the drag state.
    const onContextMenu = (e: Event) => {
      if (dragRef.current) {
        e.preventDefault()
        clearDrag()
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', clearDrag)
    window.addEventListener('touchmove', blockScroll, { passive: false })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('contextmenu', onContextMenu)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', clearDrag)
      window.removeEventListener('touchmove', blockScroll)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('contextmenu', onContextMenu)
      stopAutoScroll()
      startAutoScrollRef.current = () => {}
    }
  }, [onTeamDrop, onPlayerDrop])

  return { clone, hover, onTeamGripDown, onPlayerGripDown }
}

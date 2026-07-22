import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useLeagueEvents } from '../leagueEvents/store'
import LeagueEventHeader from '../leagueEvents/LeagueEventHeader'
import TeamPlayers from '../components/TeamPlayers'
import { usePlayers } from '../players/store'
import { useRegistrations } from '../registrations/store'
import { useCards } from '../cards/store'
import { HOLE_ORDER } from '../cards/generateCards'
import { playerName as formatName } from '../players/format'
import type { Pool } from '../players/types'
import type { Registration } from '../registrations/types'
import type { Card, Team } from '../cards/types'
import { computePayouts } from '../cards/payouts'

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
 * Round in progress. The admin types each team's net score; placements are
 * derived from those scores (fewer strokes = better), with equal scores tied for
 * a place. A tie can be resolved by tapping a tied team's place badge and picking
 * one of the group's positions (e.g. three teams tied for 2nd can each be set to
 * 2nd, 3rd, or 4th). Editing any score re-derives placements and clears manual
 * tie picks back to a straight tie. Score drives the ranking; `placement` records
 * how a tie was resolved.
 */
export default function RoundInProgressPage() {
  const { leagueEventId } = useParams()
  const { isAdmin } = useAuth()
  const { leagueEvents, loaded: eventsLoaded, setLeagueEventState } = useLeagueEvents()
  const { players } = usePlayers()
  const { registrations } = useRegistrations()
  const {
    cards,
    teams,
    loaded: cardsLoaded,
    setTeamPlacements,
    setTeamScore,
    setTeamPayouts,
  } = useCards()

  // The team whose placement is being picked (tie badge tapped), or null.
  const [pickerTeamId, setPickerTeamId] = useState<string | null>(null)
  // The team whose score is being edited (score chip tapped), or null.
  const [scoreTeamId, setScoreTeamId] = useState<string | null>(null)
  // The team whose payout is being edited (payout chip tapped), or null.
  const [payoutTeamId, setPayoutTeamId] = useState<string | null>(null)
  // Whether the "clear all payouts" confirmation is open.
  const [confirmClear, setConfirmClear] = useState(false)

  const leagueEvent = leagueEvents.find((le) => le.league_event_id === leagueEventId)

  const playerById = useCallback(
    (playerId: string) => players.find((pl) => pl.player_id === playerId),
    [players],
  )
  const playerName = useCallback(
    (playerId: string) => formatName(playerById(playerId)),
    [playerById],
  )
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

  const displayName = playerName
  const shownRegs = Array.from(regsByTeam.values()).flat()

  const holeRank = (hole: number) => {
    const i = HOLE_ORDER.indexOf(hole)
    return i === -1 ? HOLE_ORDER.length : i
  }
  const rankHole = (t: Team) => holeRank(cardById.get(t.card_id)?.starting_hole ?? 99)

  // Base competition rank of every scored team purely from scores (equal scores
  // share a rank), plus each score's group size. `computeBaseRanks` is reused to
  // re-derive the tied baseline when a score changes.
  const computeBaseRanks = (list: Team[]) => {
    const scored = list.filter((t) => t.score != null).slice().sort((a, b) => a.score! - b.score!)
    const rankById = new Map<string, number>()
    let rank = 1
    scored.forEach((t, i) => {
      if (i === 0 || t.score !== scored[i - 1].score) rank = i + 1
      rankById.set(t.team_id, rank)
    })
    return rankById
  }
  const baseRankById = computeBaseRanks(eventTeams)
  const sizeByScore = new Map<number, number>()
  for (const t of eventTeams) {
    if (t.score != null) sizeByScore.set(t.score, (sizeByScore.get(t.score) ?? 0) + 1)
  }

  // Displayed place: the stored placement (which may be a manual tie pick),
  // falling back to the tied baseline. Null for unscored teams.
  const placeOf = (t: Team): number | null =>
    t.score == null ? null : t.placement ?? baseRankById.get(t.team_id) ?? null
  const groupSize = (t: Team) => (t.score == null ? 0 : sizeByScore.get(t.score) ?? 0)

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

  // Entering/clearing a score re-derives every placement from scores (a straight
  // tied baseline), discarding manual tie picks, and saves it all atomically. A
  // score change also invalidates the payouts, so every team's payout is cleared
  // in the same command.
  const onScore = (teamId: string, score: number | null) => {
    const working = eventTeams.map((t) => (t.team_id === teamId ? { ...t, score } : t))
    const baseRanks = computeBaseRanks(working)
    const updates = working.map((t) => ({
      teamId: t.team_id,
      placement: t.score == null ? null : baseRanks.get(t.team_id) ?? null,
    }))
    void setTeamScore(teamId, score, updates, eventTeams.map((t) => t.team_id))
  }

  const pickerTeam = eventTeams.find((t) => t.team_id === pickerTeamId)
  const scoreTeam = eventTeams.find((t) => t.team_id === scoreTeamId)
  const payoutTeam = eventTeams.find((t) => t.team_id === payoutTeamId)
  const onPickPlacement = (placement: number) => {
    if (pickerTeam) void setTeamPlacements([{ teamId: pickerTeam.team_id, placement }])
    setPickerTeamId(null)
  }

  const onPayout = (teamId: string, payout: number | null) =>
    void setTeamPayouts([{ teamId, payout_amount: payout }])

  // Payouts can only be calculated once every team has a net score; before that
  // the placements (and so the payouts) aren't final.
  const allScored = eventTeams.length > 0 && eventTeams.every((t) => t.score != null)

  // Baseline payouts from the PDGA amateur top-45% table (keyed by team count),
  // assigned by placement; the admin can refine any team afterwards.
  const onCalculatePayouts = () => {
    if (!allScored) return
    void setTeamPayouts(
      computePayouts(
        eventTeams.map((t) => ({
          teamId: t.team_id,
          placement: placeOf(t),
          playerCount: (regsByTeam.get(t.team_id) ?? []).length,
        })),
      ),
    )
  }

  // Guardrail above the button: the pool collected ($7 per player) vs. how much
  // the current payouts hand out. Payouts must cover the pool — rounding may run
  // a dollar or two over, never under.
  const totalPlayers = shownRegs.length
  const collected = totalPlayers * 7
  const totalPaid = eventTeams.reduce((sum, t) => sum + (t.payout_amount ?? 0), 0)
  const payoutsCoverPool = totalPaid >= collected

  // Clear every team's payout for this event (the eraser button, after confirm).
  const hasPayouts = eventTeams.some((t) => t.payout_amount != null)
  const onClearPayouts = () => {
    void setTeamPayouts(eventTeams.map((t) => ({ teamId: t.team_id, payout_amount: null })))
    setConfirmClear(false)
  }

  if (!leagueEvent) {
    return (
      <section>
        <Link to="/" className="back-link">← League Events</Link>
        <p className="muted">{eventsLoaded ? 'League event not found.' : 'Loading…'}</p>
      </section>
    )
  }

  const teamNames = (team: Team) => {
    const teamRegs = (regsByTeam.get(team.team_id) ?? []).slice().sort((a, b) => {
      const poolA = poolFor(a)
      const poolB = poolFor(b)
      if (poolA !== poolB) return poolA === 'A' ? -1 : 1
      return playerName(a.player_id).localeCompare(playerName(b.player_id))
    })
    const isRado = teamRegs.length === 1
    return <TeamPlayers names={teamRegs.map((r) => displayName(r.player_id))} isRado={isRado} />
  }

  const renderRow = (teamId: string) => {
    const team = teamById.get(teamId)
    if (!team) return null
    const place = placeOf(team)
    const tied = groupSize(team) > 1
    return (
      <div key={team.team_id} className="cards-card summary-card score-row">
        <button
          type="button"
          className={`score-chip${team.score == null ? ' chip--empty' : ''}`}
          title={isAdmin ? 'Edit net score' : 'Admins only'}
          disabled={!isAdmin}
          onClick={() => setScoreTeamId(team.team_id)}
        >
          {team.score ?? '—'}
        </button>
        {tied ? (
          <button
            type="button"
            className="hole-badge place-badge hole-badge--btn"
            title={isAdmin ? 'Set placement within the tie' : 'Admins only'}
            disabled={!isAdmin}
            onClick={() => setPickerTeamId(team.team_id)}
          >
            <span className="h">{place == null ? '—' : ordinal(place)}</span>
          </button>
        ) : (
          <div className="hole-badge place-badge">
            <span className="h">{place == null ? '—' : ordinal(place)}</span>
          </div>
        )}
        <div className="summary-card-body">
          <div className="summary-team">{teamNames(team)}</div>
        </div>
        <button
          type="button"
          className={`payout-chip${team.payout_amount == null ? ' chip--empty' : ''}`}
          title={isAdmin ? 'Edit payout' : 'Admins only'}
          disabled={!isAdmin}
          onClick={() => setPayoutTeamId(team.team_id)}
        >
          {`$${team.payout_amount ?? '—'}`}
        </button>
      </div>
    )
  }

  // Options offered for a tied team: its group's positions, e.g. a 3-way tie for
  // 2nd offers 2nd, 3rd, 4th.
  const pickerBase = pickerTeam ? baseRankById.get(pickerTeam.team_id) ?? 1 : 1
  const pickerOptions = pickerTeam
    ? Array.from({ length: groupSize(pickerTeam) }, (_, i) => pickerBase + i)
    : []

  return (
    <section>
      <LeagueEventHeader leagueEventId={leagueEvent.league_event_id} />
      {!cardsLoaded ? (
        <p className="muted">Loading…</p>
      ) : order.length === 0 ? (
        <p className="muted">No teams for this event.</p>
      ) : (
        <div>{order.map((teamId) => renderRow(teamId))}</div>
      )}

      <p className={`payout-check${payoutsCoverPool ? '' : ' payout-check--short'}`}>
        Paying out ${totalPaid} of ${collected} collected ($7 × {totalPlayers}{' '}
        {totalPlayers === 1 ? 'player' : 'players'})
      </p>
      <div className="calc-payouts-row">
        <button
          type="button"
          className="calc-payouts"
          disabled={!isAdmin || !allScored}
          title={isAdmin ? undefined : 'Admins only'}
          onClick={onCalculatePayouts}
        >
          Calculate payouts
        </button>
        <button
          type="button"
          className="secondary clear-payouts"
          title={isAdmin ? 'Clear all payouts' : 'Admins only'}
          aria-label="Clear all payouts"
          disabled={!isAdmin || !hasPayouts}
          onClick={() => setConfirmClear(true)}
        >
          🧹
        </button>
      </div>
      {isAdmin && !allScored && (
        <p className="muted calc-payouts-hint">
          Enter every team's score to calculate payouts.
        </p>
      )}

      <div className="summary-actions">
        <button
          type="button"
          className="secondary"
          disabled={!isAdmin}
          title={isAdmin ? undefined : 'Admins only'}
          onClick={() => setLeagueEventState(leagueEvent.league_event_id, 'ready')}
        >
          Back to summary
        </button>
        <button
          type="button"
          disabled={!isAdmin}
          title={isAdmin ? undefined : 'Admins only'}
          onClick={() => setLeagueEventState(leagueEvent.league_event_id, 'completed')}
        >
          Complete round
        </button>
      </div>

      {pickerTeam && (
        <div
          className="hole-picker-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Set placement"
          onClick={() => setPickerTeamId(null)}
        >
          <div className="hole-picker" onClick={(e) => e.stopPropagation()}>
            <p className="hole-picker-title">Placement in the tie</p>
            <div className="place-picker-row">
              {pickerOptions.map((value) => {
                const isCurrent = value === placeOf(pickerTeam)
                return (
                  <button
                    key={value}
                    type="button"
                    className={`place-picker-cell${isCurrent ? ' place-picker-cell--current' : ''}`}
                    onClick={() => onPickPlacement(value)}
                  >
                    {ordinal(value)}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              className="secondary hole-picker-cancel"
              onClick={() => setPickerTeamId(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {scoreTeam && (
        <EditNumberModal
          title="Net score"
          value={scoreTeam.score}
          onClose={() => setScoreTeamId(null)}
          onSave={(v) => {
            onScore(scoreTeam.team_id, v)
            setScoreTeamId(null)
          }}
        />
      )}

      {payoutTeam && (
        <EditNumberModal
          title="Payout"
          prefix="$"
          value={payoutTeam.payout_amount}
          onClose={() => setPayoutTeamId(null)}
          onSave={(v) => {
            onPayout(payoutTeam.team_id, v)
            setPayoutTeamId(null)
          }}
        />
      )}

      {confirmClear && (
        <div className="modal-backdrop" onClick={() => setConfirmClear(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Clear all payouts"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="modal-title">Clear all payouts?</h3>
            <p className="muted">
              This removes every team's payout for this event. You can recalculate afterwards.
            </p>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
              <button type="button" onClick={onClearPayouts}>
                Clear payouts
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/** Popup to set a team's score or payout. Submits an integer (or null when
 * cleared) on Save; closes on Cancel, Escape, or a backdrop tap. An optional
 * prefix (e.g. "$") sits flush against the number. */
function EditNumberModal({
  title,
  prefix,
  value,
  onClose,
  onSave,
}: {
  title: string
  prefix?: string
  value: number | null
  onClose: () => void
  onSave: (value: number | null) => void
}) {
  const [text, setText] = useState(value == null ? '' : String(value))
  const inputRef = useRef<HTMLInputElement>(null)

  // Select the current value on open so typing overwrites it (a later click can
  // still place the cursor to edit in place).
  useEffect(() => {
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (trimmed === '') return onSave(null)
    const n = Number(trimmed)
    if (!Number.isInteger(n)) return // reject non-integer, keep the modal open
    onSave(n)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title">{title}</h3>
        <form className="modal-form" onSubmit={submit}>
          <label className="field">
            <span>{title}</span>
            <div className="amount-entry">
              {prefix && <span className="amount-entry-prefix">{prefix}</span>}
              <input
                ref={inputRef}
                autoFocus
                inputMode="numeric"
                value={text}
                aria-label={title}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit">Save</button>
          </div>
        </form>
      </div>
    </div>
  )
}

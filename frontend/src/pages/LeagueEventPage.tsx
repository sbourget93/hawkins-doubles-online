import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useLeagueEvents } from '../leagueEvents/store'
import { usePlayers } from '../players/store'
import { playerName as formatName } from '../players/format'
import { useRegistrations } from '../registrations/store'
import { useClosestToPins } from '../closestToPins/store'
import { useCardRequests } from '../cardRequests/store'
import { useCards } from '../cards/store'
import { generateTeams, type Entrant } from '../cards/generateTeams'
import { generateCards, type CardRequestPlan } from '../cards/generateCards'
import { statusLabel } from '../leagueEvents/format'
import LeagueEventHeader from '../leagueEvents/LeagueEventHeader'
import PlayerBadges from '../players/PlayerBadges'
import AddPlayerCombo from '../players/AddPlayerCombo'
import NewPlayerModal from '../players/NewPlayerModal'
import PencilIcon from '../components/PencilIcon'
import CardsPage from './CardsPage'
import RoundSummaryPage from './RoundSummaryPage'
import RoundInProgressPage from './RoundInProgressPage'
import RoundCompletedPage from './RoundCompletedPage'
import type { Player, Pool } from '../players/types'
import type { Registration } from '../registrations/types'
import type { ClosestToPin } from '../closestToPins/types'
import type { CardRequest, RequestType } from '../cardRequests/types'

/**
 * A single league event. Reads it out of the app-wide league-events store
 * (so a deep link / refresh works once the list loads). The admin registers
 * players (type-ahead add or create-a-new-player), tracks payment, manages
 * closest-to-pins, and generates teams.
 */
export default function LeagueEventPage() {
  const { leagueEventId } = useParams()
  const { isAdmin } = useAuth()
  const { leagueEvents, loaded } = useLeagueEvents()
  const { players, editPlayer } = usePlayers()
  const {
    registrations,
    registerPlayer,
    setPaid,
    setPoolOverride,
    unregister,
    createAndRegisterPlayer,
  } = useRegistrations()
  const { closestToPins, addClosestToPin, editClosestToPin, removeClosestToPin } =
    useClosestToPins()
  const { cardRequests, addCardRequest, editCardRequest, removeCardRequest } =
    useCardRequests()
  const { saveTeamPlan } = useCards()
  const leagueEvent = leagueEvents.find((le) => le.league_event_id === leagueEventId)

  // True while a team generation is submitting, to disable the button.
  const [generating, setGenerating] = useState(false)

  // When set, the register-new-player modal is open, seeded from the combobox text.
  const [newPlayerSeed, setNewPlayerSeed] = useState<{ first: string; last: string } | null>(
    null,
  )
  const [ctpModalOpen, setCtpModalOpen] = useState(false)
  // When set, the edit-CTP modal is open for this closest-to-pin.
  const [editingCtp, setEditingCtp] = useState<ClosestToPin | null>(null)
  const [cardRequestModalOpen, setCardRequestModalOpen] = useState(false)
  // When set, the edit-card-request modal is open for this request.
  const [editingCardRequest, setEditingCardRequest] = useState<CardRequest | null>(null)
  // When set, the pool-override modal is open for this registration.
  const [poolOverrideReg, setPoolOverrideReg] = useState<Registration | null>(null)

  // Each state renders a different page at the same URL; reset scroll to the top
  // when the state changes so a new page never starts mid-scroll.
  const eventState = leagueEvent?.state
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [eventState])

  if (!leagueEvent) {
    return (
      <section>
        <Link to="/" className="back-link">← League Events</Link>
        <p className="muted">{loaded ? 'League event not found.' : 'Loading…'}</p>
      </section>
    )
  }

  // Only the view for the event's current state is reachable. Registration shows
  // the check-in UI below; forming_teams shows the cards page; later states get a
  // simple status placeholder until their own screens are built.
  if (leagueEvent.state === 'forming_teams') {
    return <CardsPage />
  }
  if (leagueEvent.state === 'ready') {
    return <RoundSummaryPage />
  }
  if (leagueEvent.state === 'in_progress') {
    return <RoundInProgressPage />
  }
  if (leagueEvent.state === 'completed') {
    return <RoundCompletedPage />
  }
  if (leagueEvent.state !== 'registration') {
    return (
      <section>
        <LeagueEventHeader leagueEventId={leagueEvent.league_event_id} />
        <p className="event-summary">
          This event is <b>{statusLabel(leagueEvent.state)}</b>.
        </p>
      </section>
    )
  }

  const playerById = (playerId: string) => players.find((pl) => pl.player_id === playerId)
  const playerName = (playerId: string) => formatName(playerById(playerId))

  const poolFor = (r: Registration): Pool =>
    (r.pool_override ?? playerById(r.player_id)?.default_pool ?? 'B') as Pool

  const eventRegistrations = registrations
    .filter((r) => r.league_event_id === leagueEvent.league_event_id)
    .sort((a, b) => playerName(a.player_id).localeCompare(playerName(b.player_id)))
  const registeredIds = new Set(eventRegistrations.map((r) => r.player_id))
  const availablePlayers = players.filter((p) => !registeredIds.has(p.player_id))
  const poolACount = eventRegistrations.filter((r) => poolFor(r) === 'A').length
  const poolBCount = eventRegistrations.length - poolACount
  const eventCtps = closestToPins
    .filter((c) => c.league_event_id === leagueEvent.league_event_id)
    .sort((a, b) => a.hole_number - b.hole_number)
  // Card requests are admin-only end to end (the section below is hidden from
  // non-admins and the backend 403s their fetch), so no per-request filtering.
  const eventCardRequests = cardRequests.filter(
    (c) => c.league_event_id === leagueEvent.league_event_id,
  )
  // Card requests can be entered before players register, so pick from the whole
  // roster (sorted by name), not just this event's registrations.
  const playersByName = [...players].sort((a, b) =>
    formatName(a).localeCompare(formatName(b)),
  )

  // Open the register-new-player modal, seeding the name from the combobox text.
  const startNewPlayer = (typed: string) => {
    const [first, ...rest] = typed.trim().split(/\s+/)
    setNewPlayerSeed({ first: first ?? '', last: rest.join(' ') })
  }

  // Randomly form teams + cards and move the event to forming_teams. Refreshes the
  // registration/league-event stores whose data the generation command also
  // changed; the state flip re-renders this route as the cards page.
  const onGenerateTeams = async () => {
    if (eventRegistrations.length === 0) {
      window.alert('Register players before generating teams.')
      return
    }
    setGenerating(true)
    try {
      const entrants: Entrant[] = eventRegistrations.map((r) => {
        const player = playerById(r.player_id)
        return {
          registrationId: r.registration_id,
          pool: poolFor(r),
          isWoman: player?.is_woman ?? false,
          isRadoWilling: player?.is_rado_willing ?? false,
          name: player ? formatName(player) : '',
        }
      })
      // generateTeams throws if the pools can't form valid teams (e.g. too many
      // A pool players); show the admin what to fix rather than failing silently.
      const teams = generateTeams(entrants)

      // Resolve each card request (a player pair) to the teams those players
      // landed on, in creation order, so generateCards can try to honor them. A
      // request whose player isn't registered/placed this event is dropped.
      const teamByReg = new Map<string, (typeof teams)[number]>()
      for (const t of teams) for (const rid of t.registrationIds) teamByReg.set(rid, t)
      const regByPlayer = new Map(eventRegistrations.map((r) => [r.player_id, r.registration_id]))
      const teamOfPlayer = (playerId: string) => {
        const rid = regByPlayer.get(playerId)
        return rid ? teamByReg.get(rid) : undefined
      }
      const requestPlans: CardRequestPlan[] = cardRequests
        .filter((c) => c.league_event_id === leagueEvent.league_event_id)
        .flatMap((c) => {
          const teamA = teamOfPlayer(c.player_id_a)
          const teamB = teamOfPlayer(c.player_id_b)
          return teamA && teamB ? [{ teamA, teamB, type: c.request_type }] : []
        })

      await saveTeamPlan(leagueEvent.league_event_id, generateCards(teams, requestPlans))
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not generate teams.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <section>
      <LeagueEventHeader leagueEventId={leagueEvent.league_event_id} />
      <div className="registered-panel">
        <p className="event-summary event-summary--pools">
          <span>
            <b>{eventRegistrations.length}</b>{' '}
            {eventRegistrations.length === 1 ? 'player' : 'players'}
          </span>
          <span className="pool-counts">
            <span className="badge badge--a">{poolACount} A</span>
            <span className="badge badge--b">{poolBCount} B</span>
          </span>
        </p>
        <AddPlayerCombo
          players={availablePlayers}
          disabled={!isAdmin}
          onRegister={(playerId) => registerPlayer(leagueEvent.league_event_id, playerId)}
          onAddNew={startNewPlayer}
        />
        {eventRegistrations.length === 0 ? (
          <p className="muted registered-empty">No one registered yet.</p>
        ) : (
          <ul className="player-list">
            {eventRegistrations.map((r) => {
              const p = playerById(r.player_id)
              const pool = poolFor(r)
              return (
                <li key={r.registration_id} className="player-row">
                  <span className="player-name">
                    {playerName(r.player_id)}
                    <PlayerBadges
                      pool={pool}
                      isWoman={p?.is_woman ?? false}
                      onPoolClick={isAdmin ? () => setPoolOverrideReg(r) : undefined}
                      poolTitle={isAdmin ? 'Override pool for this event' : undefined}
                    />
                  </span>
                  <span className="player-actions">
                    {pool === 'B' && p && (
                      <button
                        type="button"
                        className={`rado-toggle ${p.is_rado_willing ? 'willing' : ''}`}
                        aria-pressed={p.is_rado_willing}
                        aria-label={
                          p.is_rado_willing
                            ? `${playerName(r.player_id)} is willing to play rado`
                            : `${playerName(r.player_id)} is not willing to play rado`
                        }
                        title={
                          isAdmin
                            ? p.is_rado_willing
                              ? 'Willing to play rado'
                              : 'Not willing to play rado'
                            : 'Admins only'
                        }
                        disabled={!isAdmin}
                        onClick={() =>
                          editPlayer(p.player_id, {
                            first_name: p.first_name,
                            last_name: p.last_name,
                            display_name: p.display_name ?? '',
                            is_woman: p.is_woman,
                            default_pool: p.default_pool,
                            is_rado_willing: !p.is_rado_willing,
                          })
                        }
                      >
                        r
                      </button>
                    )}
                    <button
                      type="button"
                      className={`paid-toggle ${r.is_paid ? 'paid' : ''}`}
                      aria-pressed={r.is_paid}
                      aria-label={
                        r.is_paid
                          ? `Mark ${playerName(r.player_id)} unpaid`
                          : `Mark ${playerName(r.player_id)} paid`
                      }
                      title={isAdmin ? (r.is_paid ? 'Paid' : 'Not paid') : 'Admins only'}
                      disabled={!isAdmin}
                      onClick={() => setPaid(r.registration_id, !r.is_paid)}
                    >
                      $
                    </button>
                    <button
                      type="button"
                      className="subtle"
                      aria-label={`Remove ${playerName(r.player_id)}`}
                      title={isAdmin ? 'Remove player' : 'Admins only'}
                      disabled={!isAdmin}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Remove ${playerName(r.player_id)} from this event?`,
                          )
                        ) {
                          unregister(r.registration_id)
                        }
                      }}
                    >
                      ✕
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {newPlayerSeed && (
        <NewPlayerModal
          seed={newPlayerSeed}
          onClose={() => setNewPlayerSeed(null)}
          onCreate={(player) =>
            // Enqueues PlayerCreated + RegistrationCreated; the engine folds both
            // into the roster and registration lists at once (no refresh needed).
            void createAndRegisterPlayer(leagueEvent.league_event_id, player)
          }
        />
      )}

      {poolOverrideReg && (
        <PoolOverrideModal
          playerName={playerName(poolOverrideReg.player_id)}
          current={poolFor(poolOverrideReg)}
          defaultPool={(playerById(poolOverrideReg.player_id)?.default_pool ?? 'B') as Pool}
          onClose={() => setPoolOverrideReg(null)}
          onSave={(pool, defaultPool) =>
            // Setting the override back to the player's default clears it, so a
            // stored override always means a genuine per-event change.
            setPoolOverride(
              poolOverrideReg.registration_id,
              pool === defaultPool ? null : pool,
            )
          }
        />
      )}

      <div className="registered-panel">
        <button
          type="button"
          className="add-ctp-btn"
          disabled={!isAdmin}
          title={isAdmin ? undefined : 'Admins only'}
          onClick={() => setCtpModalOpen(true)}
        >
          Add a CTP
        </button>
        {eventCtps.length === 0 ? (
          <p className="muted registered-empty">No CTPs added yet.</p>
        ) : (
          <ul className="player-list">
            {eventCtps.map((c) => (
              <ClosestToPinRow
                key={c.closest_to_pin_id}
                ctp={c}
                isAdmin={isAdmin}
                onEdit={() => setEditingCtp(c)}
                onRemove={() => {
                  if (window.confirm(`Remove the CTP on hole ${c.hole_number}?`)) {
                    removeClosestToPin(c.closest_to_pin_id)
                  }
                }}
              />
            ))}
          </ul>
        )}
      </div>
      {ctpModalOpen && (
        <CtpModal
          onClose={() => setCtpModalOpen(false)}
          onSubmit={(holeNumber, prize) =>
            addClosestToPin(leagueEvent.league_event_id, holeNumber, prize)
          }
        />
      )}
      {editingCtp && (
        <CtpModal
          initial={editingCtp}
          onClose={() => setEditingCtp(null)}
          onSubmit={(holeNumber, prize) =>
            editClosestToPin(editingCtp.closest_to_pin_id, holeNumber, prize)
          }
        />
      )}

      {/* Card requests are admin-only: the whole section is hidden from
          non-admins (and the backend refuses them the data). */}
      {isAdmin && (
        <>
          <div className="registered-panel">
            <button
              type="button"
              className="add-ctp-btn"
              onClick={() => setCardRequestModalOpen(true)}
            >
              Add a Card Request
            </button>
            {eventCardRequests.length === 0 ? (
              <p className="muted registered-empty">No card requests added yet.</p>
            ) : (
              <ul className="player-list">
                {eventCardRequests.map((c) => (
                  <CardRequestRow
                    key={c.card_request_id}
                    request={c}
                    nameFor={playerName}
                    isAdmin={isAdmin}
                    onEdit={() => setEditingCardRequest(c)}
                    onRemove={() => {
                      if (
                        window.confirm(
                          `Remove this card request between ${playerName(
                            c.player_id_a,
                          )} and ${playerName(c.player_id_b)}?`,
                        )
                      ) {
                        removeCardRequest(c.card_request_id)
                      }
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
          {cardRequestModalOpen && (
            <CardRequestModal
              players={playersByName}
              onClose={() => setCardRequestModalOpen(false)}
              onSubmit={(playerIdA, playerIdB, requestType) =>
                addCardRequest(leagueEvent.league_event_id, playerIdA, playerIdB, requestType)
              }
            />
          )}
          {editingCardRequest && (
            <CardRequestModal
              initial={editingCardRequest}
              players={playersByName}
              onClose={() => setEditingCardRequest(null)}
              onSubmit={(playerIdA, playerIdB, requestType) =>
                editCardRequest(
                  editingCardRequest.card_request_id,
                  playerIdA,
                  playerIdB,
                  requestType,
                )
              }
            />
          )}
        </>
      )}

      <button
        type="button"
        className="generate-teams"
        onClick={onGenerateTeams}
        disabled={!isAdmin || generating}
        title={isAdmin ? undefined : 'Admins only'}
      >
        {generating ? 'Generating…' : 'Generate Teams'}
      </button>
    </section>
  )
}

/**
 * Modal for temporarily overriding a player's pool for a single event. Seeded
 * from the player's current effective pool (override, else default). Saving the
 * player's default pool clears the override (handled by the caller).
 */
function PoolOverrideModal({
  playerName,
  current,
  defaultPool,
  onClose,
  onSave,
}: {
  playerName: string
  current: Pool
  defaultPool: Pool
  onClose: () => void
  onSave: (pool: Pool, defaultPool: Pool) => void
}) {
  const [pool, setPool] = useState<Pool>(current)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSave(pool, defaultPool)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Pool override"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title">{playerName}</h3>
        <form className="modal-form" onSubmit={submit}>
          <label className="field">
            <span>Temporary pool override</span>
            <div className="pool-radio" role="radiogroup" aria-label="Pool">
              {(['A', 'B'] as Pool[]).map((option) => (
                <label
                  key={option}
                  className={`pool-option pool-option--${option === 'A' ? 'a' : 'b'} ${
                    pool === option ? 'pool-option--selected' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="pool-override"
                    value={option}
                    checked={pool === option}
                    onChange={() => setPool(option)}
                  />
                  {option}
                </label>
              ))}
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

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1)

/**
 * Modal for adding or editing a closest-to-pin (hole + prize). Seeded from
 * `initial` when editing. Closes on submit, Cancel, Escape, or a backdrop tap.
 */
function CtpModal({
  initial,
  onClose,
  onSubmit,
}: {
  initial?: ClosestToPin
  onClose: () => void
  onSubmit: (holeNumber: number, prize: string) => void
}) {
  const editing = initial != null
  const [hole, setHole] = useState(initial?.hole_number ?? 1)
  const [prize, setPrize] = useState(initial?.prize ?? '')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = prize.trim()
    if (!trimmed) return
    onSubmit(hole, trimmed)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Edit CTP' : 'Add CTP'}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title">{editing ? 'Edit CTP' : 'Add CTP'}</h3>
        <form className="modal-form" onSubmit={submit}>
          <label className="field">
            <span>Hole</span>
            <select value={hole} onChange={(e) => setHole(Number(e.target.value))}>
              {HOLES.map((h) => (
                <option key={h} value={h}>
                  Hole {h}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Prize</span>
            <input
              autoFocus
              value={prize}
              onChange={(e) => setPrize(e.target.value)}
              placeholder="Prize"
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit">{editing ? 'Save' : 'Add CTP'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * Type-ahead single-player picker. Shows the chosen player's name; typing filters
 * the whole roster (minus `exclude`, the player picked in the sibling field). The
 * input reverts to the current selection if closed without picking, so it never
 * shows an unmatched string.
 */
function PlayerPicker({
  players,
  value,
  exclude,
  onChange,
}: {
  players: Player[]
  value: string
  exclude?: string
  onChange: (playerId: string) => void
}) {
  const nameOf = (p: Player) => formatName(p)
  const selected = players.find((p) => p.player_id === value)
  const [query, setQuery] = useState(selected ? nameOf(selected) : '')
  const [open, setOpen] = useState(false)
  const [typing, setTyping] = useState(false)
  const comboRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep the shown text in sync with the selection when not mid-type (e.g. the
  // other field excludes the current pick, or an edit seeds the value).
  useEffect(() => {
    if (!typing) setQuery(selected ? nameOf(selected) : '')
  }, [selected, typing])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setOpen(false)
        setTyping(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // While typing, filter by the query; otherwise show the whole roster to browse.
  const q = query.trim().toLowerCase()
  const matches = players
    .filter((p) => p.player_id !== exclude)
    .filter((p) => !typing || nameOf(p).toLowerCase().includes(q))
    .slice(0, 6)

  const pick = (p: Player) => {
    onChange(p.player_id)
    setQuery(nameOf(p))
    setTyping(false)
    setOpen(false)
    inputRef.current?.blur()
  }

  return (
    <div className="combo" ref={comboRef}>
      <input
        ref={inputRef}
        value={query}
        placeholder="Search players…"
        autoComplete="off"
        aria-label="Player"
        onChange={(e) => {
          setQuery(e.target.value)
          setTyping(true)
          setOpen(true)
          onChange('')
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div className="drop">
          {matches.length === 0 ? (
            <div className="opt opt--empty">No players found</div>
          ) : (
            matches.map((p) => (
              <div key={p.player_id} className="opt" onClick={() => pick(p)}>
                {nameOf(p)}
                <PlayerBadges pool={p.default_pool} isWoman={p.is_woman} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Modal for adding or editing a card request: two players and whether they want
 * to play together (prefer) or apart (avoid). Seeded from `initial` when editing.
 * The player pickers list the whole roster so a request can be entered before the
 * players register. Closes on submit, Cancel, Escape, or a backdrop tap.
 */
function CardRequestModal({
  initial,
  players,
  onClose,
  onSubmit,
}: {
  initial?: CardRequest
  players: Player[]
  onClose: () => void
  onSubmit: (playerIdA: string, playerIdB: string, requestType: RequestType) => void
}) {
  const editing = initial != null
  const [playerIdA, setPlayerIdA] = useState(initial?.player_id_a ?? '')
  const [playerIdB, setPlayerIdB] = useState(initial?.player_id_b ?? '')
  // No default selection: the admin must pick prefer or avoid.
  const [requestType, setRequestType] = useState<RequestType | ''>(
    initial?.request_type ?? '',
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const valid = playerIdA && playerIdB && playerIdA !== playerIdB && requestType
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    onSubmit(playerIdA, playerIdB, requestType as RequestType)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Edit card request' : 'Add card request'}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title">{editing ? 'Edit card request' : 'Add card request'}</h3>
        <form className="modal-form" onSubmit={submit}>
          <div className="field">
            <span>Player</span>
            <PlayerPicker
              players={players}
              value={playerIdA}
              exclude={playerIdB}
              onChange={setPlayerIdA}
            />
          </div>
          <div className="field">
            <span>Player</span>
            <PlayerPicker
              players={players}
              value={playerIdB}
              exclude={playerIdA}
              onChange={setPlayerIdB}
            />
          </div>
          <div className="field">
            <span>Request</span>
            <div className="pool-radio" role="radiogroup" aria-label="Request type">
              {(['prefer', 'avoid'] as RequestType[]).map((option) => (
                <label
                  key={option}
                  className={`pool-option pool-option--request-${option} ${
                    requestType === option ? 'pool-option--selected' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="request-type"
                    value={option}
                    checked={requestType === option}
                    onChange={() => setRequestType(option)}
                  />
                  {option === 'prefer' ? 'Prefer' : 'Avoid'}
                </label>
              ))}
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={!valid}>
              {editing ? 'Save' : 'Add Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * Card-request row: the two players with a chip saying whether they want the same
 * card (prefer) or to be kept apart (avoid). Admins also get edit + remove buttons.
 */
function CardRequestRow({
  request,
  nameFor,
  isAdmin,
  onEdit,
  onRemove,
}: {
  request: CardRequest
  nameFor: (playerId: string) => string
  isAdmin: boolean
  onEdit: () => void
  onRemove: () => void
}) {
  const prefer = request.request_type === 'prefer'
  return (
    <li className="player-row">
      <span className="ctp-name">
        <span className={`card-request-type card-request-type--${request.request_type}`}>
          {prefer ? 'Prefer' : 'Avoid'}
        </span>
        <span className="card-request-players">
          <span>{nameFor(request.player_id_a)}</span>
          <span>{nameFor(request.player_id_b)}</span>
        </span>
      </span>
      <span className="player-actions">
        <button
          type="button"
          className="icon-btn"
          aria-label="Edit card request"
          title={isAdmin ? 'Edit card request' : 'Admins only'}
          disabled={!isAdmin}
          onClick={onEdit}
        >
          <PencilIcon />
        </button>
        <button
          type="button"
          className="subtle"
          aria-label="Remove card request"
          title={isAdmin ? 'Remove card request' : 'Admins only'}
          disabled={!isAdmin}
          onClick={onRemove}
        >
          ✕
        </button>
      </span>
    </li>
  )
}

/**
 * Closest-to-pin row: shows the hole as a chip and the prize. Admins also get a
 * pencil button that opens the edit modal and a remove button.
 */
function ClosestToPinRow({
  ctp,
  isAdmin,
  onEdit,
  onRemove,
}: {
  ctp: ClosestToPin
  isAdmin: boolean
  onEdit: () => void
  onRemove: () => void
}) {
  return (
    <li className="player-row">
      <span className="ctp-name">
        <span className="ctp-hole">Hole {ctp.hole_number}</span>
        <span className="ctp-prize">{ctp.prize}</span>
      </span>
      <span className="player-actions">
        <button
          type="button"
          className="icon-btn"
          aria-label={`Edit CTP on hole ${ctp.hole_number}`}
          title={isAdmin ? 'Edit CTP' : 'Admins only'}
          disabled={!isAdmin}
          onClick={onEdit}
        >
          <PencilIcon />
        </button>
        <button
          type="button"
          className="subtle"
          aria-label="Remove CTP"
          title={isAdmin ? 'Remove CTP' : 'Admins only'}
          disabled={!isAdmin}
          onClick={onRemove}
        >
          ✕
        </button>
      </span>
    </li>
  )
}

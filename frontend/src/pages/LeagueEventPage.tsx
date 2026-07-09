import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLeagueEvents } from '../leagueEvents/store'
import { usePlayers } from '../players/store'
import { useRegistrations } from '../registrations/store'
import { useClosestToPins } from '../closestToPins/store'
import { formatDate } from '../leagueEvents/format'
import type { Player, Pool } from '../players/types'
import type { Registration } from '../registrations/types'
import type { ClosestToPin } from '../closestToPins/types'

/**
 * A single league event. Reads it out of the app-wide league-events store
 * (so a deep link / refresh works once the list loads). The admin registers
 * players (type-ahead add or create-a-new-player), tracks payment, manages
 * closest-to-pins, and generates teams.
 */
export default function LeagueEventPage() {
  const { leagueEventId } = useParams()
  const navigate = useNavigate()
  const { leagueEvents, loaded, deleteLeagueEvent } = useLeagueEvents()
  const { players, sync: syncPlayers } = usePlayers()
  const { registrations, registerPlayer, setPaid, unregister, createAndRegisterPlayer } =
    useRegistrations()
  const { closestToPins, addClosestToPin, editClosestToPin, removeClosestToPin } =
    useClosestToPins()
  const leagueEvent = leagueEvents.find((le) => le.league_event_id === leagueEventId)

  // When set, the register-new-player modal is open, seeded from the combobox text.
  const [newPlayerSeed, setNewPlayerSeed] = useState<{ first: string; last: string } | null>(
    null,
  )
  const [ctpModalOpen, setCtpModalOpen] = useState(false)

  if (!leagueEvent) {
    return (
      <section>
        <Link to="/" className="back-link">← League Events</Link>
        <p className="muted">{loaded ? 'League event not found.' : 'Loading…'}</p>
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

  // Open the register-new-player modal, seeding the name from the combobox text.
  const startNewPlayer = (typed: string) => {
    const [first, ...rest] = typed.trim().split(/\s+/)
    setNewPlayerSeed({ first: first ?? '', last: rest.join(' ') })
  }

  const onDelete = () => {
    if (window.confirm('Delete this league event? This cannot be undone.')) {
      deleteLeagueEvent(leagueEvent.league_event_id)
      navigate('/')
    }
  }

  return (
    <section>
      <div className="event-header">
        <h2>{formatDate(leagueEvent.date)}</h2>
        <button
          type="button"
          className="icon-btn delete-event-btn"
          aria-label="Delete league event"
          title="Delete league event"
          onClick={onDelete}
        >
          <TrashIcon />
        </button>
      </div>

      <p className="event-summary">
        <b>{eventRegistrations.length}</b> players
        <span className="badge badge--a">{poolACount} A</span>
        <span className="badge badge--b">{poolBCount} B</span>
      </p>

      <AddPlayerCombo
        players={availablePlayers}
        onRegister={(playerId) => registerPlayer(leagueEvent.league_event_id, playerId)}
        onAddNew={startNewPlayer}
      />

      <div className="registered-panel">
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
                    <PlayerBadges pool={pool} isWoman={p?.is_woman ?? false} />
                  </span>
                  <span className="player-actions">
                    <button
                      type="button"
                      className={r.is_paid ? '' : 'secondary'}
                      aria-pressed={r.is_paid}
                      onClick={() => setPaid(r.registration_id, !r.is_paid)}
                    >
                      {r.is_paid ? 'Paid ✓' : 'Mark paid'}
                    </button>
                    <button
                      type="button"
                      className="subtle"
                      aria-label={`Remove ${playerName(r.player_id)}`}
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
            // Refresh the roster once the batch lands so the new name resolves.
            void createAndRegisterPlayer(leagueEvent.league_event_id, player).then(syncPlayers)
          }
        />
      )}

      <div className="section-head ctp-head">
        <h3>CTPs</h3>
        <button
          type="button"
          className="add-btn"
          aria-label="Add closest-to-pin"
          title="Add CTP"
          onClick={() => setCtpModalOpen(true)}
        >
          +
        </button>
      </div>
      {eventCtps.length === 0 ? (
        <p className="muted">No closest-to-pins added yet.</p>
      ) : (
        <ul className="player-list">
          {eventCtps.map((c) => (
            <ClosestToPinRow
              key={c.closest_to_pin_id}
              ctp={c}
              onEdit={(holeNumber, prize) =>
                editClosestToPin(c.closest_to_pin_id, holeNumber, prize)
              }
              onRemove={() => {
                if (window.confirm(`Remove the closest-to-pin on hole ${c.hole_number}?`)) {
                  removeClosestToPin(c.closest_to_pin_id)
                }
              }}
            />
          ))}
        </ul>
      )}
      {ctpModalOpen && (
        <NewCtpModal
          onClose={() => setCtpModalOpen(false)}
          onAdd={(holeNumber, prize) =>
            addClosestToPin(leagueEvent.league_event_id, holeNumber, prize)
          }
        />
      )}

      <button
        type="button"
        className="generate-teams"
        onClick={() => window.alert('Generating teams is not yet implemented.')}
      >
        Generate Teams
      </button>
    </section>
  )
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6M10 11v6M14 11v6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PlayerBadges({ pool, isWoman }: { pool: Pool; isWoman: boolean }) {
  return (
    <>
      <span className={`badge ${pool === 'A' ? 'badge--a' : 'badge--b'}`}>{pool}</span>
      {isWoman && <span className="badge badge--w">♀</span>}
    </>
  )
}

/**
 * Type-ahead combobox: filters the unregistered roster as you type, registers
 * the picked player and reopens for the next name. The last row always offers
 * "add a new player", pre-filling the create form from what was typed.
 */
function AddPlayerCombo({
  players,
  onRegister,
  onAddNew,
}: {
  players: Player[]
  onRegister: (playerId: string) => void
  onAddNew: (typed: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const comboRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const raw = query.trim()
  const q = raw.toLowerCase()
  const matches = players
    .filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q))
    .slice(0, 6)

  const pick = (playerId: string) => {
    onRegister(playerId)
    setQuery('')
    // Drop focus so the box closes rather than reopening for the next name.
    inputRef.current?.blur()
    setOpen(false)
  }

  const addNew = () => {
    onAddNew(raw)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="combo" ref={comboRef}>
      <input
        ref={inputRef}
        value={query}
        placeholder="Add a player…"
        autoComplete="off"
        aria-label="Add a player"
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div className="drop">
          {matches.map((p) => (
            <div key={p.player_id} className="opt" onClick={() => pick(p.player_id)}>
              {p.first_name} {p.last_name}
              <PlayerBadges pool={p.default_pool} isWoman={p.is_woman} />
            </div>
          ))}
          <div
            className={`opt opt--add-new ${matches.length ? '' : 'only'}`}
            onClick={addNew}
          >
            {raw ? (
              <>
                + Add new player <span className="q">“{raw}”</span>
              </>
            ) : (
              '+ Add a new player'
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Modal for creating a brand-new player and registering them in one step.
 * Seeded from whatever was typed into the type-ahead. Closes on submit,
 * Cancel, Escape, or a backdrop tap.
 */
function NewPlayerModal({
  seed,
  onClose,
  onCreate,
}: {
  seed: { first: string; last: string }
  onClose: () => void
  onCreate: (player: PlayerFieldsInput) => void
}) {
  const [firstName, setFirstName] = useState(seed.first)
  const [lastName, setLastName] = useState(seed.last)
  const [pool, setPool] = useState<Pool>('B')
  const [isWoman, setIsWoman] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const first_name = firstName.trim()
    const last_name = lastName.trim()
    if (!first_name || !last_name) return
    onCreate({ first_name, last_name, default_pool: pool, is_woman: isWoman })
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Register new player"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title">Register new player</h3>
        <form className="modal-form" onSubmit={submit}>
          <label className="field">
            <span>First name</span>
            <input
              autoFocus
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
            />
          </label>
          <label className="field">
            <span>Last name</span>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
            />
          </label>
          <div className="field-row">
            <div className="field">
              <span>Pool</span>
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
                      name="pool"
                      value={option}
                      checked={pool === option}
                      onChange={() => setPool(option)}
                    />
                    {option}
                  </label>
                ))}
              </div>
            </div>
            <label className="checkbox-field" title="Woman">
              <input
                type="checkbox"
                checked={isWoman}
                onChange={(e) => setIsWoman(e.target.checked)}
                aria-label="Woman"
              />
              <span className="badge badge--w">♀</span>
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit">Create &amp; register</button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface PlayerFieldsInput {
  first_name: string
  last_name: string
  default_pool: string
  is_woman: boolean
}

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1)

/**
 * Modal for adding a closest-to-pin (hole + prize). Closes on submit, Cancel,
 * Escape, or a backdrop tap.
 */
function NewCtpModal({
  onClose,
  onAdd,
}: {
  onClose: () => void
  onAdd: (holeNumber: number, prize: string) => void
}) {
  const [hole, setHole] = useState(1)
  const [prize, setPrize] = useState('')

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
    onAdd(hole, trimmed)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Add closest-to-pin"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title">Add closest-to-pin</h3>
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
            <button type="submit">Add CTP</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * Inline-editable closest-to-pin row: the hole select and prize input save
 * automatically as they lose focus (a select saves on change, the prize on
 * blur). An empty prize reverts rather than saving.
 */
function ClosestToPinRow({
  ctp,
  onEdit,
  onRemove,
}: {
  ctp: ClosestToPin
  onEdit: (holeNumber: number, prize: string) => void
  onRemove: () => void
}) {
  const [hole, setHole] = useState(ctp.hole_number)
  const [prize, setPrize] = useState(ctp.prize)

  // Re-seed if the projection changes underneath us (e.g. after a refresh).
  useEffect(() => {
    setHole(ctp.hole_number)
    setPrize(ctp.prize)
  }, [ctp.hole_number, ctp.prize])

  const saveHole = (h: number) => {
    setHole(h)
    if (h !== ctp.hole_number) onEdit(h, prize.trim() || ctp.prize)
  }
  const savePrize = () => {
    const trimmed = prize.trim()
    if (!trimmed) {
      setPrize(ctp.prize) // revert an emptied field
      return
    }
    if (trimmed !== ctp.prize) onEdit(hole, trimmed)
  }

  return (
    <li className="player-row ctp-row">
      <span className="ctp-fields">
        <select
          value={hole}
          onChange={(e) => saveHole(Number(e.target.value))}
          aria-label="Hole"
        >
          {HOLES.map((h) => (
            <option key={h} value={h}>
              Hole {h}
            </option>
          ))}
        </select>
        <input
          value={prize}
          onChange={(e) => setPrize(e.target.value)}
          onBlur={savePrize}
          placeholder="Prize"
          aria-label="Prize"
        />
      </span>
      <button
        type="button"
        className="subtle"
        aria-label="Remove closest-to-pin"
        onClick={onRemove}
      >
        ✕
      </button>
    </li>
  )
}

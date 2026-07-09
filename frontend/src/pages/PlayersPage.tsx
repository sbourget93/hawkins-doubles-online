import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/useAuth'
import { usePlayers, type SyncStatus } from '../players/store'
import type { Player, PlayerFields, Pool } from '../players/types'

/**
 * Players page. Everyone sees the roster; admins can add, edit, and soft-delete.
 * All mutations go through the offline-first store, so they apply instantly and
 * sync when a connection is available. Admin gating is driven by useAuth() (a
 * placeholder today — see auth/useAuth.tsx).
 */
export default function PlayersPage() {
  const { isAdmin } = useAuth()
  const { players, pendingCount, syncStatus, addPlayer, editPlayer, deletePlayer } = usePlayers()

  return (
    <section>
      <div className="players-header">
        <h2>Players</h2>
        <span className={`sync-status sync-status--${syncStatus}`}>
          {statusLabel(syncStatus, pendingCount)}
        </span>
      </div>

      {isAdmin && <AddPlayerForm onAdd={addPlayer} />}

      {players.length === 0 ? (
        <p className="muted">No players yet.</p>
      ) : (
        <ul className="player-list">
          {players.map((player) => (
            <PlayerRow
              key={player.player_id}
              player={player}
              isAdmin={isAdmin}
              onEdit={editPlayer}
              onDelete={deletePlayer}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function statusLabel(status: SyncStatus, pending: number): string {
  const changes = `${pending} change${pending === 1 ? '' : 's'} pending`
  switch (status) {
    case 'syncing':
      return 'Syncing…'
    case 'offline':
      return `Offline — ${changes}`
    case 'conflict':
      return 'Reconciled with server (unsynced local changes were discarded)'
    default:
      return pending > 0 ? changes : 'Synced'
  }
}

function AddPlayerForm({ onAdd }: { onAdd: (fields: PlayerFields) => void }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [pool, setPool] = useState<Pool>('B')
  const [isWoman, setIsWoman] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const first_name = firstName.trim()
    const last_name = lastName.trim()
    if (!first_name || !last_name) return
    onAdd({ first_name, last_name, default_pool: pool, is_woman: isWoman })
    setFirstName('')
    setLastName('')
    setPool('B')
    setIsWoman(false)
  }

  return (
    <form className="player-form" onSubmit={submit}>
      <input
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
        placeholder="First name"
        aria-label="First name"
      />
      <input
        value={lastName}
        onChange={(e) => setLastName(e.target.value)}
        placeholder="Last name"
        aria-label="Last name"
      />
      <select value={pool} onChange={(e) => setPool(e.target.value as Pool)} aria-label="Pool">
        <option value="A">Pool A</option>
        <option value="B">Pool B</option>
      </select>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={isWoman}
          onChange={(e) => setIsWoman(e.target.checked)}
        />
        Woman
      </label>
      <button type="submit">Add</button>
    </form>
  )
}

interface PlayerRowProps {
  player: Player
  isAdmin: boolean
  onEdit: (playerId: string, fields: PlayerFields) => void
  onDelete: (playerId: string) => void
}

function PlayerRow({ player, isAdmin, onEdit, onDelete }: PlayerRowProps) {
  const [editing, setEditing] = useState(false)
  const [firstName, setFirstName] = useState(player.first_name)
  const [lastName, setLastName] = useState(player.last_name)
  const [pool, setPool] = useState<Pool>(player.default_pool)
  const [isWoman, setIsWoman] = useState(player.is_woman)

  const save = (e: FormEvent) => {
    e.preventDefault()
    const first_name = firstName.trim()
    const last_name = lastName.trim()
    if (!first_name || !last_name) return
    onEdit(player.player_id, { first_name, last_name, default_pool: pool, is_woman: isWoman })
    setEditing(false)
  }

  const cancel = () => {
    setFirstName(player.first_name)
    setLastName(player.last_name)
    setPool(player.default_pool)
    setIsWoman(player.is_woman)
    setEditing(false)
  }

  if (editing) {
    return (
      <li className="player-row">
        <form className="player-form" onSubmit={save}>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            aria-label="First name"
          />
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            aria-label="Last name"
          />
          <select value={pool} onChange={(e) => setPool(e.target.value as Pool)} aria-label="Pool">
            <option value="A">Pool A</option>
            <option value="B">Pool B</option>
          </select>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={isWoman}
              onChange={(e) => setIsWoman(e.target.checked)}
            />
            Woman
          </label>
          <button type="submit">Save</button>
          <button type="button" className="secondary" onClick={cancel}>
            Cancel
          </button>
        </form>
      </li>
    )
  }

  return (
    <li className="player-row">
      <span className="player-name">
        {player.first_name} {player.last_name}
      </span>
      <span className="muted">
        Pool {player.default_pool}
        {player.is_woman ? ' · Woman' : ''}
      </span>
      {isAdmin && (
        <span className="player-actions">
          <button type="button" className="secondary" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button type="button" className="danger" onClick={() => onDelete(player.player_id)}>
            Delete
          </button>
        </span>
      )}
    </li>
  )
}

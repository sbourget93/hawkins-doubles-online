import { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { usePlayers } from '../players/store'
import PlayerBadges from '../players/PlayerBadges'
import PlayerModal from '../players/PlayerModal'
import PencilIcon from '../components/PencilIcon'
import type { Player } from '../players/types'

/**
 * Players page. Everyone sees the roster; admins can add, edit, and soft-delete.
 * Rows mirror the registration page's styling. A search box filters the roster by
 * a case-insensitive name match; the + button and each row's pencil open the
 * shared add/edit popup.
 */
export default function PlayersPage() {
  const { isAdmin } = useAuth()
  const { players, addPlayer, editPlayer, deletePlayer } = usePlayers()
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  // When set, the edit modal is open for this player.
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)

  const q = query.trim().toLowerCase()
  const visible = players
    .filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q))
    .sort((a, b) =>
      `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`),
    )

  return (
    <section>
      <div className="search-row">
        <input
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players…"
          aria-label="Search players"
        />
        {isAdmin && (
          <button
            type="button"
            className="add-btn"
            aria-label="Add player"
            title="Add player"
            onClick={() => setAdding(true)}
          >
            +
          </button>
        )}
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
  onEdit,
  onDelete,
}: {
  player: Player
  isAdmin: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const name = `${player.first_name} ${player.last_name}`
  return (
    <li className="player-row">
      <span className="player-name">
        {name}
        <PlayerBadges pool={player.default_pool} isWoman={player.is_woman} />
      </span>
      {isAdmin && (
        <span className="player-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label={`Edit ${name}`}
            title="Edit player"
            onClick={onEdit}
          >
            <PencilIcon />
          </button>
          <button type="button" className="subtle" aria-label={`Delete ${name}`} onClick={onDelete}>
            ✕
          </button>
        </span>
      )}
    </li>
  )
}

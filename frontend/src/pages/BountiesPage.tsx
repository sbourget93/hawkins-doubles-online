import { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { useBounties } from '../bounties/store'
import BountyModal from '../bounties/BountyModal'
import PencilIcon from '../components/PencilIcon'
import type { Bounty } from '../bounties/types'

/**
 * Bounties page. Everyone sees the list; admins can add, edit, and soft-delete.
 * Mirrors the players page styling, minus the search box (the list is short).
 * The + button and each row's pencil open the shared add/edit modal.
 */
export default function BountiesPage() {
  const { isAdmin } = useAuth()
  const { bounties, addBounty, editBounty, deleteBounty } = useBounties()
  const [adding, setAdding] = useState(false)
  // When set, the edit modal is open for this bounty.
  const [editingBounty, setEditingBounty] = useState<Bounty | null>(null)

  const visible = bounties.slice().sort((a, b) => a.name.localeCompare(b.name))

  return (
    <section>
      <button
        type="button"
        className="full-width add-bounty-btn"
        aria-label="Add bounty"
        title={isAdmin ? 'Add bounty' : 'Admins only'}
        disabled={!isAdmin}
        onClick={() => setAdding(true)}
      >
        Add Bounty
      </button>

      {visible.length === 0 ? (
        <p className="muted registered-empty">No bounties yet.</p>
      ) : (
        <div className="registered-panel">
          <ul className="player-list">
            {visible.map((bounty) => (
              <BountyRow
                key={bounty.bounty_id}
                bounty={bounty}
                isAdmin={isAdmin}
                onEdit={() => setEditingBounty(bounty)}
                onDelete={() => {
                  if (window.confirm(`Delete ${bounty.name}?`)) {
                    deleteBounty(bounty.bounty_id)
                  }
                }}
              />
            ))}
          </ul>
        </div>
      )}

      {adding && (
        <BountyModal onClose={() => setAdding(false)} onSubmit={(fields) => addBounty(fields)} />
      )}
      {editingBounty && (
        <BountyModal
          initial={editingBounty}
          onClose={() => setEditingBounty(null)}
          onSubmit={(fields) => editBounty(editingBounty.bounty_id, fields)}
        />
      )}
    </section>
  )
}

function BountyRow({
  bounty,
  isAdmin,
  onEdit,
  onDelete,
}: {
  bounty: Bounty
  isAdmin: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <li className="player-entry">
      <div className="player-row">
        <span className="bounty-name">{bounty.name}</span>
        <span className="bounty-prize">{bounty.prize}</span>
        <span className="player-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label={`Edit ${bounty.name}`}
            title={isAdmin ? 'Edit bounty' : 'Admins only'}
            disabled={!isAdmin}
            onClick={onEdit}
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            className="subtle"
            aria-label={`Delete ${bounty.name}`}
            title={isAdmin ? 'Delete bounty' : 'Admins only'}
            disabled={!isAdmin}
            onClick={onDelete}
          >
            ✕
          </button>
        </span>
      </div>
    </li>
  )
}

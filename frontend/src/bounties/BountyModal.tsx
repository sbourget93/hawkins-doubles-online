import { useEffect, useState, type FormEvent } from 'react'
import type { BountyFields } from './types'

/**
 * Modal for adding or editing a bounty (name + prize). Seeded from `initial`
 * when editing. Closes on submit, Cancel, Escape, or a backdrop tap — mirroring
 * the player and CTP modals.
 */
export default function BountyModal({
  initial,
  onClose,
  onSubmit,
}: {
  initial?: BountyFields
  onClose: () => void
  onSubmit: (fields: BountyFields) => void
}) {
  const editing = initial != null
  const [name, setName] = useState(initial?.name ?? '')
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
    const trimmedName = name.trim()
    const trimmedPrize = prize.trim()
    if (!trimmedName || !trimmedPrize) return
    onSubmit({ name: trimmedName, prize: trimmedPrize })
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Edit bounty' : 'Add bounty'}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title">{editing ? 'Edit bounty' : 'Add bounty'}</h3>
        <form className="modal-form" onSubmit={submit}>
          <label className="field">
            <span>Name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ace Pot"
            />
          </label>
          <label className="field">
            <span>Prize</span>
            <input
              value={prize}
              onChange={(e) => setPrize(e.target.value)}
              placeholder="e.g. $50"
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit">{editing ? 'Save' : 'Add'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

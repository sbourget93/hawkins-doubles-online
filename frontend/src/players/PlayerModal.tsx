import { useEffect, useState, type FormEvent } from 'react'
import type { PlayerFields, Pool } from './types'

/**
 * Modal for adding or editing a player (name, pool, woman). Seeded from `initial`
 * when editing. Closes on submit, Cancel, Escape, or a backdrop tap — mirroring
 * the CTP and league-event modals.
 */
export default function PlayerModal({
  initial,
  onClose,
  onSubmit,
}: {
  initial?: PlayerFields
  onClose: () => void
  onSubmit: (fields: PlayerFields) => void
}) {
  const editing = initial != null
  const [firstName, setFirstName] = useState(initial?.first_name ?? '')
  const [lastName, setLastName] = useState(initial?.last_name ?? '')
  const [pool, setPool] = useState<Pool>(initial?.default_pool ?? 'B')
  const [isWoman, setIsWoman] = useState(initial?.is_woman ?? false)

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
    onSubmit({ first_name, last_name, default_pool: pool, is_woman: isWoman })
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Edit player' : 'Add player'}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title">{editing ? 'Edit player' : 'Add player'}</h3>
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
            <button type="submit">{editing ? 'Save' : 'Add'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

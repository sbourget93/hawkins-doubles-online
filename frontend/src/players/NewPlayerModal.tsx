import { useEffect, useState, type FormEvent } from 'react'
import type { Pool } from './types'

export interface PlayerFieldsInput {
  first_name: string
  last_name: string
  default_pool: string
  is_woman: boolean
}

/**
 * Modal for creating a brand-new player and registering them in one step.
 * Seeded from whatever was typed into the type-ahead. Closes on submit,
 * Cancel, Escape, or a backdrop tap. Shared by registration and the cards
 * page's late "straggler" check-in.
 */
export default function NewPlayerModal({
  seed,
  title = 'Register new player',
  submitLabel = 'Create & register',
  onClose,
  onCreate,
}: {
  seed: { first: string; last: string }
  title?: string
  submitLabel?: string
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
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title">{title}</h3>
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
            <button type="submit">{submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

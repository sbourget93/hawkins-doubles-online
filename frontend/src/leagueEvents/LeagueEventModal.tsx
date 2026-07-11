import { useEffect, useState, type FormEvent } from 'react'
import { defaultTitle, todayIso } from './format'

/**
 * Modal for creating or editing a league event (date + title). Seeded from
 * `initial` when editing; a create starts on today's date with the default
 * title. Closes on submit, Cancel, Escape, or a backdrop tap — mirroring the
 * CTP modal.
 */
export default function LeagueEventModal({
  initial,
  onClose,
  onSubmit,
}: {
  initial?: { date: string; title: string }
  onClose: () => void
  onSubmit: (date: string, title: string) => void
}) {
  const editing = initial != null
  const [date, setDate] = useState(initial?.date ?? todayIso())
  const [title, setTitle] = useState(initial?.title ?? defaultTitle())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!date || !trimmed) return
    onSubmit(date, trimmed)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Edit league event' : 'New league event'}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title">{editing ? 'Edit league event' : 'New league event'}</h3>
        <form className="modal-form" onSubmit={submit}>
          <label className="field">
            <span>Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit">{editing ? 'Save' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

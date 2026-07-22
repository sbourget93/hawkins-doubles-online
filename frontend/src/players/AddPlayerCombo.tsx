import { useEffect, useRef, useState } from 'react'
import PlayerBadges from './PlayerBadges'
import { playerName } from './format'
import type { Player } from './types'

/**
 * Type-ahead combobox: filters the given roster as you type, picks the chosen
 * player (`onRegister`) and reopens for the next name. The last row always offers
 * "add a new player", pre-filling the create form from what was typed.
 *
 * Shared by the league-event registration panel and the cards page's late
 * "straggler" check-in, so both use the identical search bar.
 */
export default function AddPlayerCombo({
  players,
  disabled,
  placeholder = 'Add a player…',
  onRegister,
  onAddNew,
}: {
  players: Player[]
  disabled?: boolean
  placeholder?: string
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
    .filter((p) => `${playerName(p)} ${p.first_name} ${p.last_name}`.toLowerCase().includes(q))
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
        placeholder={placeholder}
        autoComplete="off"
        aria-label={placeholder}
        disabled={disabled}
        title={disabled ? 'Admins only' : undefined}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      {open && !disabled && (
        <div className="drop">
          {matches.map((p) => (
            <div key={p.player_id} className="opt" onClick={() => pick(p.player_id)}>
              {playerName(p)}
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

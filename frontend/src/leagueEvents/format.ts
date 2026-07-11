import type { LeagueEvent, LeagueEventState } from './types'

/** Today's date as YYYY-MM-DD in the local timezone (input[type=date] format). */
export function todayIso(): string {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

/** The default title for a new league event (matches the model doc). */
export function defaultTitle(): string {
  return 'Hawkins Dubs'
}

/** Display label for a league event: "title — date" (em dash). */
export function eventLabel(le: LeagueEvent): string {
  return `${le.title} — ${formatDate(le.date)}`
}

/** Render a stored YYYY-MM-DD as a readable local date (no timezone shift). */
export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function statusLabel(state: LeagueEventState): string {
  switch (state) {
    case 'registration':
      return 'Registration'
    case 'forming_teams':
      return 'Forming teams'
    case 'ready':
      return 'Ready'
    case 'in_progress':
      return 'In progress'
    case 'completed':
      return 'Completed'
  }
}

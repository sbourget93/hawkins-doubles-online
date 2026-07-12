import { newEvent, type SyncStatus } from '../api/commands'
import { useAggregateRows, useSync } from '../offline/SyncEngine'
import { newId } from '../lib/uuid'
import type { LeagueEvent, LeagueEventState } from './types'

/**
 * League-event store — a thin local-first view over the sync engine. Holds the
 * list of league nights; both the list page and a single night's detail page
 * read from it. Each mutation enqueues a command (reflected locally at once,
 * synced in the background). Public shape unchanged from the old online store.
 */

interface LeagueEventsValue {
  leagueEvents: LeagueEvent[]
  loaded: boolean
  syncStatus: SyncStatus
  refresh: () => Promise<void>
  createLeagueEvent: (date: string, title: string) => void
  editLeagueEvent: (leagueEventId: string, date: string, title: string) => void
  setLeagueEventState: (leagueEventId: string, state: LeagueEventState) => void
  deleteLeagueEvent: (leagueEventId: string) => void
}

export function useLeagueEvents(): LeagueEventsValue {
  const { enqueue, loaded, syncStatus, refresh } = useSync()
  const leagueEvents = useAggregateRows<LeagueEvent>('leagueEvents')

  return {
    leagueEvents,
    loaded,
    syncStatus,
    refresh,
    createLeagueEvent: (date, title) =>
      enqueue([newEvent('LeagueEventCreated', newId(), { date, title })]),
    editLeagueEvent: (leagueEventId, date, title) =>
      enqueue([newEvent('LeagueEventEdited', leagueEventId, { date, title })]),
    setLeagueEventState: (leagueEventId, state) =>
      enqueue([newEvent('LeagueEventStateChanged', leagueEventId, { state })]),
    deleteLeagueEvent: (leagueEventId) =>
      enqueue([newEvent('LeagueEventDeleted', leagueEventId)]),
  }
}

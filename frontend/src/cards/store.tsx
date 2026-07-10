import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  ConflictError,
  newEvent,
  postCommands,
  type CommandEvent,
  type SyncStatus,
} from '../api/commands'
import { fetchCards, fetchTeams } from '../api/cards'
import { newId } from '../lib/uuid'
import { handicapFor, type CardPlan } from './generate'
import type { Card, Team } from './types'

/** One player on a team, with just what handicap math needs. */
export interface MoveMember {
  registrationId: string
  isWoman: boolean
}

/** Where a dragged player was dropped. */
export type PlayerDrop =
  | { kind: 'swap'; withRegistrationId: string }
  | { kind: 'addToTeam'; teamId: string }
  | { kind: 'newTeamOnCard'; cardId: string }
  | { kind: 'newCardAtHole'; hole: number }

/**
 * Online-only cards store (app-wide provider). Holds every non-deleted card and
 * team across all league events; the cards page filters them by its own event id.
 * Cards and teams are always read and mutated together, so one store owns both.
 *
 * `generateTeams` submits one atomic command that clears the event's existing
 * cards/teams, creates the new layout, assigns each registration to its team, and
 * moves the event into `forming_teams`. `moveTeam` re-cards a single team (drag &
 * drop), creating a card on an empty hole and deleting an emptied one as needed.
 * Because generation also touches registrations and the league event, the caller
 * refreshes those stores after it resolves (see CardsPage / LeagueEventPage).
 */

interface CardsContextValue {
  cards: Card[]
  teams: Team[]
  loaded: boolean
  syncStatus: SyncStatus
  refresh: () => Promise<void>
  generateTeams: (leagueEventId: string, plan: CardPlan[]) => Promise<void>
  moveTeam: (leagueEventId: string, teamId: string, toHole: number) => Promise<void>
  movePlayer: (
    leagueEventId: string,
    registrationId: string,
    drop: PlayerDrop,
    membersByTeam: Map<string, MoveMember[]>,
  ) => Promise<void>
  clearTeams: (leagueEventId: string, assignedRegistrationIds: string[]) => Promise<void>
}

const CardsContext = createContext<CardsContextValue | undefined>(undefined)

export function CardsProvider({ children }: { children: ReactNode }) {
  const [cards, setCards] = useState<Card[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loaded, setLoaded] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')

  // Latest server version — the expected_version for the next command. Cards and
  // teams share the global event log, so both query endpoints report the same one.
  const versionRef = useRef(0)

  const refresh = useCallback(async () => {
    setSyncStatus('syncing')
    try {
      const [cardsRes, teamsRes] = await Promise.all([fetchCards(), fetchTeams()])
      versionRef.current = cardsRes.version
      setCards(cardsRes.cards)
      setTeams(teamsRes.teams)
      setSyncStatus('idle')
    } catch {
      setSyncStatus('offline')
    } finally {
      setLoaded(true)
    }
  }, [])

  // Submits one or more events as a single atomic command (all-or-nothing).
  const submit = useCallback(
    async (events: CommandEvent[]) => {
      setSyncStatus('syncing')
      try {
        try {
          const res = await postCommands(versionRef.current, events)
          versionRef.current = res.version
        } catch (err) {
          if (err instanceof ConflictError) {
            const latest = await fetchCards()
            versionRef.current = latest.version
            const res = await postCommands(versionRef.current, events)
            versionRef.current = res.version
          } else {
            throw err
          }
        }
        await refresh()
      } catch {
        setSyncStatus('offline')
      }
    },
    [refresh],
  )

  const generateTeams = useCallback(
    async (leagueEventId: string, plan: CardPlan[]) => {
      // Clear any existing cards/teams for this event first (regenerate), then
      // build the new layout. All in one atomic command.
      const eventCardIds = new Set(
        cards.filter((c) => c.league_event_id === leagueEventId).map((c) => c.card_id),
      )
      const events: CommandEvent[] = []
      for (const t of teams) {
        if (eventCardIds.has(t.card_id)) events.push(newEvent('TeamDeleted', t.team_id))
      }
      for (const cardId of eventCardIds) events.push(newEvent('CardDeleted', cardId))

      for (const cardPlan of plan) {
        const cardId = newId()
        events.push(
          newEvent('CardCreated', cardId, {
            league_event_id: leagueEventId,
            starting_hole: cardPlan.startingHole,
          }),
        )
        for (const teamPlan of cardPlan.teams) {
          const teamId = newId()
          events.push(
            newEvent('TeamCreated', teamId, {
              card_id: cardId,
              handicap: teamPlan.handicap,
            }),
          )
          for (const registrationId of teamPlan.registrationIds) {
            events.push(newEvent('RegistrationTeamAssigned', registrationId, { team_id: teamId }))
          }
        }
      }
      events.push(newEvent('LeagueEventStateChanged', leagueEventId, { state: 'forming_teams' }))
      await submit(events)
    },
    [cards, teams, submit],
  )

  const clearTeams = useCallback(
    async (leagueEventId: string, assignedRegistrationIds: string[]) => {
      // Delete every card/team for this event, unassign its registrations, and
      // move the event back to `registration`. All in one atomic command.
      const eventCardIds = new Set(
        cards.filter((c) => c.league_event_id === leagueEventId).map((c) => c.card_id),
      )
      const events: CommandEvent[] = []
      for (const t of teams) {
        if (eventCardIds.has(t.card_id)) events.push(newEvent('TeamDeleted', t.team_id))
      }
      for (const cardId of eventCardIds) events.push(newEvent('CardDeleted', cardId))
      for (const registrationId of assignedRegistrationIds) {
        events.push(newEvent('RegistrationTeamAssigned', registrationId, { team_id: null }))
      }
      events.push(newEvent('LeagueEventStateChanged', leagueEventId, { state: 'registration' }))
      await submit(events)
    },
    [cards, teams, submit],
  )

  const moveTeam = useCallback(
    async (leagueEventId: string, teamId: string, toHole: number) => {
      const team = teams.find((t) => t.team_id === teamId)
      if (!team) return
      const fromCard = cards.find((c) => c.card_id === team.card_id)
      const targetCard = cards.find(
        (c) => c.league_event_id === leagueEventId && c.starting_hole === toHole,
      )
      if (fromCard && targetCard && fromCard.card_id === targetCard.card_id) return

      const events: CommandEvent[] = []
      let destCardId: string
      if (targetCard) {
        destCardId = targetCard.card_id
      } else {
        // Dropped onto an empty hole — start a new card there.
        destCardId = newId()
        events.push(
          newEvent('CardCreated', destCardId, {
            league_event_id: leagueEventId,
            starting_hole: toHole,
          }),
        )
      }
      events.push(newEvent('TeamCardChanged', teamId, { card_id: destCardId }))
      // If the source card has no other teams left, remove it.
      if (fromCard) {
        const remaining = teams.filter(
          (t) => t.card_id === fromCard.card_id && t.team_id !== teamId,
        )
        if (remaining.length === 0) events.push(newEvent('CardDeleted', fromCard.card_id))
      }
      await submit(events)
    },
    [cards, teams, submit],
  )

  const movePlayer = useCallback(
    async (
      leagueEventId: string,
      registrationId: string,
      drop: PlayerDrop,
      membersByTeam: Map<string, MoveMember[]>,
    ) => {
      // Locate the dragged player's current team + member record.
      let fromTeamId: string | undefined
      let dragged: MoveMember | undefined
      for (const [teamId, members] of membersByTeam) {
        const found = members.find((m) => m.registrationId === registrationId)
        if (found) {
          fromTeamId = teamId
          dragged = found
          break
        }
      }
      if (!fromTeamId || !dragged) return

      // Simulate the move on a working copy of team memberships, then diff it into
      // events (reassignments, handicap updates, and empty team/card cleanup).
      const work = new Map<string, MoveMember[]>()
      for (const [teamId, members] of membersByTeam) work.set(teamId, [...members])
      const remove = (teamId: string, regId: string) =>
        work.set(teamId, (work.get(teamId) ?? []).filter((m) => m.registrationId !== regId))
      const add = (teamId: string, member: MoveMember) =>
        work.set(teamId, [...(work.get(teamId) ?? []), member])

      const events: CommandEvent[] = []
      const reassignments: Array<[string, string]> = []
      const newTeams: Array<{ teamId: string; cardId: string }> = []

      remove(fromTeamId, registrationId)

      if (drop.kind === 'swap') {
        let otherTeamId: string | undefined
        let other: MoveMember | undefined
        for (const [teamId, members] of membersByTeam) {
          const found = members.find((m) => m.registrationId === drop.withRegistrationId)
          if (found) {
            otherTeamId = teamId
            other = found
            break
          }
        }
        if (!otherTeamId || !other || otherTeamId === fromTeamId) return
        remove(otherTeamId, drop.withRegistrationId)
        add(otherTeamId, dragged)
        add(fromTeamId, other)
        reassignments.push([registrationId, otherTeamId], [drop.withRegistrationId, fromTeamId])
      } else if (drop.kind === 'addToTeam') {
        if (drop.teamId === fromTeamId) return
        add(drop.teamId, dragged)
        reassignments.push([registrationId, drop.teamId])
      } else if (drop.kind === 'newTeamOnCard') {
        const teamId = newId()
        work.set(teamId, [dragged])
        newTeams.push({ teamId, cardId: drop.cardId })
        reassignments.push([registrationId, teamId])
      } else {
        const cardId = newId()
        const teamId = newId()
        work.set(teamId, [dragged])
        newTeams.push({ teamId, cardId })
        events.push(
          newEvent('CardCreated', cardId, {
            league_event_id: leagueEventId,
            starting_hole: drop.hole,
          }),
        )
        reassignments.push([registrationId, teamId])
      }

      for (const [regId, teamId] of reassignments) {
        events.push(newEvent('RegistrationTeamAssigned', regId, { team_id: teamId }))
      }
      for (const nt of newTeams) {
        events.push(
          newEvent('TeamCreated', nt.teamId, {
            card_id: nt.cardId,
            handicap: handicapFor(work.get(nt.teamId) ?? []),
          }),
        )
      }
      // Existing teams: delete when emptied, else re-handicap if composition changed.
      for (const t of teams) {
        if (!membersByTeam.has(t.team_id)) continue
        const members = work.get(t.team_id) ?? []
        if (members.length === 0) {
          events.push(newEvent('TeamDeleted', t.team_id))
        } else {
          const handicap = handicapFor(members)
          if (handicap !== t.handicap) {
            events.push(newEvent('TeamHandicapChanged', t.team_id, { handicap }))
          }
        }
      }
      // Existing cards left with no teams (and none newly added) are removed.
      for (const c of cards) {
        if (c.league_event_id !== leagueEventId) continue
        const hadTeams = teams.some((t) => t.card_id === c.card_id && membersByTeam.has(t.team_id))
        if (!hadTeams) continue
        const stillHasTeam = teams.some(
          (t) => t.card_id === c.card_id && (work.get(t.team_id)?.length ?? 0) > 0,
        )
        const gotNewTeam = newTeams.some((nt) => nt.cardId === c.card_id)
        if (!stillHasTeam && !gotNewTeam) events.push(newEvent('CardDeleted', c.card_id))
      }

      if (events.length === 0) return
      await submit(events)
    },
    [cards, teams, submit],
  )

  useEffect(() => {
    void refresh()
    const onOnline = () => void refresh()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [refresh])

  const value = useMemo<CardsContextValue>(
    () => ({
      cards,
      teams,
      loaded,
      syncStatus,
      refresh,
      generateTeams,
      moveTeam,
      movePlayer,
      clearTeams,
    }),
    [
      cards,
      teams,
      loaded,
      syncStatus,
      refresh,
      generateTeams,
      moveTeam,
      movePlayer,
      clearTeams,
    ],
  )

  return <CardsContext.Provider value={value}>{children}</CardsContext.Provider>
}

export function useCards(): CardsContextValue {
  const ctx = useContext(CardsContext)
  if (ctx === undefined) {
    throw new Error('useCards must be used within a CardsProvider')
  }
  return ctx
}

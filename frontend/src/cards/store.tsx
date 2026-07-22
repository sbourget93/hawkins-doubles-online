import { newEvent, type CommandEvent, type SyncStatus } from '../api/commands'
import { useAggregateRows, useSync } from '../offline/SyncEngine'
import { newId } from '../lib/uuid'
import { handicapFor } from './generateTeams'
import type { CardPlan } from './generateCards'
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
 * Cards store — a thin local-first view over the sync engine. Cards and teams
 * are separate aggregates but always read and mutated together, so one hook owns
 * both. Each mutation builds an atomic event batch and enqueues it; the change
 * is reflected locally at once and synced in the background.
 *
 * Generation batches also touch registrations and the league event
 * (RegistrationTeamAssigned / LeagueEventStateChanged). The engine folds each
 * event through its own aggregate, so those stores update in the same tick — the
 * manual cross-store refresh the old online store needed is no longer required
 * (the awaited refreshes in the pages are now harmless no-ops).
 *
 * The action methods keep their Promise<void> signatures (callers await them),
 * but enqueue is synchronous so they resolve immediately.
 */

interface CardsValue {
  cards: Card[]
  teams: Team[]
  loaded: boolean
  syncStatus: SyncStatus
  refresh: () => Promise<void>
  saveTeamPlan: (leagueEventId: string, plan: CardPlan[]) => Promise<void>
  moveTeam: (leagueEventId: string, teamId: string, toHole: number) => Promise<void>
  changeCardHole: (leagueEventId: string, cardId: string, toHole: number) => Promise<void>
  swapTeams: (teamId: string, withTeamId: string) => Promise<void>
  setTeamPlacements: (
    placements: Array<{ teamId: string; placement: number | null }>,
  ) => Promise<void>
  setTeamScore: (
    teamId: string,
    score: number | null,
    placements: Array<{ teamId: string; placement: number | null }>,
    clearPayoutTeamIds: string[],
  ) => Promise<void>
  setTeamPayouts: (
    payouts: Array<{ teamId: string; payout_amount: number | null }>,
  ) => Promise<void>
  movePlayer: (
    leagueEventId: string,
    registrationId: string,
    drop: PlayerDrop,
    membersByTeam: Map<string, MoveMember[]>,
  ) => Promise<void>
  addStraggler: (
    leagueEventId: string,
    playerId: string,
    isWoman: boolean,
    hole: number,
  ) => Promise<void>
  createAndAddStraggler: (
    leagueEventId: string,
    player: {
      first_name: string
      last_name: string
      display_name: string
      default_pool: string
      is_woman: boolean
    },
    hole: number,
  ) => Promise<void>
  clearTeams: (leagueEventId: string, assignedRegistrationIds: string[]) => Promise<void>
}

export function useCards(): CardsValue {
  const { enqueue, loaded, syncStatus, refresh } = useSync()
  const cards = useAggregateRows<Card>('cards')
  const teams = useAggregateRows<Team>('teams')

  const saveTeamPlan = async (leagueEventId: string, plan: CardPlan[]) => {
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
          newEvent('TeamCreated', teamId, { card_id: cardId, handicap: teamPlan.handicap }),
        )
        for (const registrationId of teamPlan.registrationIds) {
          events.push(newEvent('RegistrationTeamAssigned', registrationId, { team_id: teamId }))
        }
      }
    }
    events.push(newEvent('LeagueEventStateChanged', leagueEventId, { state: 'forming_teams' }))
    enqueue(events)
  }

  // Events that register `playerId` for the event and drop them onto their own
  // one-player (rado) team on a fresh card at `hole` — the shared body of the two
  // straggler check-ins below.
  const stragglerEvents = (
    leagueEventId: string,
    playerId: string,
    isWoman: boolean,
    hole: number,
  ): CommandEvent[] => {
    const registrationId = newId()
    const cardId = newId()
    const teamId = newId()
    return [
      newEvent('RegistrationCreated', registrationId, {
        league_event_id: leagueEventId,
        player_id: playerId,
      }),
      // Stragglers are checked in on the spot with no later chance to mark payment,
      // so record them as paid up front.
      newEvent('RegistrationPaidChanged', registrationId, { is_paid: true }),
      newEvent('CardCreated', cardId, { league_event_id: leagueEventId, starting_hole: hole }),
      newEvent('TeamCreated', teamId, { card_id: cardId, handicap: handicapFor([{ isWoman }]) }),
      newEvent('RegistrationTeamAssigned', registrationId, { team_id: teamId }),
    ]
  }

  // Check in a late arrival ("straggler") after teams already exist: place them on
  // their own team on a fresh card at `hole`, so the admin can then drag them
  // where they belong. One atomic command (registration + card + team + assignment).
  const addStraggler = async (
    leagueEventId: string,
    playerId: string,
    isWoman: boolean,
    hole: number,
  ) => {
    enqueue(stragglerEvents(leagueEventId, playerId, isWoman, hole))
  }

  // Same as addStraggler, but for a late arrival who isn't on the roster yet:
  // create the player first, then place them, all in one atomic command.
  const createAndAddStraggler = async (
    leagueEventId: string,
    player: {
      first_name: string
      last_name: string
      display_name: string
      default_pool: string
      is_woman: boolean
    },
    hole: number,
  ) => {
    const playerId = newId()
    enqueue([
      newEvent('PlayerCreated', playerId, { ...player }),
      ...stragglerEvents(leagueEventId, playerId, player.is_woman, hole),
    ])
  }

  const clearTeams = async (leagueEventId: string, assignedRegistrationIds: string[]) => {
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
    enqueue(events)
  }

  const moveTeam = async (leagueEventId: string, teamId: string, toHole: number) => {
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
    enqueue(events)
  }

  // Reassign an existing card to a different starting hole. A no-op if the hole
  // is unchanged; refuses a hole already taken by another card in the event.
  const changeCardHole = async (leagueEventId: string, cardId: string, toHole: number) => {
    const card = cards.find((c) => c.card_id === cardId)
    if (!card || card.starting_hole === toHole) return
    const taken = cards.some(
      (c) =>
        c.league_event_id === leagueEventId && c.starting_hole === toHole && c.card_id !== cardId,
    )
    if (taken) return
    enqueue([newEvent('CardStartingHoleChanged', cardId, { starting_hole: toHole })])
  }

  // Exchange two teams' cards (drag one team onto another). No cards created or
  // deleted. A no-op if they already share a card.
  const swapTeams = async (teamId: string, withTeamId: string) => {
    const a = teams.find((t) => t.team_id === teamId)
    const b = teams.find((t) => t.team_id === withTeamId)
    if (!a || !b || a.card_id === b.card_id) return
    enqueue([
      newEvent('TeamCardChanged', a.team_id, { card_id: b.card_id }),
      newEvent('TeamCardChanged', b.team_id, { card_id: a.card_id }),
    ])
  }

  // Set each team's finishing place in one atomic command. Only teams whose
  // placement actually changed emit an event; a null clears it.
  const setTeamPlacements = async (
    placements: Array<{ teamId: string; placement: number | null }>,
  ) => {
    const events: CommandEvent[] = []
    for (const { teamId, placement } of placements) {
      const team = teams.find((t) => t.team_id === teamId)
      if (!team || team.placement === placement) continue
      events.push(newEvent('TeamPlacementChanged', teamId, { placement }))
    }
    if (events.length === 0) return
    enqueue(events)
  }

  // Set a team's net score and the placements it recomputes to, in one atomic
  // command. Any score change invalidates the payouts, so the teams in
  // `clearPayoutTeamIds` have theirs cleared in the same command.
  const setTeamScore = async (
    teamId: string,
    score: number | null,
    placements: Array<{ teamId: string; placement: number | null }>,
    clearPayoutTeamIds: string[],
  ) => {
    const team = teams.find((t) => t.team_id === teamId)
    const events: CommandEvent[] = []
    if (team && team.score !== score) {
      events.push(newEvent('TeamScoreChanged', teamId, { score }))
    }
    for (const { teamId: id, placement } of placements) {
      const t = teams.find((tt) => tt.team_id === id)
      if (t && t.placement !== placement) {
        events.push(newEvent('TeamPlacementChanged', id, { placement }))
      }
    }
    for (const id of clearPayoutTeamIds) {
      const t = teams.find((tt) => tt.team_id === id)
      if (t && t.payout_amount !== null) {
        events.push(newEvent('TeamPayoutChanged', id, { payout_amount: null }))
      }
    }
    if (events.length === 0) return
    enqueue(events)
  }

  // Set team payouts in one atomic command. Only teams whose payout changed emit.
  const setTeamPayouts = async (
    payouts: Array<{ teamId: string; payout_amount: number | null }>,
  ) => {
    const events: CommandEvent[] = []
    for (const { teamId, payout_amount } of payouts) {
      const team = teams.find((t) => t.team_id === teamId)
      if (team && team.payout_amount !== payout_amount) {
        events.push(newEvent('TeamPayoutChanged', teamId, { payout_amount }))
      }
    }
    if (events.length === 0) return
    enqueue(events)
  }

  const movePlayer = async (
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
    enqueue(events)
  }

  return {
    cards,
    teams,
    loaded,
    syncStatus,
    refresh,
    saveTeamPlan,
    moveTeam,
    changeCardHole,
    swapTeams,
    setTeamPlacements,
    setTeamScore,
    setTeamPayouts,
    movePlayer,
    addStraggler,
    createAndAddStraggler,
    clearTeams,
  }
}

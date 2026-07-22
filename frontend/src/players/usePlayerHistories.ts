import { useMemo } from 'react'
import { playerName as formatName } from './format'
import { usePlayers } from './store'
import { useRegistrations } from '../registrations/store'
import { useCards } from '../cards/store'
import { useLeagueEvents } from '../leagueEvents/store'
import type { LeagueEvent } from '../leagueEvents/types'

/** One of a player's past finishes: where they placed, at which event, and with whom. */
export interface PlacementEntry {
  event: LeagueEvent
  placement: number
  /** How many teams were ranked at the event, for context (e.g. "2nd of 5"). */
  teamCount: number
  partners: string[]
}

/**
 * Full placement history for every player, keyed by player_id, derived from the
 * app-wide stores. A player's placements come from their registrations that were
 * assigned to a team whose score (and therefore placement) has been entered; the
 * team's other members are the partner(s). Recomputed only when the underlying
 * data changes.
 *
 * Shared by any surface that shows a player's profile (the players roster, the
 * rankings board, …) so the derivation lives in one place.
 */
export function usePlayerHistories(): Map<string, PlacementEntry[]> {
  const { players } = usePlayers()
  const { registrations } = useRegistrations()
  const { cards, teams } = useCards()
  const { leagueEvents } = useLeagueEvents()

  return useMemo(() => {
    const playerName = (id: string) => formatName(players.find((pl) => pl.player_id === id))
    const teamById = new Map(teams.map((t) => [t.team_id, t]))
    const eventByCard = new Map(cards.map((c) => [c.card_id, c.league_event_id]))
    const eventById = new Map(leagueEvents.map((e) => [e.league_event_id, e]))
    const regsByTeam = new Map<string, typeof registrations>()
    for (const r of registrations) {
      if (!r.team_id) continue
      const list = regsByTeam.get(r.team_id) ?? []
      list.push(r)
      regsByTeam.set(r.team_id, list)
    }

    // How many teams were ranked (have a placement) at each event, so a player's
    // finish can be shown with context, e.g. "2nd of 5".
    const teamCountByEvent = new Map<string, number>()
    for (const team of teams) {
      if (team.placement == null) continue
      const eventId = eventByCard.get(team.card_id)
      if (!eventId) continue
      teamCountByEvent.set(eventId, (teamCountByEvent.get(eventId) ?? 0) + 1)
    }

    const byPlayer = new Map<string, PlacementEntry[]>()
    for (const r of registrations) {
      if (!r.team_id) continue
      const team = teamById.get(r.team_id)
      if (!team || team.placement == null) continue
      const event = eventById.get(r.league_event_id)
      if (!event) continue
      const partners = (regsByTeam.get(r.team_id) ?? [])
        .filter((o) => o.player_id !== r.player_id)
        .map((o) => playerName(o.player_id))
      const list = byPlayer.get(r.player_id) ?? []
      list.push({
        event,
        placement: team.placement,
        teamCount: teamCountByEvent.get(event.league_event_id) ?? 0,
        partners,
      })
      byPlayer.set(r.player_id, list)
    }
    // Most recent first.
    for (const list of byPlayer.values()) {
      list.sort((a, b) => b.event.date.localeCompare(a.event.date))
    }
    return byPlayer
  }, [players, registrations, cards, teams, leagueEvents])
}

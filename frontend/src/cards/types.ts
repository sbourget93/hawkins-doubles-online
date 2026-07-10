/** Domain types for the card and team aggregates.
 *
 * A card is a group of teams that play a round together starting on a given hole;
 * a team is 1–3 registered players with a handicap. They are always read and
 * rendered together on the cards page, so one store owns both.
 */

export interface Card {
  card_id: string
  league_event_id: string
  starting_hole: number
}

export interface Team {
  team_id: string
  card_id: string
  handicap: number
  placement: number | null
}

export interface CardsResponse {
  version: number
  cards: Card[]
}

export interface TeamsResponse {
  version: number
  teams: Team[]
}

# Card
A card represents a group of teams that play the round together. Cards will typically be two teams playing together, but sometimes sending out a card of 1 team or a card of 3 teams is necessary.

## Fields

| Field | Description |
| ----- | ----------- |
| `card_id` | Unique id of the card. |
| `league_event_id` | Foreign key to the league event. |
| `starting_hole` | The hole that the card will begin its round on. These are automatically assigned in order of "easiest hole to get to" to "hardest hole to get to". |

## Relationships

- Belongs to one [LeagueEvent](./league-event.md).
- Has 1 to 3 [Teams](./team.md).

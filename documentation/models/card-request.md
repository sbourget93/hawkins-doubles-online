# CardRequest
Represents a request from a player about who they play with. A player might want
to play on the same card as one of their friends, or might want to be kept off the
same card as someone they don't get along with. The admin enters these while
setting up an event.

Requests link two players (not registrations) so they can be entered before either
player has registered for the event.

Card generation does not consume these requests yet; for now the object only
records the admin's intent.

`avoid` requests are sensitive (they name who a player doesn't want to be paired
with), so only admins can see them.

## Fields

| Field | Description |
| ----- | ----------- |
| `card_request_id` | Unique id of the card request. |
| `league_event_id` | Foreign key to the league event. |
| `player_id_a` | Foreign key to one of the two players in the request. |
| `player_id_b` | Foreign key to the other player in the request. |
| `request_type` | `prefer` (the two players want to be on the same card) or `avoid` (the two players should be kept on separate cards). |

## Relationships

- Belongs to one [LeagueEvent](./league-event.md).
- Refers to exactly two [Players](./player.md).

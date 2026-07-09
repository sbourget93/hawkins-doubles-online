# Registration
A registration represents a player's entry into a league event.

## Fields

| Field | Description |
| ----- | ----------- |
| `registration_id` | Unique id of the registration. |
| `league_event_id` | Foreign key to the league event. |
| `player_id` | Foreign key to the player. |
| `team_id` | Foreign key to the team. Null until the registration is assigned to a team. |
| `is_paid` | Whether the player has paid their entry fee ($10) yet. |
| `pool_override` | Used to override a player's default pool for a single league event. |
| `payout_amount` | How much money the player won at the league event. This is calculated automatically after round completion, but before league event completion. The admin may adjust the payouts before completing the league event. |

## Relationships

- Belongs to one [LeagueEvent](./league-event.md).
- Refers to exactly one [Player](./player.md).
- Belongs to 0 or 1 [Team](./team.md).
- May be the winner of a [ClosestToPin](./closest-to-pin.md).

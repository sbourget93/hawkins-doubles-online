# LeagueEvent
A league event is run on a weekly basis where players form teams and compete in a round of best-shot doubles.

## Fields

| Field | Description |
| ----- | ----------- |
| `league_event_id` | Unique id of the league event. |
| `date` | The date of the league event. This will typically be on Wednesdays. |
| `state` | The state of the league event. Can be `registration`, `forming_teams`, `forming_cards`, `ready`, `in_progress`, or `completed`. |

## Relationships

- Has 0 to many [Registrations](./registration.md).
- Has 0 to many [Cards](./card.md).
- Has 0 to many [ClosestToPins](./closest-to-pin.md).

# LeagueEvent
A league event is run on a weekly basis where players form teams and compete in a round of best-shot doubles.

## Fields

| Field | Description |
| ----- | ----------- |
| `league_event_id` | Unique id of the league event. |
| `date` | The date of the league event. This will typically be on Wednesdays. |
| `title` | The title of the league event. Defaults to Hawkins Dubs. Displayed alongside the date as "title — date". |
| `state` | The state of the league event. Can be `registration`, `forming_teams`, `ready`, `in_progress`, or `completed`. |

## Relationships

- Has 0 to many [Registrations](./registration.md).
- Has 0 to many [Cards](./card.md).
- Has 0 to many [ClosestToPins](./closest-to-pin.md).

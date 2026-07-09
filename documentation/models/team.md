# Team
Players randomly form and compete as teams of 2. No team will ever have 2 "A pool" players on it. Rarely teams of 3 "B pool" players may form at the event administrator's discretion. When there are an odd number of players, one "B pool" player may not have a teammate, meaning they play as their own doubles partner - this is called "rado".

## Fields

| Field | Description |
| ----- | ----------- |
| `team_id` | Unique id of the team. |
| `card_id` | Foreign key to the card. |
| `handicap` | How many handicap strokes this team gets. By default a team of 2 gets a -2 stroke handicap per woman on the team. A "rado" woman will get -4.|
| `placement` | Where the team placed after the round is complete (1, 2, 3, etc.). An admin will enter placements manually after round completion. Ties are possible. |

## Relationships

- Belongs to one [Card](./card.md).
- Has 1 to 3 [Registrations](./registration.md).

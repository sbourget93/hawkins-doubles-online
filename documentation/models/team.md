# Team
Players randomly form and compete as teams of 2. No team will ever have 2 "A pool" players on it. Rarely teams of 3 "B pool" players may form at the event administrator's discretion. When there are an odd number of players, one "B pool" player may not have a teammate, meaning they play as their own doubles partner - this is called "rado".

## Fields

| Field | Description |
| ----- | ----------- |
| `team_id` | Unique id of the team. |
| `card_id` | Foreign key to the card. |
| `handicap` | How many handicap strokes this team gets. By default a team of 2 gets a -2 stroke handicap per woman on the team. A "rado" woman will get -4. |
| `score` | The team's net score for the round (fewer strokes places better), entered manually by the admin after play. Null until entered. Placements are derived from this. |
| `placement` | Where the team placed (1, 2, 3, etc.), derived from `score`. Teams sharing a score tie (share a placement) unless the admin breaks the tie, which records distinct placements for them. |
| `payout_amount` | How much money the team won at the league event. Calculated automatically after round completion from the PDGA amateur top-45% payout table (keyed by number of teams; see `frontend/src/cards/payouts.ts`) and assigned by placement, but before league event completion. The admin may adjust the payouts before completing the league event. |

## Relationships

- Belongs to one [Card](./card.md).
- Has 1 to 3 [Registrations](./registration.md).

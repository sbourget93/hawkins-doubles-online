# ClosestToPin
Represents a closest-to-pin (CTP) prize. There are several every week. The player that lands their drive closest to the basket on the assigned hole will win the prize. This is all handled manually by the players, the database object only has two purposes:
* Track the winners which will be entered manually by the admin.
* Inform the admin which card should bring out the CTP marker when starting the round, and which cards should bring them back when the round is over.

## Fields

| Field | Description |
| ----- | ----------- |
| `closest_to_pin_id` | Unique id of the CTP. |
| `league_event_id` | Foreign key to the league event. |
| `winner_registration_id` | Foreign key to the registration that won the CTP. Null until a winner is recorded. |
| `hole_number` | The hole that the CTP is on. |
| `prize` | The prize for winning the CTP. Typically this will just be "cash" ($1 per league event entrant) or "stuff" (choose something from a bag of stuff). |

## Relationships

- Belongs to one [LeagueEvent](./league-event.md).
- Won by 0 or 1 [Registration](./registration.md).

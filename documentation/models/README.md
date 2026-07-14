# Projection Data Models

These are all read-model projections derived from the event-sourced data in the [`events`](./events.md) table; they are never written to directly.

| Model | Description |
| ----- | ----------- |
| [LeagueEvent](./league-event.md) | A weekly event where teams play a round of disc golf. |
| [Registration](./registration.md) | A players registration for a league event. |
| [Card](./card.md) | A card of one, two, or three or more teams that play together. |
| [Team](./team.md) | A team of two to three more players. |
| [Player](./player.md) | A player profile (name, pool, sex, etc.). |
| [ClosestToPin](./closest-to-pin.md) | A prize given out for the player who lands the closest to the pin on a designated hole. |
| [CardRequest](./card-request.md) | A request between two players to play on (or *not* on) the same card as one another. |
| [Bounty](./bounty.md) | A standalone prize for competing a particular achivement or task. |

## Metadata fields

Every projection table, and the events table, has these standard fields in addition to the domain fields defined in each object's file.

| Field | Description |
| ----- | ----------- |
| `created_at` | The timestamp of the creation event for this object. |
| `updated_at` | The timestamp of the most recent update event for this object. Creation and deletion are not updates. |
| `deleted_at` | The timestamp this object was most recently deleted, or null if it is currently active (never deleted, or since restored). |

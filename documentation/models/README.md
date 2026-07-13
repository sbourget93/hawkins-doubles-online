# Projection Data Models

- **[LeagueEvent](./league-event.md):** Has 0 to many Registrations, Cards, ClosestToPins, and CardRequests.
- **[Registration](./registration.md):** Refers to 1 Player.
- **[Card](./card.md):** Has 1 to many Teams.
- **[Team](./team.md):** Has 1 to many Registrations.
- **[Player](./player.md):** Referred to by 0 to many Registrations.
- **[ClosestToPin](./closest-to-pin.md):** Won by 0 or 1 Registration.
- **[CardRequest](./card-request.md):** Refers to 2 Players; belongs to 1 LeagueEvent.
- **[Bounty](./bounty.md):** A standalone prize; no relationships.

## Metadata fields

Every projection table has these standard fields in addition to the domain fields defined in each object's file.

| Field | Description |
| ----- | ----------- |
| `created_at` | The timestamp of the creation event for this object |
| `updated_at` | The timestamp of the most recent update event for this object. Creation and deletion are not updates. |
| `deleted_at` | The timestamp this object was most recently deleted, or null if it is currently active (never deleted, or since restored). |

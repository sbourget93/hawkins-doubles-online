# Player
Players are individuals who participate in the Hawkins Doubles disc golf league.

## Fields

| Field | Description |
| ----- | ----------- |
| `player_id` | Unique id of the player. |
| `first_name` | First name of the player. |
| `last_name` | Last name of the player. |
| `is_woman` | Indicates whether or not the player is a woman. Women typically get some kind of handicap.  |
| `default_pool` | Each player can be in A pool (strong player) or B pool (not strong player). Teams will never have two A players on them. |

## Relationships

- Referred to by 0 to many [Registrations](./registration.md).

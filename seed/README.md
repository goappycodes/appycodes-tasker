# Seed inputs

This folder is **gitignored** — never commit team data. Drop these files in locally before running `npm run seed`:

## `users.csv`

| column             | required  | notes                                                                                                                                        |
| ------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`             | yes       | full name                                                                                                                                    |
| `email`            | yes       | unique; lowercased on insert                                                                                                                 |
| `slack_user_id`    | preferred | Slack member ID (e.g. `U01ABC2DEF`). Without it, login falls back to email match — but matching only kicks in once. Adding it later is fine. |
| `slack_handle`     | no        | `@ritesh` (no `@`)                                                                                                                           |
| `clockify_user_id` | no        | populated for Sprint 4                                                                                                                       |
| `role`             | yes       | one of `admin`, `manager`, `lead`, `dev`                                                                                                     |

At least one row must have `role=admin` so the Trello importer has a fallback creator.

## `projects.csv`

| column             | required  | notes                                                                                                                       |
| ------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| `slug`             | yes       | unique, kebab-case. Must match `slugFromBoardName(trelloBoardName)` for Trello cards to be imported into the right project. |
| `name`             | yes       | display name                                                                                                                |
| `slack_channel_id` | preferred | Slack channel ID (e.g. `C01ABC2DEF`)                                                                                        |
| `lead_email`       | no        | matches `users.csv.email` to set `projects.lead_user_id`                                                                    |
| `description`      | no        |                                                                                                                             |

## `trello-export.json`

Either a single board export or an array of boards. The importer reads `lists`, `cards`, `members`. Card → status mapping (default `todo`):

- list name contains "done", "complete", "shipped", "closed" → `done`
- list name contains "blocked", "waiting", "hold" → `blocked`
- list name contains "progress", "doing", "wip", "active" → `in_progress`
- otherwise → `todo`

Story points are read from labels like `"1pt"`, `"3 points"`, `"8"`. Default is `3`. A `"20"` label is downgraded to `8` with a warning — the team breaks it down post-import.

## Idempotency

Re-running `npm run seed` is safe:

- users keyed on `email`
- projects keyed on `slug`
- Trello cards keyed on `task_events.metadata.trello_card_id` from the `created` event of their first import

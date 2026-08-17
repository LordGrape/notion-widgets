# notion-widgets

Self-hosted widgets for embedding in Notion.

## Repo map
- `apps/` — app map and wrapper entry files for each widget
- `packages/` — shared-package destinations and docs
- `core.js` — current shared runtime used by legacy widgets
- `worker/` — Cloudflare Worker / sync backend
- `studyengine/` — existing Vite/TypeScript study app
- `wrangler.jsonc` — current Cloudflare deployment config
- `MIGRATION.md` — migration plan and AI editing workflow

## Widgets
| Widget | Current source | App folder |
| --- | --- | --- |
| Clock | `clock.html` | `apps/clock/` |
| Quotes | `quotes.html` | `apps/quotes/` |
| To-do | `todo.html` | `apps/todo/` |
| Timetable | `timetable.html` | `apps/timetable/` |
| Study Engine | `studyengine/` | `apps/studyengine/` |

## How to change one widget
1. Open the matching folder under `apps/`.
2. Read its `README.md`.
3. Edit the current production source listed there.
4. Avoid unrelated files.

## Development
- Preview: `pnpm preview`
- Deploy: `pnpm deploy`
- Format: `pnpm format`

## Migration status
The repo is now structured as a monorepo map while preserving legacy production paths. This avoids breaking existing Notion embeds while making the project easier for AI agents to navigate.

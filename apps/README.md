# Apps (widgets)

Each widget has a folder under `apps/`. During migration, app folders may wrap legacy production files instead of physically moving them. This keeps existing Notion embeds and deployment paths stable.

## App map
| App | Current production source | Notes |
| --- | --- | --- |
| `clock/` | `../clock.html` | Clock, stopwatch, timer, weather |
| `quotes/` | `../quotes.html` | Daily quote widget |
| `todo/` | `../todo.html` | Task widget with SyncEngine state |
| `timetable/` | `../timetable.html` | Schedule, week view, milestone radar |
| `studyengine/` | `../studyengine/` | Existing Vite/TypeScript app |

## Migration rules
- Preserve working root-level embeds until replacement URLs are tested.
- Add or update each app README before changing behaviour.
- Keep app-specific changes inside that app source.
- Put shared behaviour in `packages/` or the legacy `core.js` runtime.
- Avoid large rewrites unless deployment and state migration are explicitly planned.

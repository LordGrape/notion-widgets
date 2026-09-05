# Applications

Each focused widget has a folder under `apps/`. During migration, most folders document and wrap stable root-level production files. This preserves existing Notion embed URLs while giving humans and AI agents a reliable application map.

## Application map

| Application | Production source | Data boundary |
| --- | --- | --- |
| `assistant/` | `apps/assistant/` | Reads existing namespaces without duplicating state |
| `todo/` | `todo.html` / `todo-v2.html` | `todo` |
| `timetable/` | `timetable.html` | `timetable`, `dragon`, `clock`, `user` |
| `studyengine/` | `studyengine/` | Study Engine modules and existing SyncEngine contracts |
| `athlete/` | `athlete.source.html` and `athlete-*` modules | Athlete state and bounded Notion Test Log bridge |
| `clock/` | `clock.html` | `clock`, `user` |
| `quotes/` | `quotes.html` | Quote presentation data |

## Choosing where to edit

1. Read the target application's README.
2. Edit the production source named there.
3. Keep application-specific behaviour local.
4. Move code into `packages/` only when it has a stable use in multiple applications.
5. Preserve root production paths until replacement URLs have been deployed and verified.

## Shared rules

- Persistent application state uses SyncEngine unless a documented boundary says otherwise.
- Static applications never contain private tokens or Notion credentials.
- Protected network and Notion operations belong in `worker/`.
- Generated files are rebuilt from source rather than edited directly.

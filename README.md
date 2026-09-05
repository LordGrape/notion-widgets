# Notion Widgets

A personal suite of synchronized tools for planning, study, training, and focused execution inside and alongside Notion.

## Applications

| Application | Role | Production source |
| --- | --- | --- |
| Command Centre | Installable PWA and unified execution view | `apps/assistant/` |
| To-do | Tasks, priorities, action blocks, and reminders | `todo.html` / `todo-v2.html` |
| Timetable | Weekly schedule, targets, and milestone radar | `timetable.html` |
| Study Engine | Active recall and review workflow | `studyengine/` |
| Athlete | Training, assessments, and performance records | `athlete.source.html` and modules |
| Clock | Clock, timer, focus tracking, and weather | `clock.html` |
| Quotes | Daily quotation embed | `quotes.html` |

Existing root-level production paths are intentionally preserved so embedded Notion widgets continue working during the monorepo migration.

## Repository map

```text
apps/          Application documentation, wrappers, and Command Centre
packages/      Shared runtime and package boundaries
studyengine/   Vite and TypeScript Study Engine source
worker/        Cloudflare Worker and protected integrations
tools/         Build, verification, and migration scripts
docs/          Architecture and contributor guidance
dist/          Generated artifacts
```

Start with [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for system boundaries. For a focused widget change, read [`apps/README.md`](apps/README.md) and then the target application's README.

## Development

```bash
pnpm install
pnpm check
```

Common commands:

- `pnpm preview` starts the Cloudflare development environment.
- `pnpm format` formats supported files.
- `pnpm typecheck` checks shared TypeScript configuration.
- `pnpm check:assistant` validates the Command Centre PWA structure.
- `pnpm check` runs repository-level static checks.

Study Engine and Worker have their own package commands and continuous integration jobs.

## Deployment

- GitHub is the source of truth.
- Existing Notion embed URLs must remain stable.
- Worker secrets remain in Cloudflare, never in static files.
- Generated artifacts are rebuilt from source rather than edited directly.

## Editing principles

1. Preserve current behaviour unless a change explicitly requires otherwise.
2. Keep persistent state behind `SyncEngine.get`, `SyncEngine.set`, and documented namespaces.
3. Prefer small application-local changes over broad shared-runtime edits.
4. Update the target application's README when its contract changes.
5. Verify light, dark, mobile, standalone, and Notion embed contexts when relevant.

See [`AGENTS.md`](AGENTS.md) for implementation guardrails.

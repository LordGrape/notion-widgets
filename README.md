# Notion Widgets

A personal suite of synchronized tools for planning, focused work, learning, and training in Notion. Each widget remains independently embeddable while sharing one visual system, one synchronization boundary, and stable production URLs.

## Product map

| Application | Purpose | Source | Production path |
| --- | --- | --- | --- |
| Command Centre | Unified execution view | `apps/assistant/` | application-owned |
| To-do | Priorities, action blocks, and reminders | documented in `apps/todo/` | `/todo*.html` |
| Timetable | Weekly schedule and one-off timed work | `timetable.html` | `/timetable.html` |
| Study Engine | Retrieval practice and adaptive tutoring | `studyengine/` | `/dist/studyengine.html` |
| Athlete | Assessments, workouts, and progress | Athlete source modules | `/athlete.html` |
| Clock | Time, timer, focus tracking, and weather | `clock.html` | `/clock.html` |
| Quotes | Passive daily quotation | `quotes.html` and `quotes.json` | `/quotes.html` |

## Repository structure

```text
apps/          Application boundaries and local guidance
packages/      Shared code with multiple consumers
studyengine/   Vite and TypeScript Study Engine
worker/        Cloudflare Worker and protected integrations
tools/         Active build and verification scripts
docs/          Durable architecture documentation
dist/          Generated Study Engine output
```

Root production paths stay stable for existing Notion embeds while source is consolidated application by application.

## Development

```bash
pnpm install
pnpm check
```

Application-specific commands and contracts live in each app README. Start with [`apps/README.md`](apps/README.md), then read the target application's README and nearest `AGENTS.md`.

## Principles

1. GitHub source and recent commits outrank stale planning notes.
2. Preserve current behaviour, URLs, and data contracts unless the task requires a change.
3. Keep code local until at least two applications need the same abstraction.
4. Use SyncEngine for persistent state and the Worker for protected operations.
5. Keep the interface minimal, responsive, accessible, and visually consistent.
6. Rebuild generated files instead of editing them.

See [`AGENTS.md`](AGENTS.md) for agent guardrails and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for system boundaries.

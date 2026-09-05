# Architecture

## System goal

The repository contains focused Notion widgets and one optional command-centre application. Widgets remain independently embeddable. Shared behaviour stays behind stable boundaries so a change to one surface does not require understanding the entire codebase.

## Repository map

```text
apps/                   App index and stable wrappers
  assistant/            Installable command-centre PWA
  athlete/              Athlete documentation and wrapper
  clock/                Clock documentation and wrapper
  quotes/               Quotes documentation and wrapper
  studyengine/           Study Engine documentation and wrapper
  timetable/            Timetable documentation and wrapper
  todo/                 To-do documentation and wrapper
packages/               Shared-package boundaries and documentation
studyengine/             Vite and TypeScript Study Engine source
worker/                  Cloudflare Worker and protected integrations
tools/                   Build, verification, and migration scripts
dist/                    Generated artifacts only
```

Root-level HTML and JavaScript files are still production sources during migration. Their URLs remain stable for existing Notion embeds.

## Editing decision tree

1. Identify the affected application in `apps/README.md`.
2. Read its local README and any nearer `AGENTS.md`.
3. Edit the documented production source only.
4. Put reusable behaviour in a shared package only when at least two applications need it.
5. Preserve SyncEngine namespace and key contracts.
6. Run the narrowest relevant verification before broader checks.

## Stable boundaries

- `core.js` owns the legacy shared runtime and SyncEngine contract.
- `worker/` owns secrets, Notion writes, reminders, and protected network operations.
- `studyengine/` owns Study Engine source. `dist/studyengine.html` is generated.
- `apps/assistant/` may read existing widget state but must not create competing copies.
- Root production paths remain stable until an explicit migration verifies replacement URLs.

## AI context policy

Documentation should answer four questions before code is opened:

1. What does this application do?
2. Which file is the production source?
3. Which persistent data does it own?
4. Which behaviours are protected from incidental change?

Keep instructions short, local, and testable. Do not duplicate large global rules inside every application folder.

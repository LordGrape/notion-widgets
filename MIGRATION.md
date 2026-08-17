# Monorepo migration plan

## Goal
Make the repo easier for humans and AI agents to edit by separating widgets, shared runtime, and backend code.

## Current state
The repo now has a monorepo map:
- `apps/*` documents each widget and provides wrapper entry files.
- `packages/core` documents the legacy shared runtime in `core.js`.
- `packages/sync-worker` documents the worker project in `worker/`.

Existing production files are intentionally preserved:
- `clock.html`
- `quotes.html`
- `todo.html`
- `timetable.html`
- `studyengine/`
- `worker/`

## Why wrappers first
Wrappers give the repo a professional app map without breaking existing Notion embed URLs or Cloudflare deployment behaviour.

## Next safe phases
1. Verify current embeds still work from root-level files.
2. Add deployment routes for `apps/*` if desired.
3. Move one widget at a time into its app folder.
4. Extract shared styles/utilities from root HTML files into `packages/core`.
5. Convert selected widgets to TypeScript/Vite only when the benefit is clear.

## AI editing workflow
1. Read `README.md` and this file.
2. Identify the target app in `apps/README.md`.
3. Read that app's README.
4. Edit only the relevant source file(s).
5. Avoid touching `core.js` unless shared behaviour is intended.

# Timetable

## Purpose
Schedule, weekly overview, and milestone radar widget for Notion embeds.

## Current source
- Legacy production file: `../../timetable.html`
- Shared runtime: `../../core.js`

## State
SyncEngine namespaces used by the legacy widget:
- `timetable`
- `dragon`
- `clock`
- `user`

## Migration status
This app folder currently wraps the legacy widget without changing behaviour. The timetable is larger than the other root widgets, so preserve behaviour first and refactor in smaller passes.

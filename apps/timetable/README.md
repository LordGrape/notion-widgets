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

## Recurring targets
- A schedule block is the stable weekly activity.
- `outcomeGoal` on the block is an optional default target.
- `overrides[].outcomeGoal` is the dated session target and takes precedence.
- Classes remain schedule-only. Study and training targets create dated to-do occurrences when task creation is enabled.

# To-do

## Purpose
Short-term task widget for Notion embeds. Supports task creation, priority, time estimate, due state, notes, completion, undo, and SyncEngine persistence.

## Current source
- Legacy production file: `../../todo.html`
- Shared runtime: `../../core.js`

## State
SyncEngine namespace: `todo`
Key: `tasks`

Task shape:
```ts
type Task = {
  id: string
  text: string
  pri?: "must" | "should" | "could" | null
  time?: "quick" | "m30" | "m60" | "deep" | null
  due?: "today" | "tomorrow" | null
  dueKey?: string | null
  setKey?: string
  done: boolean
  doneAt?: number | null
  created: number
  order?: number
  notes?: string
}
```

## Migration status
This app folder currently wraps the legacy widget without changing behaviour.

## Scheduled targets
Generated timetable tasks keep a stable task title while `outcomeGoal` stores the target for that dated occurrence. Editing a generated target writes it back to the matching timetable override, so future weeks remain independent.

## Upcoming assignments
- A quiet section reads up to five incomplete records tagged `assignment 📑` from the next 14 calendar days in Domains and HQ.
- The section is collapsed by default and does not affect daily workload, completion, or notifications.
- The assignment remains the overall outcome. User-authored phases are stored as linked Action Blocks through the existing `Context` relation.
- A phase enters Today or Tomorrow only after the user assigns that phase a date. Date-only phases remain flexible and do not trigger timed reminders.

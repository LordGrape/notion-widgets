# To-do

## Purpose
Short-term task widget for Notion embeds. Supports task creation, priority, time estimate, due state, notes, completion, undo, optional exact reminders, and SyncEngine persistence.

## Current source
- Legacy production file: `../../todo.html`
- Shared runtime: `../../core.js`
- Reminder interface: `../../todo-reminders.js`

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
  reminderAt?: string
  reminderTimezone?: string
  reminderVersion?: number
  reminderState?: "scheduled" | "sending" | "sent" | "error"
  reminderSentAt?: number
  reminderSentFor?: string
}
```

## Exact reminders
- Open a task's edit panel and choose an exact local date and time.
- The choice is optional. Clearing it removes the scheduled notification.
- Reminder state synchronizes through the existing `todo/tasks` payload.
- The Cloudflare Worker checks due reminders every minute and posts an @-mention comment on the matching Action Block page.
- The mention appears in Notion Inbox and can produce a Notion mobile push notification. Notion documents that mobile delivery can take up to about five minutes.
- The Worker automatically resolves the recipient when the integration can see one person. Set `NOTION_REMINDER_USER_ID` or `NOTION_REMINDER_USER_EMAIL` in the Worker environment if it can see multiple people.
- Delivery markers are retained for 30 days to prevent duplicate notifications. Failed deliveries retry after four minutes.

## Migration status
This app folder currently wraps the legacy widget without changing behaviour.

## Scheduled targets
Generated timetable tasks keep a stable task title while `outcomeGoal` stores the target for that dated occurrence. Editing a generated target writes it back to the matching timetable override, so future weeks remain independent.

## Upcoming assignments
- A quiet section reads up to five incomplete records tagged `assignment 📑` from the next 14 calendar days in Domains and HQ.
- The section is collapsed by default and does not affect daily workload, completion, or notifications.
- The assignment remains the overall outcome. User-authored phases are stored as linked Action Blocks through the existing `Context` relation.
- A phase enters Today or Tomorrow only after the user assigns that phase a date. Date-only phases remain flexible and do not trigger timed reminders.

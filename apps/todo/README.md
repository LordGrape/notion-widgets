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
  repeatRule?: { frequency: "daily" | "weekly"; interval: number; days: number[]; anchorDate: string }
  repeatRootId?: string
  repeatOccurrence?: string
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

## Calm UI layer
`todo-smart-shell.html` loads the compiled `todo-ui.js` enhancement. Its React
islands use locally styled shadcn/ui patterns built on Radix, Lucide icons,
Motion for restrained transitions, and dnd-kit for pointer/touch and keyboard
reordering. The existing vanilla task editor and import/sync code still own
task mutations; `TodoUIBridge` is application-local and does not alter SyncEngine.

- Build: `cd apps/todo && npm ci && npm run build` (commit the root `todo-ui.js`).
- Goal logic: `npm test` in this folder.
- Browser: `node tools/test-todo-ui.cjs` and `node tools/test-todo-loader.cjs`.
- Goal setting: `todo/dailyGoal`, JSON `{date: YYYYMMDD, count: 0..5}`.
  Default is one Should Do, bounded by the number planned today. All Must Do
  and unclassified tasks remain commitments; Could Do never blocks the goal.
  A goal setting applies only to its local calendar day.
- Reordering preserves priority groups (and dates in Upcoming). Keyboard:
  focus a drag handle, Space to pick up, arrows to move, Space to drop,
  Escape to cancel. Touch drags start on the handle so the list can still scroll.
- The trigger-nudge toggle, banners, polling, and workload toasts are removed.
  Exact task reminders remain an explicit, optional feature.
- React is confined to this UI enhancement. Existing embed paths and task
  payloads remain compatible, including schedule pasting and task editing.

## Reading estimates

Shared logic and editor controls live in `../../reading-estimates.js` with `../../reading-estimates.css`. Existing `plannedMinutes` is the scheduling estimate; optional `reading` metadata stores `pageMode` (`text`, `count`, `range`), page count/endpoints, pace, `manual` and `autoMinutes`. Older tasks remain compatible, including previously saved reading paces. New inferred estimates never overwrite a manual duration or existing time band. The task writer, natural entry and Command Centre use the same model. Run `node tools/test-reading-estimates.cjs` for parsing, manual override, adaptive pace, splitting and persistence checks.

Command Centre can create long readings as separate inclusive page-range sessions. Clock stores up to 300 task-linked focus records in `clock/focus_sessions`; after three completed readings with sufficient focus time, Reading Estimates uses their median minutes per page as a suggested default. Existing manual pace and duration choices remain authoritative. Quick Add supports recurring daily and weekly study tasks; completing one creates the next occurrence only, while deleting that occurrence ends the series.

## Shared entry points

`todo-smart-shell.html` and `todo-v2.html` both load `todo-loader.js`; `todo-sync.html` embeds the same shell. The loader composes the existing `todo.html` controller with the same upgrades and UI used by Command Centre. Required icons, reading logic and SyncEngine are fetched before mounting, with the existing public-source fallback. A missing dependency displays a load error rather than an active but broken composer. All task changes continue through the controller and `todo/tasks`; the old sync wrapper no longer installs a separate task merger.

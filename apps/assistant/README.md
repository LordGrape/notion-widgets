# Command Centre

Private installable Progressive Web App (PWA) for coordinating Notion, law school, and the rest of Musbah's operating system.

## Product role

Command Centre is a companion to Notion, not a replacement for it. Notion remains the source of truth for detailed knowledge, databases, and planning. Command Centre provides the daily execution layer:

- prioritized tasks and concise briefings
- a dedicated Queen's Law view
- a whole-life view covering military, fitness, administration, and personal work
- focused access to every existing widget
- a command surface that can grow into a secure conversational assistant

## Privacy model

The interface is publicly downloadable because it is hosted from a public GitHub repository. Private data is not included in the repository or static application bundle.

On first launch, the application requires the Cloudflare Worker access key and verifies it against the protected `/state/user` route. After successful verification, the key is remembered in browser-local storage and copied into the active session on later launches. Choosing **Lock Command Centre** deletes both copies. Every state request sends the key through the `X-Widget-Key` header over HTTPS.

This is durable browser storage rather than a server cookie. It provides the requested one-time unlock on that browser without placing the key in GitHub or the application bundle.

See [`SECURITY.md`](SECURITY.md) for the threat model and operational rules.

## Notion bridge

Tasks continue to synchronize through the Action Blocks database. Command Centre also expands the next 21 days of recurring timetable blocks and upserts them into the separate **Widget Timetable** Notion database. The database includes a calendar view, so Notion AI can answer questions using the same task and timetable information shown by the widgets.

The bridge runs after Command Centre opens, every five minutes while it remains open, and when the application regains focus. The Cloudflare Worker performs all Notion writes so the Notion token never reaches the browser.

## Data boundaries

Tasks, focus records, timetable data, and user data remain under their existing namespaces. Command Centre reads those boundaries without creating a competing private store. The Notion databases are queryable mirrors for Notion AI and calendar views.

## Command Centre views (October 2026)

Today, Plan, and Focus are Command Centre-specific presentations. The three original widgets stay mounted as same-origin controller frames outside the visible layout. No widget is reloaded when switching views or themes. The frames continue to own synchronization, timetable expansion, task completion and timer credit. Standalone root URLs remain independently usable in Notion.

- Today: Must/Should/Could groups, quick capture, the existing daily-goal calculation, agenda and compact timer dock.
- Plan: dated three-day calendar, unscheduled tasks, explicit click or drag-to-schedule, collision validation and one-occurrence edits. Capacity merges overlapping intervals and labels the displayed day.
- Focus: the existing Clock study-session timer, a selected To-Do task, real task subtasks, next commitment and optional break/flow controls. No fabricated session steps.
- `TodoUIBridge.command` is an application-local adapter to the existing private task controller; it preserves all unrelated task fields and existing SyncEngine contracts.
- `clock/commandTask` stores only the selected task ID under the existing clock namespace. Subtasks remain in the existing task `subs` array.
- Existing `?panel=todo|clock|timetable` links select Today, Focus, or Plan. Settings exposes original widget links and Lock.
- The PWA caches public shell assets only. Worker responses, widget frames and credentials are never cached by its service worker.

Visual and interaction checks: `node tools/test-command-centre.cjs` (Playwright and a local HTTP server), `node --test apps/assistant/domain.test.mjs`, and `pnpm check`.

## Plan ranges and reading estimates

Plan offers 1-day, 3-day and Monday-first week views. Navigation moves by the chosen range. The footer describes the displayed calendar window (9–5 by default); it is not a daily work cap. Scheduled events outside it expand the window.

Command Centre and standalone To-Do share `reading-estimates.js` and the existing task writer. Reading titles such as “Read pages 15–30” count endpoints inclusively (16 pages). The editor accepts a page count or range, phase and pace. First pass starts at 6 min/page, based on [Cornell Law academic support](https://www.lawschool.cornell.edu/life-at-cornell-law/academic-support/); analysis at 9 and review at 3 are editable planning defaults, not research averages. Readings above 90 minutes offer two optional session steps. No tasks or calendar blocks are created by the suggestion. Manual durations and existing time bands remain authoritative until Use estimate is selected.

The task sheet shows the title, priority and date first. Reading tasks show one clickable duration and a compact page/style summary. Adjust reading reveals page and style fields; Reading pace reveals the custom pace. The separate duration field appears while changing a reading duration or for a non-reading task. Notes and session steps are collapsed unless populated.

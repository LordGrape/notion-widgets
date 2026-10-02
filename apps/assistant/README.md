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

Command Centre and standalone To-Do share `reading-estimates.js` and the existing task writer. Reading titles such as “Read pages 15–30” count endpoints inclusively (16 pages). The editor accepts a page count or range and one adjustable reading pace. New tasks use a 6 min/page planning default, not a measured university average. [Queen’s University SASS reading guidance](https://sass.queensu.ca/resources/online/reading) explains that reading time varies with the material and purpose; it does not prescribe this pace. Readings above 90 minutes offer two optional session steps. No tasks or calendar blocks are created by the suggestion. Manual durations and existing time bands remain authoritative until Use estimate is selected.

The task sheet shows the title, priority and date first. Reading tasks show one clickable duration and a compact page summary. Adjust reading reveals page fields; Reading pace reveals the custom pace. The separate duration field appears while changing a reading duration or for a non-reading task. Notes and session steps are collapsed unless populated.


One-off personal calendar reminders (including calendar-linked entries such as appointments) stay in the agenda and do not count as work commitments or become focus tasks. Focus selects an open task for today; future calendar entries are never used as a fallback task.

## Smart task capture

Today quick capture and the New Task dialog use the standalone To-Do parser. “Must do”, “Should do” and “Could do” set priority and are removed from the saved title. Class anchors such as “after LAW 195”, “after Torts” and “after class today” resolve against upcoming timetable occurrences. A duration schedules the task from the class end; reading page ranges supply an estimate when no duration is stated, otherwise the preview shows the 60-minute default. Multiple matching classes and overlapping blocks are surfaced before saving. The dialog updates priority, date and duration as you type; manual field choices remain authoritative. Its details button carries the current quick-add draft. New-task notes, reading settings and session steps remain intact.

Today quick capture uses `TodoNaturalAdd.plan` for its live preview and `TodoNaturalAdd.capture` in the existing To-Do controller for submission. Both surfaces share priority, date, duration, time range, deadline, task dependency, class anchor and multi-task parsing, plus the same reading page estimates. Pasted lines and semicolon-separated entries keep the existing date carry behaviour. Invalid or conflicting entries retain the input and show the parser message. Task and timetable writes remain owned by the existing controller.

Smart planning can suggest an open 15-minute-aligned slot for a dated task with an estimate. “By Friday” is treated as a deadline; it searches earlier available days and shows an explicit Schedule button. “Before Torts” or “before class” searches for a slot that ends before the matching class. Quick Add keeps the task flexible until that button is selected. Readings over 90 minutes can be created as two separate, inclusive page-range task sessions. Recurrence phrases currently include every day, every weekday, weekdays, named weekdays, and every other day/week; completing one occurrence creates only the next occurrence. Deleting that next occurrence ends the series.

When a focus session has exactly one selected task, Clock stores its task ID and focused seconds in the existing `clock/focus_sessions` key (capped at 300 entries). After three completed, task-linked readings with at least three focused minutes each, the median observed minutes per page becomes the default estimate. Manually entered reading paces and durations stay authoritative. No task text is sent to an external parser or model.

## Broadcast, the partner

Broadcast is the approved optional Command Centre character: a sinister-but-charming CRT television-headed law partner with the established purple screen, expressive eyes and grin, and restrained haunted-broadcast glitches. His redesigned body is strong and muscular, with broad shoulders, a tailored charcoal executive suit, thicker arms, substantial gloves and shoes. Motion combines rubber-hose executive gestures with occasional TV-static glitches. Spoken audio is optional, wordless static-like garble; every line is shown as readable text. The partner visibility setting hides the entire character and interaction surface; the sound setting remains separate. Keep interface symbols within the shared WidgetIcons duotone icon set and never use emoji as UI icons. See the Broadcast rule in the repository `AGENTS.md` before changing his design.

Broadcast currently lives beside the Focus workflow and reacts to starting or pausing focus, finishing a task, and entering or extending a break. `user/commandPartnerVisible` defaults on; `user/commandPartnerSound` defaults off. Both settings use the existing To-Do SyncEngine user namespace. Interface sound effects keep their separate existing preference.

## Calendar block controls

Right-click a block in Today or Plan for View details, Edit time, Remove this week only (a single recurring occurrence), and Remove from schedule (the whole block). Shift+F10 / the context-menu key and a touch long press open the same menu; tapping a block also exposes its actions. Edits use the existing sourceDate overrides, retaining other weeks and days. Removal unschedules user-authored linked tasks and removes only open timetable-generated occurrences. Completed task history stays intact. Undo restores only changed records and rejects a restore if those records have since changed. Save pulls current shared state first and continues through the existing timetable and To-Do SyncEngine namespaces.

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

Broadcast lives on the Docket (not the Focus tab) and reacts to starting or pausing focus, finishing a task, and entering or extending a break. `user/commandPartnerVisible` defaults on; `user/commandPartnerSound` defaults on (an explicit off is respected). Both settings use the existing To-Do SyncEngine user namespace. Interface sound effects keep their separate existing preference.

## Calendar block controls

Right-click a block in Today or Plan for View details, Edit time, Remove this week only (a single recurring occurrence), and Remove from schedule (the whole block). Shift+F10 / the context-menu key and a touch long press open the same menu; tapping a block also exposes its actions. Edits use the existing sourceDate overrides, retaining other weeks and days. Removal unschedules user-authored linked tasks and removes only open timetable-generated occurrences. Completed task history stays intact. Undo restores only changed records and rejects a restore if those records have since changed. Save pulls current shared state first and continues through the existing timetable and To-Do SyncEngine namespaces.

## Weekly docket

Docket is a fourth Command Centre view (`?panel=docket`) that totals billable hours for a Monday-first week against a weekly target (default 35, stored in `todo/weeklyHours`). It computes everything from existing data and owns no hours store.

- Class: timetable blocks with `category: "class"`, counted as they are attended.
- Reading, Study, Writing: focus-timer time from `clock/focus_sessions`, typed from the task. Admin is tracked but not billable.
- Types come from `hours.mjs` (`classifyText`) using the task wording ("read", "pp.", "review", "outline", "memo", "draft"). A task's Type field (`task.kind`) overrides the parser; `TodoUIBridge.command.update` saves it.
- Line items and the total use docket units (tenths of an hour). Under three minutes bills nothing.
- Log time appends a `manual: true` session (with `note` and `kind`) to `clock/focus_sessions`, keeping its 300-entry cap. Completing an untimed billable task offers a Log time action. Manual entries can be removed with Undo.
- The pace marker compares billable hours with a linear share of the target for the elapsed week.
- Broadcast lives on the Docket, not the Focus tab. He comments on pace; while a focus session runs he steps away and leaves a one-line billing status. The dock on Today shows this week's billable hours and opens the Docket.

Pure logic and tests: `hours.mjs`, `hours.test.mjs`.

## Plan my day

The Your day panel offers an opt-in Plan my day preview. `autofit.mjs` (pure, tested) fills the open stretches between 09:00 and 21:00 with today's unscheduled tasks: Must first, then Should, then Could; overdue work leads within a tier; tasks without an estimate use 30 minutes and are marked estimated; a 10-minute buffer follows each block; nothing is placed in the past. Tomorrow can be planned the same way. The dialog shows the day as a strip, lets the user untick tasks, and lists anything that does not fit. Confirming creates one-off timetable blocks and updates the tasks through the existing controller in one batch, with a single Undo.

## Repeat range

Recurring timetable blocks can start and end on chosen dates (`startDate`, `endDate`; absent means ongoing). The weekly block editor in the Timetable has a Runs control (Ongoing, 4, 8 or 12 weeks, or pick dates) with a plain-language summary, and the Existing list shows each block's range. In Command Centre, a recurring block's details dialog has Repeat range with the same options and an Undo.

## Typography

The interface uses the system face on Apple devices (San Francisco) and Inter elsewhere, both for text and for headings, with tabular figures for numbers. Inter loads from Google Fonts with system fallbacks, so the app stays usable offline.

## Consistency

The Docket opens with a streak and a 20-week heat map of billable hours per day (class, reading, study and writing; Admin excluded). Cell colour scales against a day's share of the weekly target (target ÷ 5); a full-colour cell means the day reached that share. A day is active at 2 billable hours. Saturdays and Sundays never break a streak, but an active weekend day counts. Today never breaks a streak before it has ended. Milestones are 3, 7, 14, 21, 30, 60 and 100 days. Everything is calculated from the same sources as the weekly docket; nothing extra is stored. Focus history is limited by the Clock's 300-session cap, and class history comes from the timetable's current blocks.

## Ending a session and splitting a task

End session (Focus tab and the Today dock) stops the timer, which already credits the focused time to the selected task and to the weekly docket. A "Session saved" sheet then shows what was recorded and asks what happens to the task: keep it open, mark it complete, or split off the rest. A page range splits at the last page read (suggested from time spent), for example pp. 78–98 becomes a finished pp. 78–88 and a new pp. 89–98 task; other tasks split by time left and the remainder is marked "(continued)". The same Split sheet is available from a task's edit dialog. Both halves keep the priority, date and type, and one Undo restores the original. Pure logic and tests: `split.mjs`, `split.test.mjs`.

## Broadcast in 3D

On the Docket, Broadcast is a 3D model (`broadcast.glb`, built from `tools/broadcast/`) animated with three.js, which loads from jsDelivr through the import map in `index.html`. `broadcast3d.mjs` draws his face live on the screen: smug when ahead, approving on pace, stern when behind, panicking (with the slump clip) when far behind or behind on Sunday, and celebrating once when the weekly target is met. He talks when you start, pause or end a session, cheers when you finish a task, and talks when tapped. The 2D figure remains the fallback when WebGL, the CDN or the model is unavailable, offline, or when reduced motion is requested; the partner visibility and sound settings apply to both. The loading screen uses `broadcast-run.webp`, a 16-frame run cycle.

## Broadcast's voice

`partner.mjs` (pure, tested) gives Broadcast the voice of an intense Big Law partner (billables, clients, deadlines, partner track; pressure on the work, never on the person) and a line library keyed to the moment: the week's mood (happy, smug, approving, stern, panicking), late nights (he tells you to sleep), an empty docket, weekday mornings, Monday mornings, an evening streak at risk on a weekday, and streak milestones (3, 7, 14, 21, 30, 60, 100 days). Lines are varied by date and do not repeat within a day while alternatives remain; tapping him gives the next line. Under each line is one next step: focus on the current task, Plan my day (Monday mornings, or when nothing is selected), or Log time. A newly reached milestone makes him cheer once (stored in `user/partnerMilestone`, reset when the streak breaks). On Monday and Tuesday the Docket opens with last week's performance review (verdict, hours, notes on the work mix and streak), dismissed per week with "Noted" (`user/partnerReview`).

## Broadcast's voice (sound)

`voice.mjs` gives him a deep, wordless radio-host murmur: each line becomes a plan of syllables whose rhythm, pitch and vowel colour follow his mood (lower and slower when stern, higher and quicker when panicking, falling at the end of a phrase). The sound is a sawtooth through three dark vowel formants, gentle saturation and a warm radio band. The same plan drives his 3D mouth, so voice and mouth always match. He speaks when tapped and on focus events; the partner sound setting controls the audio (browsers keep audio locked until the first tap), and hiding the partner silences him.

## Speech bubble

His line sits in a dark speech bubble that behaves like a TV signal: it tunes in with a burst of static and an RGB-split flicker, types the line at the pace of his voice (same syllable plan), then keeps faint animated static, scanlines and an occasional glitch. A hidden copy reserves the bubble's size so nothing jumps while typing, screen readers receive the whole line at once, and reduced motion shows the text immediately without effects.

## Docket research pass

- One line per matter per day: focus sessions on the same task and day merge into one docket entry (with a session count), as on a real docket.
- The heat map shows the weeks you have actually used (six to twenty) and widens over time.
- Goal gradient: the dial has quarter ticks, and the card shows hours to beat last week and to reach the target; Broadcast has an "almost there" voice from 80%.
- Self-comparison: last week and the four-week average sit under the dial.
- Recess day: the first missed weekday of each week keeps a running streak alive (marked on the map), so one bad day is never all-or-nothing.
- Implementation intention: in the evening, if nothing is booked for tomorrow, Broadcast asks for tomorrow's first block; the same booking is offered from Wrap up day.
- Practice is its own billable type (practice questions, past exams, problem sets, flashcards). The Docket nudges toward practice being at least a fifth of independent time.

## Evidence pass (research since 2020)

- Broken streaks demotivate out of proportion (Silverman and Barasch, 2023): with no current streak the card shows a fresh start ("Day 1") and active days this month instead of a large zero.
- Rewarding a return after a miss was the strongest intervention in the 2021 exercise megastudy (Milkman et al.): the first active day after a gap triggers a comeback line and a cheer once (`user/partnerComeback`).
- If-then plans with rehearsal work best (Sheeran et al., 2024): tomorrow's first block can be anchored to the end of a scheduled event, the plan sentence is saved (`user/partnerPlan`), and Broadcast repeats it the next morning until the task is done.
- Wellbeing guardrails: an intensity setting (Intense or Steady, `user/partnerIntensity`) softens the high-pressure moments; a weekly ceiling (default 55 h, `todo/weeklyCeiling`) switches him to recovery lines; entries ending after midnight are flagged and called out, because sleep under six hours predicts lower grades (Creswell et al., 2023).

## Plan calendar: timed tasks, nudge and quick create

`calendar-extras.mjs` (pure, tested) backs three Plan and Today calendar behaviours.

- Timed tasks without a block: a task with a `scheduledStart` but no timetable block (for example one timed in the To-Do widget) is drawn as a dashed ghost at that time. Clicking it opens Schedule, and saving turns it into a real one-off block. Ghosts are display-only and never written to the timetable.
- Planning nudge: from 16:00, if the next day (Monday from Friday or Saturday) has nothing on the calendar, Plan shows a banner with a Plan button (opens Plan my day for that day) and a dismiss control. The dismissal is stored per day in `user/planNudge`.
- Create on the calendar: double-click or right-click an empty spot in Plan or Today to add a task at that time (snapped to 15 minutes). It creates the task and a one-off timetable block together and rejects overlaps.
- Move back to Unscheduled: in Plan, drag a task block (or a ghost) onto the Unscheduled tray. A one-off block is removed and its task becomes unscheduled again (the same action as Remove from schedule, with Undo); a ghost simply loses its time. Class and recurring blocks are not draggable.

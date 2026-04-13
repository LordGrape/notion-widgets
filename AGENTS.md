# notion-widgets
Single-file HTML widget suite embedded in Notion via /embed blocks.
Live URL: https://notion-widgets-93r.pages.dev/

## Architecture
- All widgets load `core.js` as a shared dependency.
- `core.js` provides: SyncEngine, initBackground, playChime, launchConfetti, GSAP loader.
- All persistent state uses `SyncEngine.get/set` — never raw localStorage.
- Cloudflare Worker source lives in `worker/`. Deploy: `npx wrangler deploy --config worker/wrangler.toml`
- **Study Engine is modular.** Source lives in `studyengine/js/*.js` and `studyengine/css/*.css`.
  Build with `studyengine/build.ps1` (Windows) or `studyengine/build.sh` (bash).
  Output: `dist/studyengine.html`. The root-level `studyengine.html` is a LEGACY FILE — do not edit it.
- All other widgets (clock, timetable, quotes, horizon) remain single `.html` files with no build step.

## CSS Rules
- Semantic token system: `--surface-0` through `--surface-3`, `--border-subtle/default/accent`,
  `--text-primary/secondary/tertiary`, `--accent-primary/secondary`.
- Legacy aliases (`--bg`, `--card-bg`, `--card-border`, `--accent`, `--accent-rgb`) still resolve but do not introduce new uses.
- Purple palette: primary #8b5cf6 (light) / #a78bfa (dark).
- Glassmorphism: `backdrop-filter: blur(20px) saturate(1.4)`.
- Inter font, weight 300-700.
- Do NOT hardcode colours or invent new variable names.
- Test both light and dark mode (`prefers-color-scheme: light` and `dark`).

## File Map
- `core.js` — shared engine (sync, audio, canvas, confetti)
- `clock.html` — clock + stopwatch + timer (SyncEngine: `user`, `clock`)
- `timetable.html` — schedule widget
- `quotes.html` — daily quote (stateless)
- `horizon.html` — dragon companion + XP + achievements (SyncEngine: `dragon`, `horizon`)
- `studyengine/` → `dist/studyengine.html` — FSRS retrieval practice (SyncEngine: `studyengine`, pushes to `dragon`)

## Study Engine Module Map
- `studyengine/js/fsrs.js` — FSRS-6 algorithm (SACRED — do not touch)
- `studyengine/js/state.js` — loadState, saveState, migrations, defaults
- `studyengine/js/session.js` — session queue, renderCurrentItem, rateCurrent
- `studyengine/js/tutor.js` — AI tutor dialogue, Socratic flow, Don't Know, Ask Tutor
- `studyengine/js/cards.js` — card CRUD, import/export, archive, delete
- `studyengine/js/courses.js` — course CRUD, modules, cram state
- `studyengine/js/dashboard.js` — dashboard render, charts, heatmap
- `studyengine/js/sidebar.js` — sidebar tree, breadcrumb, context views
- `studyengine/js/dragon.js` — dragon stage detection, XP bar, evolution ceremony
- `studyengine/js/utils.js` — uid, esc, tierLabel, showView, toast, formatters
- `studyengine/css/` — base, dashboard, session, sidebar, modals (5 files)

## Fragile Zones (do not touch without explicit instruction)
- `scheduleFSRS()` and FSRS weights in `studyengine/js/fsrs.js`
- `callTutor()` and the AI feedback pipeline in `studyengine/js/tutor.js`
- Worker routes `/studyengine/grade` and `/studyengine/tutor` (grading prompt structure)
- `SyncEngine.get/set/init/flush` signatures and timestamp-based merge strategy in `core.js`
- Tier progression logic (6-tier system) in `studyengine/js/session.js`
- XP-to-FSRS isolation — XP must never influence FSRS scheduling decisions

## Commands
- **Study Engine build:** `./studyengine/build.sh` (bash) or `./studyengine/build.ps1` (PowerShell)
- **Testing:** Open `dist/studyengine.html` or other `.html` files directly in browser
- **Worker deploy:** `npx wrangler deploy --config worker/wrangler.toml`
- **Git:** `git add . && git commit -m "description" && git push origin main`

## Git Workflow
- Default to pushing directly to `origin/main` after committing.
- Only use a feature branch or PR flow when the user explicitly asks for one.

## Done When
- Works in both light and dark mode.
- No console errors in browser DevTools.
- SyncEngine round-trip works if state changed.
- Study Engine: `dist/studyengine.html` rebuilt after any module changes.
- Existing features still function.
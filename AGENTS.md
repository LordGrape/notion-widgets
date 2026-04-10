# notion-widgets

Single-file HTML widget suite embedded in Notion via /embed blocks.
Live URL: https://notion-widgets-93r.pages.dev/

## Architecture
- Each widget is one `.html` file that loads `core.js` as a shared dependency.
- `core.js` provides: SyncEngine, initBackground, playChime, launchConfetti, GSAP loader.
- All persistent state uses `SyncEngine.get/set` — never raw localStorage.
- Cloudflare Worker source lives in `worker/`.

## CSS Rules
- Use existing variables: `--bg`, `--card-bg`, `--card-border`, `--accent`, `--accent-rgb`.
- Purple palette: primary #8b5cf6 (light) / #a78bfa (dark).
- Glassmorphism: `backdrop-filter: blur(20px) saturate(1.4)`.
- Inter font, weight 300-700.
- Do NOT hardcode colours or introduce new variable names.

## File Map
- core.js — shared engine (sync, audio, canvas, confetti)
- clock.html — clock + stopwatch + timer
- timetable.html — schedule widget
- quotes.html — daily quote (stateless)
- horizon.html — dragon companion + XP + achievements
- studyengine.html — FSRS retrieval practice (~18k lines)

## Fragile Zones (do not touch without explicit instruction)
- FSRS scheduling algorithm in studyengine.html
- callTutor() and AI feedback pipeline in studyengine.html
- SyncEngine core logic in core.js

## Commands
- No build step. Open .html files in browser for testing.
- Worker deploy: `npx wrangler deploy --config worker/wrangler.toml`
- Git: `git add . && git commit -m "description" && git push`

## Git Workflow
- Default to pushing directly to `origin/main` after committing.
- Only use a feature branch or PR flow when the user explicitly asks for one.

## Done When
- Works in both light and dark mode.
- No console errors in browser DevTools.
- SyncEngine round-trip works if state changed.
- Existing features still function.

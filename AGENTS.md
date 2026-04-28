# notion-widgets

Single-file widget suite embedded in Notion via `/embed` blocks.
Live URL: https://notion-widgets-93r.pages.dev/

## Source and Context
- GitHub is the source of truth. Fetch current source from `https://raw.githubusercontent.com/LordGrape/notion-widgets/main/<filename>` before editing tracked files.
- Spec pages describe intent, not current code.
- Never edit `dist/studyengine.html` directly. It is a build artifact.

## Architecture
- All widgets load `core.js` as a shared dependency.
- `core.js` provides SyncEngine, initBackground, playChime, launchConfetti, and GSAP loading.
- All persistent state uses `SyncEngine.get/set`. Never use raw localStorage for app state unless the existing code already defines that storage boundary.
- Cloudflare Worker source lives in `worker/`. Deploy with `npx wrangler deploy --config worker/wrangler.toml`.
- All widgets except Study Engine may remain standalone `.html` files.

## Study Engine Architecture
- Study Engine is a Vite + TypeScript application whose entry shell is `studyengine/studyengine.html`.
- `studyengine/studyengine.html` is not a dumping ground. Keep it focused on app shell markup, global tokens, sacred integration points, and minimal mount containers.
- New feature UI should prefer typed modules under `studyengine/src/<feature>/`.
- Pure logic, view models, render helpers, state transitions, DOM event wiring, and feature-local CSS may live outside the monolith.
- Feature CSS may live beside the feature and be imported through Vite, as long as `vite-plugin-singlefile` still inlines the final build.
- Keep large new UI surfaces out of `studyengine.html` unless they are truly app-shell concerns or extraction would make the integration riskier than the feature.
- Do not introduce a new frontend framework without explicit approval. The default stack is Vite, TypeScript, vanilla DOM, CSS, and existing local helpers.
- Build output is `dist/studyengine.html`; never edit it directly.

## Sacred Constraints
- Do not modify `scheduleFSRS` or FSRS scheduling parameters without explicit approval.
- Do not change the SyncEngine contract: `get`/`set`/`init`/`flush` signatures and timestamp merge behaviour.
- Do not change grading prompt structure in `worker/src/routes/tutor.ts` or `/studyengine/grade` without explicit approval.
- Do not change tier progression logic, the 6-tier pedagogical backbone, without explicit approval.
- XP must never influence FSRS scheduling.

## Code Rules
- Never rename existing public functions without updating all callers.
- Preserve existing functionality unless explicitly told to remove it.
- Do not remove or rewrite code that was not mentioned in the task.
- Pure logic belongs in typed `.ts` modules under `studyengine/src/`.
- Avoid `any`. Prefer explicit interfaces and narrow types.
- For Study Engine visual work, prefer feature-local CSS and typed render helpers; keep monolith edits to mount points and integration glue.
- Return diffs or specific function replacements when asked. Do not provide full file rewrites unless the file is intentionally being replaced.

## Visual and Testing
- Every visual change must work in both embed mode (`.topbar`, Notion iframe) and standalone mode (`body.standalone`, `.main-topbar` + sidebar).
- Test both `prefers-color-scheme: light` and `dark`.
- Use semantic tokens: `--surface-0` through `--surface-3`, `--border-subtle/default/accent`, `--text-primary/secondary/tertiary`, and `--accent-primary/secondary`.
- Do not hardcode colours. Legacy aliases such as `--bg`, `--card-bg`, `--card-border`, `--accent`, and `--accent-rgb` still exist, but do not introduce new uses unless compatibility requires it.
- Use GSAP for timeline-based or interactive animations. Use CSS `@keyframes` only for simple looping ambient effects such as shimmer or breathe.

## Study Engine Module Map
- `studyengine/studyengine.html` - Vite entry shell and legacy integration glue.
- `studyengine/src/learn-flow.ts` - Learn session state transitions and telemetry.
- `studyengine/src/learn-mode.ts` - Learn plan and turn client logic.
- `studyengine/src/learn-ui/` - Learn-specific render helpers, DOM helpers, and feature CSS.
- `studyengine/src/session-flow.ts` - review session queue, rating flow, Learn handoff.
- `studyengine/src/sub-decks.ts` - sub-deck tree and card scope helpers.
- `studyengine/src/settings.ts` - settings module setup.
- `studyengine/src/ingest/` - ingest orchestration and parsers.
- `studyengine/src/decks/` - built-in deck pipelines and fixtures.
- `worker/src/routes/` - Worker API routes.

## Commands
- Study Engine dev server: `cd studyengine && npm exec vite -- --host 127.0.0.1 --port 5173`
- Study Engine build: `cd studyengine && npm run build`
- Study Engine typecheck: `cd studyengine && npm run typecheck`
- Study Engine tests: `cd studyengine && npm run test`
- Worker deploy: `npx wrangler deploy --config worker/wrangler.toml`

## Git Workflow
- Commit messages use a short imperative description of what changed.
- Default to pushing directly to `origin/main` after committing unless the user asks for a branch or PR.
- Do not revert user changes you did not make.

## Language and Style
- Use Canadian English in user-facing output: British-style `-our`, `-re`, `-ce`; American-style `-ize`, `-yze`.
- Be explicit when unsure. Do not guess at implementation details that can be checked locally.

## Done When
- Relevant typecheck/tests pass, or any remaining failure is clearly identified as unrelated.
- Visual changes are checked in embed and standalone layouts where practical.
- Light and dark mode are considered.
- No console errors are introduced.
- SyncEngine round-trip still works if persistent state changed.
- `dist/studyengine.html` remains untouched unless the user explicitly asks for a build artifact update.

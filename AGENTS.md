# Notion Widgets: agent guide

## Mission
Build one coherent personal execution system for planning, time, study, and training inside and alongside Notion. Widgets remain independently embeddable, but share a restrained purple visual language, stable synchronization boundaries, and dependable workflows. Prefer clarity and reliability over novelty.

## Start here
1. Read this file, then the nearest application README and nested `AGENTS.md`.
2. Inspect current source and recent commits before planning. GitHub code is authoritative; documentation records durable intent and boundaries.
3. Preserve production URLs, SyncEngine contracts, and user data unless the task explicitly changes them.
4. Make the smallest coherent change. Run the narrowest relevant checks, then broader verification when warranted.

## Repository map
- `apps/`: application boundaries, local documentation, and gradually consolidated source.
- `packages/`: shared code with at least two real consumers. Do not extract code here speculatively.
- `studyengine/`: Vite and strict TypeScript Study Engine source.
- `worker/`: Cloudflare Worker, protected integrations, and secrets boundary.
- `tools/`: active build and verification scripts, not a historical patch archive.
- Root HTML files: stable deployed entry points. Some remain source during migration; `athlete.html` and `dist/studyengine.html` are generated.

## Product boundaries
- `core.js` owns shared design tokens, accessibility helpers, animation services, and SyncEngine.
- Persistent state goes through `SyncEngine.get/set`. Do not add raw `localStorage` state outside an existing documented compatibility boundary.
- Static files contain no credentials or private data. Protected Notion and network operations belong in `worker/`.
- Keep widgets independently embeddable. A command-centre surface may compose existing state but must not create a competing source of truth.
- Preserve the established minimal purple glass interface. Improve function, settings, responsiveness, and smoothness without redesigning or adding clutter unless explicitly requested.

## Protected decisions
Do not change without explicit approval:
- `scheduleFSRS`, Free Spaced Repetition Scheduler parameters, or the six-tier Study Engine progression.
- SyncEngine public methods or timestamp merge strategy.
- Worker grading and tutoring prompt contracts.
- The separation between experience points and scheduling decisions.
- Existing public embed paths.

## Engineering rules
- Prefer application-local changes. Share code only after a real second consumer exists.
- Preserve public function signatures and update every caller when a contract must change.
- Use strict types in Study Engine code. Do not introduce `any` or a new framework.
- Treat generated outputs as generated. Edit Athlete source files, not `athlete.html`; edit Study Engine source, not `dist/studyengine.html`.
- Remove superseded instructions, abandoned migration notes, and one-off patch lore. Commit history is the change log.
- Use Canadian English in user-facing strings.
- Never commit secrets, passphrases, tokens, plaintext private tasks, or personal academic or military fixtures. Use synthetic public-domain test data.

## Verification
Run checks relevant to the changed files:
- Repository: `pnpm check`
- Athlete: `node tools/build-athlete.mjs --check && node tools/verify-athlete.mjs`
- Study Engine: `cd studyengine && npm run typecheck && npm run test && npm run build`
- Worker: use its package checks; deploy only when the task requires deployment.

For visual changes, verify light and dark themes, reduced motion, mobile, standalone, and Notion embed layouts. For state changes, verify a SyncEngine round trip and backward compatibility. Smoke tests must exercise the changed path, not merely return HTTP 200.

## Git workflow
- Default to direct, focused commits on `main` unless the user requests a branch or pull request.
- Use short imperative commit messages.
- Never revert unrelated user changes.
- Before finishing, inspect the diff, run relevant checks, and report verification that could not be performed.

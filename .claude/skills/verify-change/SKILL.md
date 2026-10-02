---
name: verify-change
description: Pick and run the right checks for whatever changed in this repo (root widgets, core.js, Command Centre, Athlete, Study Engine, Worker), including the visual matrix and SyncEngine round trip. Use before calling any change done, before committing, and when asked to test or verify.
---

# Verify a change

Checks in this repo depend on *which paths changed*. Don't guess and don't stop at "it loads": derive the list, run it, look at the result, and report what you could not verify.

## 1. Plan

From the repository root:

```bash
node .claude/skills/verify-change/scripts/plan-checks.mjs            # working tree + untracked vs HEAD
node .claude/skills/verify-change/scripts/plan-checks.mjs origin/main # everything not yet pushed
```

It prints an ordered command list, manual/visual checks, warnings, and files no automated check covers. The mapping it applies:

| Changed | Runs |
| --- | --- |
| `core.js` | `node --check core.js`, `pnpm check`, `tools/test-command-centre.cjs`, plus two standalone widgets by hand. `dist/core.js` is an older separate copy; leave it alone. |
| Root `*.html` / `*.js` widget | inline `<script>` syntax check, plus every `tools/test-*` / `verify-*` that reads that file (discovered automatically) |
| `widget-icons.js`, `widget-platform.js` | `tools/build-widget-*.mjs` then `--check` (CI gates) |
| `apps/assistant/**`, `packages/**/*.ts` | `pnpm check`, `node --test apps/assistant/*.test.mjs`, `tools/test-command-centre.cjs` |
| `apps/athlete/src/**` | `tools/build-athlete.mjs`, `--check`, `tools/verify-athlete.mjs` |
| `studyengine/**`, `packages/study-evidence/**` | `npm run typecheck && npm test && npm run build && npm run check:build`, then `tools/verify-study-engine.mjs` |
| `worker/**`, `packages/study-evidence/**` | `npx tsc --noEmit`, `npm test`, `wrangler deploy --dry-run` |
| `apps/todo/**` | `npm test && npm run build` in `apps/todo` |

Never select `tools/apply-*`, `add-*`, `hotfix-*`, `restore-*`, `fix-*` or `repair-*`. They are one-off patch installers that rewrite production files, not tests.

## 2. Run

- Install what the plan needs first: `pnpm install` at the root (provides Playwright and TypeScript), `npm ci` inside `studyengine/`, `worker/`, or `apps/todo/` when those run. Playwright browsers: `npx playwright install chromium`.
- Run narrowest first. When one fails, fix the cause and rerun that check before moving on. Don't skip a failing check because it "looks unrelated". Confirm that on a clean `git stash` first, and say so in the report.
- **Baseline before blaming yourself.** The planner marks checks that already fail on `main` with ⚠. For those, and for any other surprising failure, run the same check on the unchanged tree: `git stash -u && <check>; git stash pop`. Same failure on the clean tree means it is pre-existing. Report it as such and don't "fix" the test to make your change pass. A failure only with your change means it is yours.
- Some checks need a real browser or package installs. If they can't run in your environment (blocked registry, no Chrome), say so under "Not verified". Never mark them passed.

## 3. Visual changes

Any change to HTML, CSS, `core.js`, icons, or app UI source needs the matrix: light and dark, reduced motion, 375px phone, desktop, and the Notion embed (iframe).

```bash
node .claude/skills/verify-change/scripts/screenshot-matrix.mjs todo.html clock.html
node .claude/skills/verify-change/scripts/screenshot-matrix.mjs apps/assistant/index.html --query "panel=todo"
```

It serves the repo locally, blocks all outside network, answers Worker calls with `{}`, and writes PNGs plus console errors and horizontal overflow. **Open the PNGs with Read and look at them.** A clean exit only proves nothing threw. Compare against the same pages on `HEAD` (`git stash`, rerun with `--out` to another folder) when judging a regression. Then apply the `ui-review` skill's checklist to what you see.

## 4. State changes: SyncEngine round trip

When the diff touches `SyncEngine.set/setMany/remove`, a namespace, a key, or a stored record's shape, prove it in a browser with Playwright against the local server (the matrix script's server pattern works):

1. Load the widget and perform the action that writes.
2. Read it back with `SyncEngine.get(ns, key)` and check the exact shape.
3. Reload the page and confirm the value survived (localStorage path; the Worker is stubbed).
4. Seed the **previous** record shape (from `git show HEAD:<file>` or the app README's documented shape) before boot and confirm it still loads. Old devices will send that shape.
5. If two widgets share the namespace (see `apps/README.md`, e.g. `clock` and `dragon` are shared), load the other one too and confirm it still reads correctly.

Never change SyncEngine's public methods (`init/get/getAll/set/setMany/remove/onReady/flush/pull/subscribe`) or its timestamp merge. Those are protected decisions in `AGENTS.md`.

## 5. Report

Finish with a short block:

- **Ran:** each command and pass/fail
- **Looked at:** which screenshots or flows
- **Not verified:** anything skipped and why (no browser, needs real Notion, needs a deploy). Never leave this out; write "nothing" only if true.

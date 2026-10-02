---
name: ship
description: Commit and push finished work in this repo safely. Reviews the diff, runs verify-change, writes a focused commit on main, predicts which GitHub workflows the push will start (several DEPLOY to production or COMMIT back to main), and confirms afterwards. Use when asked to commit, push, ship or deploy.
---

# Ship a change

House workflow (from `AGENTS.md`): direct, focused commits on `main` unless the user asks for a branch or PR; short imperative messages; never revert unrelated user changes; report anything unverified.

The hazard specific to this repo: **pushing to `main` starts workflows that deploy or write back.** `deploy-worker.yml` deploys the Worker on any `worker/**` change. `deploy-assets.yml` redeploys FIRAC Reader on `widget-icons.js` or `firac-reader/**`. About twenty `apply-*`, `add-*`, `build-*`, `hotfix-*` and `restore-*` workflows run scripts that rewrite production files and push a bot commit. Some trigger on ordinary files like `action-blocks.js` or `worker/src/routes/fitness-tests.ts`.

## 1. Review the diff

```bash
git status --short
git diff HEAD --stat
git diff HEAD
```

- Stage only files that belong to this task. If unrelated changes are present (the user's own work), leave them unstaged and mention them. Never `git add -A` blindly, and never revert them.
- Generated files must change only with their source: `athlete.html` with `apps/athlete/src/**`, `studyengine/*.html` and `dist/studyengine.html` with `studyengine/app/**`, `firac-reader/site/widget-icons.js` with `widget-icons.js`.
- No secrets, passphrases, Notion IDs, private tasks, or real academic or military data in the diff. `node .claude/skills/ui-review/scripts/scan-ui.mjs` catches common credential shapes in UI files. Read the rest yourself.
- No new one-off installer scripts or `apply-*` workflows. Edit source directly.

## 2. Verify

Run the `verify-change` skill and do not proceed while a check you ran is failing. Keep its "Not verified" list for the final message.

## 3. Predict what the push will start

```bash
node .claude/skills/ship/scripts/triggered-workflows.mjs
```

- **DEPLOYS**: tell the user what goes live, and push only if they asked to ship or deploy. "Commit this" alone is not consent to deploy the Worker. In that case commit locally and ask.
- **COMMITS**: name the workflow. After it finishes, `git pull --rebase` and check its bot commit did not undo or overwrite your change (`git log -3 --stat`, then a diff of the affected file). If an installer clobbers a fix, report it and recommend retiring that installer. Don't fight it with another installer.

## 4. Commit

```bash
git add <the task's files>
git commit -m "Short imperative summary" -m "Optional body: why, and anything a reviewer must know."
```

- Subject is imperative, at most about 60 characters, with no prefix tags (match `git log --oneline`, e.g. "Add Broadcast focus partner to Command Centre").
- One logical change per commit. Split unrelated fixes.
- Append any attribution trailers the session requires.

## 5. Push and confirm

```bash
git pull --rebase origin main
git push origin main
```

If the push is rejected because a bot committed meanwhile, rebase and rerun the checks for the files the bot touched before pushing again. Never `--force` on `main`.

After pushing, when `gh` is available: `gh run list --branch main --limit 8` and `gh run watch <id>` for any DEPLOYS run. Report the result.

## 6. Final message

One or two sentences on what shipped, then:
- **Commit:** short hash and subject
- **Triggered:** the workflows, and whether deploys succeeded (or "not checked")
- **Not verified:** carried over from verify-change

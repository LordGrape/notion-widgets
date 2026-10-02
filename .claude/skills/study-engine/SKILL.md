---
name: study-engine
description: Rules and workflow for changing Study Engine, the evidence-first law-school practice app (studyengine/app/*.ts, packages/study-evidence, the Worker evidence ledger). Use for any Study Engine feature, bug, UI or data change.
---

# Change Study Engine

Study Engine records practice and *attributed* evidence. It deliberately does **not** grade, predict, or gamify. Most bad changes here are well-intentioned features that quietly turn self-reports into "mastery". Read `studyengine/README.md` (boundaries) and `studyengine/docs/adr/0008-evidence-first.md` before planning anything non-trivial.

## Where things live

| Concern | File |
| --- | --- |
| Practice rules, planning, observations, To-do hand-off, legacy import | `studyengine/app/domain.ts` |
| Interface and session flow | `studyengine/app/app.ts`, `app/index.html`, `app/styles.css` |
| HTML escaping and checklist rendering | `studyengine/app/presentation.ts` |
| Persistence, migration, remote reconciliation | `studyengine/app/repository.ts` |
| Types shared with the Worker (validation protocol) | `packages/study-evidence/protocol.ts` |
| Server-side append-only ledger | `worker/src/study-evidence-ledger.ts` |
| Test fixtures (synthetic) | `studyengine/app/test-fixtures.ts` |

**Generated, never edit by hand:** `studyengine/index.html`, `studyengine/studyengine.html`, `dist/studyengine.html`. `tools/build-study-engine.mjs` writes all three from `app/`, and they must stay identical. `studyengine/src/` holds only pinned compatibility data for Worker routes (hashes in `build-policy.json`); don't add code there.

## Product boundaries (from the README and ADR; need explicit approval to change)

- No XP, mastery percentage, score, streak-as-competence, or exam-grade prediction. Six categories (Retrieve, Explain, Apply, Distinguish, Integrate, Perform) are a **taxonomy, not a ladder**. Never auto-promote between them.
- No paid AI API, autonomous grading or tutoring, note scraping, or new integration (Gizmo, external calendars).
- Assessments stay **attributed**: `self`, `ai` (provisional), `instructor`. Never merge them, relabel one as another, or display AI feedback as verified.
- Original responses, assessments and recovery snapshots are **immutable**. A correction appends a new record. Only practice entries and settings are last-edit-wins.
- Pattern summaries need three eligible attempts across two days. Review intervals (1/3/7 days) are editable heuristics; don't present them as fitted forgetting curves. Existing FSRS parameters in shared or Worker contracts are protected.
- Skipping a question leaves it unassessed and doesn't move its review date.
- "Send plan to To-do" stays explicit. Study Engine never writes To-do on load, and task completion is never evidence.
- Writes stay blocked until the protected backend is ready. Offline writes stay labelled local until confirmed.
- Storage: namespace `studyengine`; settings under the `lawSchoolState` anchor; records under independent `evidence.v2.*` keys. Unknown schemas are read-only and exportable, never overwritten.

When a request conflicts with one of these, say which boundary it hits and offer the nearest compliant version instead of building it.

## Code rules

- Strict TypeScript (`strict`, `noUncheckedIndexedAccess`). No `any`, no `as unknown as`, no non-null `!` to silence the checker. Narrow instead. No new framework or runtime dependency.
- Match the existing style: tabs, named exports, pure functions in `domain.ts` that take `now`/`Date` as parameters (so tests can pin time), calendar days in `America/Toronto` through `dayKey` and `shiftDay`. Never derive "today" from `new Date().toISOString()`, which is a UTC date and wrong every evening in Toronto.
- Any user or source text that reaches HTML goes through `escapeHtml` or `checklistHtml`. URLs go through `safeUrl`.
- When a type in `protocol.ts` changes, update the Worker ledger and its tests in the same change. Old records must still validate: add optional fields, never rename or retype existing ones.
- Canadian English in UI strings. Calm, factual copy that names who assessed what.

## Workflow

1. Write or extend the test first in the matching `app/*.test.ts` (Vitest, fixtures from `test-fixtures.ts`). For time, pass fixed dates, as the existing tests do with `NOW`.
2. Implement in `app/` (and `protocol.ts` / Worker if the contract changes).
3. Run:

   ```bash
   cd studyengine && npm run typecheck && npm test && npm run build && npm run check:build
   cd .. && node tools/verify-study-engine.mjs
   ```

   If `protocol.ts` or the ledger changed, also run `cd worker && npx tsc --noEmit && npm test`.
4. UI changes: `node .claude/skills/verify-change/scripts/screenshot-matrix.mjs studyengine/index.html`, then look at the screenshots (raised purple cards and lime accents are this app's established look).
5. Data changes: load a workspace saved by the previous build (`git show HEAD:studyengine/app/test-fixtures.ts` gives the old shapes) and confirm it opens without migration prompts or lost records.

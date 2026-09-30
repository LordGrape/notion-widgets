# Study Engine

An evidence-first practice space. Full notes and assigned sources stay in Notion. Gizmo stays alongside it, without an unverified integration.

## Interface

The tactile practice deck uses raised purple cards, pressable buttons, lime accents, and a focused Try → Compare → Move on loop. Mobile and Notion embeds use the same interface, with automatic light/dark themes and reduced-motion support.

- Notes and help are always summarized before submission; expand Change to edit them. Opening the source marks the attempt open-note.
- The original answer is saved before the checklist appears. Citation markup becomes compact accessible links; saved source text is never rewritten.
- Source status stays visible. Full provenance, the original question/answer, and optional self-check details are disclosures rather than mandatory forms.
- Next question works without an assessment. Skipping leaves the attempt unassessed and does not change its review date or invent feedback.
- No XP, mastery score, autonomous grading, or new integration is introduced.

## First useful session

1. Open `/studyengine/` using the existing shared widget access key.
2. Import a small permitted pack from Notion AI, or add one question.
3. Check the question and checklist against the actual assigned source.
4. Try the question, honestly recording notes and help used.
5. Save the original response before revealing the checklist.
6. Compare with the source, attribute the assessment, and choose the next practice date.

Start with one course and a 20-minute budget. Stop when the selected activities or budget are finished. Evaluate delayed unaided performance and actual time cost before expanding.

Retrieve, Explain, Apply, Distinguish, Integrate, and Perform are practice categories, not an automatic competence ladder.

## Boundaries

- No paid AI API, autonomous legal grading, note scraping, mastery percentage, or examination-grade prediction.
- AI-generated checklists begin unverified. A source link is not proof of correctness.
- Self-assessment, recorded instructor feedback, and provisional external AI feedback remain distinguishable.
- Conditions are self-reported, not independently observed.
- Pattern summaries require three eligible attempts on two days. This is a product safeguard, not a validated mastery threshold.
- Repeated questions do not establish transfer. Different questions do not guarantee comparable difficulty.
- Review intervals of 1, 3, or 7 days are editable heuristics, not fitted forgetting estimates.
- **Send plan to To-do** is explicit. It preserves occurrence IDs, edits, completion, and substeps. It creates widget activities, not Notion calendar items. Completion is not learning evidence.
- Exclude assessed work where AI help is prohibited. Current course rules take precedence.

See [the evidence basis](docs/learning-evidence.md) and [the architecture decision](docs/adr/0008-evidence-first.md).

## Implementation

- Interface: `app/index.html`, `app/styles.css`, `app/app.ts`.
- Practice rules: `app/domain.ts`.
- Private state and migration: `app/repository.ts`.
- Shared frontend/Worker validation: `../packages/study-evidence/protocol.ts`.
- Serialized protected storage: `../worker/src/study-evidence-ledger.ts`.
- Build: `../tools/build-study-engine.mjs`.

Generated routes `/studyengine/index.html`, `/studyengine/studyengine.html`, and `/dist/studyengine.html` stay equivalent. Edit source, not generated entries.

## Data safety and retirement

The shared SyncEngine namespace and timestamp contract remain intact. Settings use the version 2 `lawSchoolState` anchor; records have independent `evidence.v2.*` keys.

A Study Engine-only Durable Object protects original evidence against concurrent whole-namespace saves and old clients. Original responses, assessments, and recovery snapshots are immutable. Corrections add a new record. Practice entries and settings retain last-edit-wins behaviour. Other widget namespaces and shared SDK methods are unchanged.

Writes are blocked until the protected backend is ready. Cloud content is checked separately from the SDK flush. Offline writes in an already-open workspace stay labelled local until confirmed; an offline cold start cannot authenticate.

Legacy migration requires preview and confirmation. Original state is privately preserved; old ratings do not become learning evidence. Unknown schemas are read-only and exportable. Private backups never go into the public repository; restore adds missing records and refuses conflicts.

The obsolete frontend and pipelines are retired from the active tree. Git history and the pre-rebuild archive branch retain rollback material. Four public French data files remain because existing Worker routes or tests consume them; their hashes are pinned in `build-policy.json`. They are compatibility data, not a second application.

## Checks

```sh
cd studyengine
npm ci
npm run typecheck
npm test
npm run build
npm run check:build
cd ..
node tools/verify-study-engine.mjs
pnpm check
cd worker
npx tsc --noEmit
npm test
npx wrangler deploy --config wrangler.toml --dry-run
```

The build workflow publishes verified generated entries. Pull-request checks run against the final generated commit before merge. Worker deployment uses the existing workflow and repository secrets.
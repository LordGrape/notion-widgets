# Extraction Map (Phase V1)

Recorded 2026-08-18 after direct source reads. Supersedes the grounding
table on the Phase V1 prompt page where they disagree.

## Corrected locations

| Concern | True location | Status |
|---|---|---|
| `scheduleFsrs` (FSRS-6) | Defined in `studyengine.html` (monolith); injected into modules via the `__studyEngineSessionFlow` bridge. `globals.d.ts` declares the global signature. | V1b (sacred) |
| `computeXP` | Defined in the monolith; injected via the same bridge. `session-flow.ts` only declares it on the `SessionFlowBridge` interface and calls `bridge.computeXP(...)`. | V1b |
| `TIER_PROFILES` | Monolith-resident (confirmed by elimination: GitHub code search cannot index the 1.36 MB file, and no src module defines it). | V1b |
| `deriveLifecycleStage`, `setLifecycleStage`, `applyLearnStatusMigration` | Were in `learn-mode.ts`. Moved to `src/domain/lifecycle.ts` in V1a; `learn-mode.ts` re-exports them so import sites and the `__studyEngineLearnMode` bridge resolve unchanged. | Done (V1a) |

## V2a note (2026-08-18)

`learn-mode.ts` was split into `src/application/learn/` (types, constants,
fingerprints, grounding, coverage) with `learn-mode.ts` retained as the
facade holding plan generation, streaming, and the bridge registrations,
re-exporting everything it previously exported. This deviated from the
ADR-0003 split order (session-flow.ts first) because `session-flow.ts`
(58 KB) truncates when read through chat-based tooling, making a faithful
full-file rewrite impossible from chat. `learn-mode.ts` (45 KB) was fully
readable. `session-flow.ts`, `settings.ts`, and `learn-flow.ts` move via
the local runbook below unless a complete read becomes possible.

## Why V1b cannot run from chat-based tooling

The monolith can only be edited by full-file replacement through the GitHub
API. At 1.36 MB it exceeds what can safely be read into or written from a
chat context, and the build sandbox has no network access. V1b therefore
requires a local checkout (or a network-enabled environment) so the file
can be grepped, cut, and rebuilt with the test suite running locally.

## V1b runbook (first local session)

1. `git checkout main && git pull && git checkout -b v1b-monolith-core`
2. Locate definitions (exact line anchors):
   - `grep -n "function scheduleFsrs" studyengine/studyengine.html`
   - `grep -n "TIER_PROFILES" studyengine/studyengine.html`
   - `grep -n "function computeXP" studyengine/studyengine.html`
   - `grep -n "__studyEngineSessionFlow" studyengine/studyengine.html` to find
     where the monolith registers these onto the bridge.
3. Cut each block verbatim into `src/domain/fsrs.ts`, `src/domain/tiers.ts`,
   and `src/domain/xp.ts`. Keep the bridge registrations working: either the
   new domain modules register themselves, or the monolith imports and
   registers them. Do not change any signature.
4. Add the imports to the monolith's module script section.
5. `npm run build && npm run typecheck && npm test` locally. Only then push.
6. Extend `MOVED` in `scripts/verify-domain-extraction.mjs` with the new
   identifiers, and confirm the monolith byte count dropped before merging.

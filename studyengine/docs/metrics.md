# V2 Metrics

Baseline measured 2026-08-18 from file sizes on main. Updated at each
phase gate.

## Baseline

| Metric | Value |
|---|---|
| studyengine.html | 1,357,736 bytes (about 21K lines) |
| studyengine/index.html | 53,497 bytes (resolved 2026-08-18: legacy duplicate app shell — full pre-Vite standalone UI copy with onboarding, dashboard, session surfaces, settings, SyncEngine init, and Mermaid config; not the Vite build input; referenced by no code, only docs; deletion candidate pending owner approval) |
| Largest client module | src/session-flow.ts, 58,314 bytes |
| Other oversized client modules | learn-mode.ts 45,093; settings.ts 42,200; learn-flow.ts 36,829; charts.ts 28,184 |
| Largest worker file | worker/src/routes/learn-plan.ts, 78,826 bytes |
| Other oversized worker files | tutor.ts 47,529; grade.ts 32,776; parse-syllabus.ts 19,147 |
| Tests | colocated *.test.ts plus test/ scope tests |
| CI | none before Phase V0 |

## Targets after V2

| Metric | Target |
|---|---|
| studyengine.html | strictly smaller each phase |
| Largest client file | 25 KB or less |
| Largest worker file | 25 KB or less |
| SyncEngine imports outside infrastructure/persistence | 0 |
| Tests on every push | yes |

## Phase log

| Phase | Date | Monolith bytes | Largest client file | Largest worker file | Notes |
|---|---|---|---|---|---|
| V0 (baseline) | 2026-08-18 | 1,357,736 | 58,314 | 78,826 | CI + ADRs land |
| V1a | 2026-08-18 | 1,357,736 | 58,314 | 78,826 | src/domain/lifecycle.ts established (moved from learn-mode.ts); verification gate added. Monolith untouched: FSRS, tiers, and XP are monolith-resident and bridge-injected, so they moved to the V1b runbook (docs/extraction-map.md). |
| V2a | 2026-08-18 | 1,357,736 | 58,314 | 78,826 | learn-mode.ts split into application/learn/{types,constants,fingerprints,grounding,coverage}.ts; facade re-exports preserve every import site and bridge. Order deviation from ADR-0003 (documented): session-flow.ts truncates when read through chat tooling, so the fully readable learn-mode.ts went first. |
| V1a hotfix | 2026-08-18 | 1,357,736 | 58,314 | 78,826 | CI repair. V1a and V2a merged with the studyengine job red: tsc exit 2 on TS2352 x2 in src/domain/lifecycle.test.ts lines 80-81 (StudyItem to Record<string,unknown> cast on delete operands). The verify gate and npm test had never actually run in CI; this branch is their first real execution. Root-caused via PR check-run annotations. |
| gate rescope | 2026-08-18 | 1,357,736 | 58,314 | 78,826 | The gate's first run failed on the frozen monolith's expected pre-extraction duplicates. Moved-identifier scan rescoped to src/ (monolith contract owned by bridge registrations until V1b); failures now emit ::error annotations naming the culprit. |
| V2b-i | 2026-08-18 | 1,357,736 | 58,314 | 78,826 | settings.ts module-level extraction: types to application/settings/types.ts, curated-deck catalog + getFrenchCoreImportSnapshot to application/settings/curation.ts, getActiveModeValue/isDevModeEnabled to ui/views/settings/, withTimeout to shared/, applySettingsFromDom to ui/views/settings/apply-from-dom.ts. Facade keeps setupSettingsModule and its modal closures verbatim; closure parameter threading is V2b-ii. runWorkerOrchestrator has no call sites: deletion candidate, owner decision. |
| V2b-ii | 2026-08-18 | 1,357,736 | 58,314 | 78,826 | settings.ts closure threading completes the split: confirmCuratedReimport moved verbatim (zero captures); importDeckText, runWorkerOrchestratorDynamic, and the legacy runWorkerOrchestrator moved with curatedStatus threaded as an explicit parameter; restore and show-data handlers became handleRestoreFromPaste/handleShowData; WORKER_BASE/WIDGET_KEY followed their only consumers into ui/views/settings/french-core-build-modal.ts. Facade holds wiring only (about 15 KB). Four moved closures joined the gate list. |
| V2c | 2026-08-18 | 1,357,736 | 58,314 | 78,826 | learn-flow.ts split into application/learn/flow-{state,consolidation,streaming,telemetry,mastery,bodies}.ts with flow types in application/learn/types.ts; facade re-exports preserve learn-flow.test.ts import sites and the __studyEngineLearnFlow bridge registers verbatim. All 39 moved functions gated. buildAdvanceTutorBody has no call sites: deletion candidate. Map deviation: section 2.3 lists a single flow.ts, but the module exceeds the 600-line cap unsplit, so it lands as six files. |

## Location corrections (2026-08-18)

Direct source reads corrected two assumptions from the V1 prompt:
`computeXP` and `scheduleFsrs` are defined in the monolith and injected
into modules through the `__studyEngineSessionFlow` bridge; they are not
defined in session-flow.ts. See docs/extraction-map.md.

# V2 Metrics

Baseline measured 2026-08-18 from file sizes on main. Updated at each
phase gate.

## Baseline

| Metric | Value |
|---|---|
| studyengine.html | 1,357,736 bytes (about 21K lines) |
| studyengine/index.html | 53,497 bytes (not the Vite build input; exact role tracked in the V2 spec open questions) |
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

## Location corrections (2026-08-18)

Direct source reads corrected two assumptions from the V1 prompt:
`computeXP` and `scheduleFsrs` are defined in the monolith and injected
into modules through the `__studyEngineSessionFlow` bridge; they are not
defined in session-flow.ts. See docs/extraction-map.md.

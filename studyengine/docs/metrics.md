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
| CI | none before this branch |

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

# ADR-0001: Five-layer client architecture, three-layer worker

- Date: 2026-08-18
- Status: Accepted

## Context

The client monolith (studyengine.html, 1.36 MB) still holds most UI and
orchestration, and several extracted modules grew into mini-monoliths
(session-flow.ts 58 KB, learn-mode.ts 45 KB, settings.ts 42 KB; worker
learn-plan.ts 79 KB, tutor.ts 48 KB). No import rules existed, so
persistence, UI, and logic could reach each other freely.

## Decision

Client code organizes into five layers with downward-only dependencies:

- L0 Platform: core.js, SyncEngine, browser APIs (external contract)
- L1 Domain: types, FSRS, lifecycle, tiers, XP formulas (pure)
- L2 Application: use cases (session, learn, ingest, learner model)
- L3 Infrastructure: persistence adapter, worker client, telemetry
- L4 UI: views, components, styles

Worker code organizes as routes (thin handlers) -> services (prompts and
business rules) -> llm (transport, parsing, validation).

## Consequences

- Every change cites a target module in the module map.
- Upward imports are treated as defects.
- L1 and L2 stay free of DOM, fetch, and SyncEngine.

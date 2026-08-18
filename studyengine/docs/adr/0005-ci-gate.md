# ADR-0005: Continuous Integration gate

- Date: 2026-08-18
- Status: Accepted

## Context

Multiple V1 runs shipped with "tests not run" or "verification owed".
A gate that depends on memory is not a gate.

## Decision

GitHub Actions runs on every push to main and every pull request:

- studyengine: npm ci, npm run typecheck, npm test
- worker: npm ci, npx tsc --noEmit, npm test (--passWithNoTests)

Merge blocking requires branch protection on main, enabled manually in
repository settings after the Phase V0 merge.

## Consequences

"Tests not run" becomes an impossible state.

# ADR-0003: Split order for oversized modules

- Date: 2026-08-18
- Status: Accepted

## Decision

Split order: session-flow.ts, then learn-mode.ts, then settings.ts,
then learn-flow.ts, then worker learn-plan.ts, then worker tutor.ts.

One file per pull request. Moves are verbatim (reorganize only, no
logic edits) so diffs stay reviewable.

## Rationale

session-flow.ts owns the study loop where user-reported defects
concentrate; restructuring it first attacks the pain directly.

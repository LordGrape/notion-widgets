# ADR-0002: File budgets and monolith freeze

- Date: 2026-08-18
- Status: Accepted

## Context

Oversized files are the strongest predictor of collateral damage from
AI-assisted edits. The largest files in the repo are 42 to 79 KB.

## Decision

- New modules target 300 lines or fewer.
- 600 lines is a hard cap; files approaching it get a tracked split task.
- studyengine.html is exempt from the cap but frozen: no new features
  enter it, only extractions and minimal wiring.

## Consequences

Splits are mandatory engineering work, not optional cleanup.

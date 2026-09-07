# ADR-0007: Law-school orchestrator and shared execution contracts

**Status:** Accepted

## Context

The legacy Study Engine combines memory scheduling, tutoring, language learning, gamification, and several session models. To-do and Timetable already share execution data through SyncEngine, but Study Engine does not participate in that contract. Paid generative-AI calls were unreliable and duplicated Notion AI.

## Decision

Study Engine becomes the learning orchestrator: Notion owns source material; Notion AI prepares grounded study items; Study Engine schedules distinct legal skills and records ratings; To-do owns daily execution tasks; and Timetable owns time windows.

The first rebuild stores its state at `studyengine/lawSchoolState`, writes idempotent tasks to `todo/tasks`, and reads `timetable/courses`. To-do completion is evidence of execution only; it never advances mastery without a Study Engine rating.

## Open-source decisions

- Adopt Anki/FSRS's four-button mental model and stable review history.
- Adopt RemNote/Mochi's low-friction relationship between source material and review prompts.
- Adopt local-first, portable data and deterministic scheduling.
- Do not reimplement or claim FSRS accuracy. Atomic flashcard scheduling will use the official `ts-fsrs` package when integrated; complex legal practice remains on the skill-phase scheduler.

## Consequences

The new interface is immediately usable without an AI API. Cross-widget writes are narrow and reversible. The legacy engine remains available at `studyengine.html` until migration and verification are complete.

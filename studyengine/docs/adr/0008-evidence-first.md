# ADR 0008: Source-linked practice and attributed evidence

Status: accepted for the clean replacement.

## Decision

Keep one strict TypeScript application, stable embed paths, shared runtime contracts, and externally consumed public data. Retire the old frontend rather than shipping two study products.

Notion remains the source repository. Study Engine records focused practice, immutable original responses, attributed assessments, and narrow observations. It does not duplicate a notebook or decide Canadian law from model memory.

Use six practice categories, not a competence ladder. Do not turn ratings, task completion, XP, or time spent into mastery or examination-grade predictions.

## Evidence and storage

Current course rules, assigned sources, official rubrics, and actual instructor feedback outrank generated material. Self-assessment is labelled as such; AI feedback is provisional. Recorded source checks and unaided conditions are assertions, not independent authentication.

A Study Engine-only Durable Object serializes protected updates through the existing authenticated state API. The frontend and Worker use one validation protocol. Original responses, assessments, and recovery snapshots are append-only; corrections retain earlier feedback. Editable practice entries and settings remain last-edit-wins.

Migration is explicit and privately backed up. Old ratings are not converted into verified evidence. Unknown schemas stop writes. The app makes no initial default-state or automatic To-do writes; the shared SDK retains its existing behaviour.

Type checks follow ownership: the root checks shared packages, while Study Engine and Worker checks use their own browser and Cloudflare type environments. Continuous Integration retains all three gates. Worker deployment explicitly selects its configuration rather than inheriting the root assets-only configuration.

## Validation boundary

Three eligible attempts on two days is a conservative display rule, not a validated threshold. Review intervals and time estimates are editable starting points. Same-question repetition does not establish transfer.

Validate a one-course pilot using delayed unaided recall, a fresh application task, source-audited feedback, and actual time cost before expanding. No autonomous tutor, paid model, direct Gizmo integration, or external-calendar access is included.
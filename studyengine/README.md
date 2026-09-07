# Study Engine

Study Engine is the law-school execution layer for the personal Notion widget system.

## Product contract

- **Notion** is the source of truth for readings, notes, cases, course outlines, and professor-specific material.
- **Notion AI** creates grounded prompts, hypotheticals, and answer checklists from those sources.
- **Study Engine** decides which learning activity is due and records performance.
- **To-do** receives concrete activities for the day.
- **Timetable** supplies available study windows and already bridges scheduled work into To-do.

The first rebuild uses no paid generative-AI API. It preserves the previous application at `studyengine.html` and stores the new model under `studyengine/lawSchoolState`.

## Evidence-based workflow

Topics progress through distinct legal skills: retrieve, explain, apply, distinguish, integrate, and perform. Atomic facts may later use the official FSRS implementation. Complex legal application is scheduled as practice, not misrepresented as a flashcard.

## Shared contracts

| Widget | Namespace/key | Role |
| --- | --- | --- |
| Study Engine | `studyengine/lawSchoolState` | Topics, phases, reviews, sessions |
| To-do | `todo/tasks` | Daily execution tasks |
| Timetable | `timetable/courses` | Study windows and commitments |

Study Engine writes stable tasks with `source: 'studyengine'` and reads their completion back. Completion alone never advances mastery; the learner must compare an answer and rate performance.

## Verification

```bash
npm test -- --run test/law-school-core.test.mjs
npm run typecheck
```

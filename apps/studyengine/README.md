# Study Engine

Study Engine is the law-school execution layer of the widget system.

## Canonical implementation

- App: `../../studyengine/index.html`
- Law-school planner: `../../studyengine/app/domain.ts`
- Widget integration and session UI: `../../studyengine/app/app.ts`
- Styling: `../../studyengine/app/styles.css`
- Architecture decision: `../../studyengine/docs/adr/0008-evidence-first.md`
- Stable generated compatibility entry: `../../studyengine/studyengine.html`

## Shared system

- Notion holds authoritative course material.
- Notion AI creates source-grounded prompts and answer checklists.
- Study Engine selects due practice and records attributed evidence, not an automatic competence ladder.
- To-do receives activities only through an explicit action; completion is not evidence.
- Timetable and its existing commitments remain unchanged.

The rebuild uses no paid generative-AI API. Atomic flashcards can later use the official FSRS implementation; legal application, distinction, integration, and timed performance remain separate practice phases.

# Study Engine

Study Engine is the law-school execution layer of the widget system.

## Canonical implementation

- App: `../../studyengine/index.html`
- Law-school planner: `../../studyengine/law-school-core.js`
- Widget integration and session UI: `../../studyengine/law-school-app.js`
- Styling: `../../studyengine/law-school.css`
- Architecture decision: `../../studyengine/docs/adr/0007-law-school-orchestrator.md`
- Preserved legacy build: `../../studyengine/studyengine.html`

## Shared system

- Notion holds authoritative course material.
- Notion AI creates source-grounded prompts and answer checklists.
- Study Engine chooses the due learning phase and records performance.
- To-do receives the daily study activities.
- Timetable provides study windows and recurring commitments.

The rebuild uses no paid generative-AI API. Atomic flashcards can later use the official FSRS implementation; legal application, distinction, integration, and timed performance remain separate practice phases.

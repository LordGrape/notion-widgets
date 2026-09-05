# Command Centre

Private installable Progressive Web App (PWA) for coordinating Notion, law school, and the rest of Musbah's operating system.

## Product role

Command Centre is a companion to Notion, not a replacement for it. Notion remains the source of truth for detailed knowledge, databases, and planning. Command Centre provides the daily execution layer:

- prioritized tasks and concise briefings
- a dedicated Queen's Law view
- a whole-life view covering military, fitness, administration, and personal work
- focused access to every existing widget
- a command surface that can grow into a secure conversational assistant

## Privacy model

The interface is publicly downloadable because it is hosted from a public GitHub repository. Private data is not included in the repository or static application bundle.

On launch, the application requires the Cloudflare Worker access key. It verifies that key against the protected `/state/user` route before loading anything. The key is kept in `sessionStorage`, which means it is cleared when the browser tab or installed application session closes. Every state request sends the key through the `X-Widget-Key` header over HTTPS.

See [`SECURITY.md`](SECURITY.md) for the threat model and operational rules.

## Data boundaries

Tasks, focus records, timetable data, and user data remain under their existing namespaces. Command Centre reads those boundaries without creating a competing data store. The briefing is deterministic and local and must not be presented as a connected language model.

## Next safe phases

1. Add a Worker-side assistant route that receives only the context needed for each request.
2. Add timetable conflict detection using the documented schedule shape.
3. Add authenticated links into selected Notion law-school and life pages.
4. Consider passkey-based authentication after the session-key workflow is proven.

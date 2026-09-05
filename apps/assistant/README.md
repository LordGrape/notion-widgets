# Command Centre

Installable Progressive Web App (PWA) that coordinates the widget suite without replacing the focused Notion embeds.

## Purpose

Command Centre is the standalone execution layer for the widget system. It reads existing `SyncEngine` namespaces, recommends a next action, provides a local daily briefing, and opens each full widget in a focused modal.

## Files

- `index.html` provides the semantic application shell.
- `styles.css` contains responsive light and dark themes using shared semantic tokens.
- `app.js` reads existing widget state and coordinates navigation.
- `manifest.webmanifest` and `sw.js` provide installation and offline shell support.
- `icon.svg` and `icon-maskable.svg` provide application icons.

## Data boundaries

- Task data remains under `todo/tasks`.
- Focus data remains under the existing `clock` namespace.
- This application does not create a parallel data store.
- The assistant preview is deterministic and local. It must not be presented as a connected language model.

## Development

Serve the repository root over HTTP and open `/apps/assistant/`. Service workers and installation do not work from `file://` URLs.

```bash
python3 -m http.server 4173
```

## Next safe phases

1. Validate task and focus summaries against production SyncEngine data.
2. Add timetable conflict detection using the documented schedule shape.
3. Add a secure Worker route for conversational assistance.
4. Add optional desktop packaging only after the PWA proves useful.

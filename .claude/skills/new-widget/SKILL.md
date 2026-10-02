---
name: new-widget
description: Create a new independently embeddable Notion widget in this repo the house way (root HTML entry, core.js + SyncEngine state, WidgetIcons, purple glass theme, apps/<name>/README, app map). Use when asked to build, add or start a new widget or tool page.
---

# Create a new widget

A widget here is one self-contained root HTML file that embeds in Notion, works standalone, syncs through SyncEngine, and owns exactly one namespace. `lineup.html` is the most recent complete example; read it when a pattern below is unclear.

## 0. Confirm before building

Settle these from the request, or ask in one message if they're genuinely unclear:

- **Name and namespace**: lowercase, one word (`reading`, `briefs`). The namespace must not already appear in `apps/README.md` or in `grep -rn "SyncEngine.init" *.html`.
- **The one workflow** it serves. One clear job per widget; anything that composes other widgets belongs in the Command Centre (`apps/assistant/`), not in a new widget.
- **Does it need Notion or a private API?** Then the static page calls the Worker, and the Worker holds the token. Use the `worker-route` skill for that half. Never put tokens, database IDs, or private data in the HTML.

## 1. Scaffold

```bash
NAME=reading; TITLE="Reading"; ICON=book   # ICON must be a name in WidgetIcons.names
sed -e "s/__NS__/$NAME/g" -e "s/__TITLE__/$TITLE/g" -e "s/__ICON__/$ICON/g" \
  .claude/skills/new-widget/templates/widget.html > $NAME.html
mkdir -p apps/$NAME
sed -e "s/__NS__/$NAME/g" -e "s/__TITLE__/$TITLE/g" \
  .claude/skills/new-widget/templates/README.md > apps/$NAME/README.md
```

List available icon names with:
`node -e "const s=require('fs').readFileSync('widget-icons.js','utf8');console.log([...s.matchAll(/^\s+\"([\w-]+)\":\s*\"/gm)].map(m=>m[1]).join(' '))"`

Then add a row to the table in `apps/README.md` (application, production source, data boundary).

## 2. Build it out

What the template already does, so keep it:

- `lang="en-CA"`, Inter, the purple token set for light, dark and forced `data-theme`, a reduced-motion rule, visible focus rings.
- `widget-icons.js` then `core.js`, loaded before the widget script.
- `SyncEngine.init({ worker, namespaces: [NS] })` → `onReady` → `loadState(); paint()`, a `subscribe` for remote updates, and a 2.5s local paint fallback.
- One `state` key. `loadState()` **normalises every field**, so a missing or old-shaped record never crashes. `persist()` is debounced, and `pagehide` flushes it.
- A sync dot that says whether data is device-only or synced.

Rules while extending it:

- **State:** everything persistent goes through `Store`/`SyncEngine`. Add fields to `defaults()` and normalise them in `loadState()`. If you ever change a field's meaning, bump `STATE_VERSION` and migrate in `loadState()`. Never drop data a previous version wrote.
- **Icons:** `data-widget-icon="<name>"` for decoration, `WidgetIcons.svg(name)` in JS. No emoji or Unicode symbols as UI icons. If none fits, add one to `widget-icons.js` in the same Soft Duotone B style (24px grid, `wi-tone` soft fill, 1.65px rounded strokes), then run `node tools/build-widget-icons.mjs`.
- **Keyboard hints:** add `widget-platform.js` and use `data-shortcut="k"` rather than hard-coding ⌘ or Ctrl.
- **Copy:** Canadian English (colour, centre, behaviour, cancelled). Keep it short and calm. No exclamation-mark marketing voice.
- **Layout:** must work from 320px wide up to a full Notion page, with no horizontal scroll. Settings live behind the settings button, not on the main surface.
- **Motion:** honour `Core.reducedMotion`. GSAP is optional (`Core.gsapReady` resolves `null` offline), so never depend on it for function.
- **Test data:** synthetic only. No real names, courses, grades, or military details in fixtures or screenshots.

## 3. Verify

Run the `verify-change` skill. For a new widget it must include:

```bash
node .claude/skills/verify-change/scripts/check-scripts.mjs $NAME.html
node .claude/skills/verify-change/scripts/screenshot-matrix.mjs $NAME.html
```

Look at every screenshot. Then do the SyncEngine round trip: write, reload, read, plus loading with an empty and a malformed stored record.

## 4. Document

Fill in `apps/$NAME/README.md`. It must answer the four questions in `docs/ARCHITECTURE.md`: what it does, which file is the source, which data it owns, and what is protected. Give the embed URL in the final message so the user can paste it into Notion.

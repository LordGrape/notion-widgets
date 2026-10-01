# Core runtime

## Current source
The shared runtime currently lives at `../../core.js`.

## Responsibilities
- Theme tokens and glass UI helpers
- Audio feedback
- Background canvas effects
- Tilt, confetti, tooltips, ripple, accessibility helpers
- SyncEngine cross-widget state

## Migration status
`core.js` remains the production runtime for the legacy widgets. Extract pieces into this package only when a widget is converted to a bundled app.

## AI edit guidance
Before editing `core.js`, identify which widgets use the function being changed. Shared runtime edits can affect every widget.

## Shared Soft Duotone icons

`../../widget-icons.js` is the canonical, original SVG library for all production widgets. Load it before `core.js`; the same frozen API is available as `WidgetIcons` and `Core.icons`. Command Centre loads only the icon library. Athlete inlines it through its builder, and Study Engine keeps the shared external asset in its generated entries.

- `Core.icons.svg("calendar")` returns a decorative, 24px-grid SVG.
- `<span data-widget-icon="calendar" aria-hidden="true"></span>` hydrates automatically, including dynamically inserted UI.
- `.widget-mark` supplies the lavender backplate for widget identities.
- Icon-only controls must retain a descriptive `aria-label`; icons are hidden from screen readers.
- React islands use `WidgetIcons.paths` so their geometry matches the other widgets exactly.

Purple outlines, lavender fills, round caps and a 1.65px stroke define set B. Theme-aware CSS is scoped to icons; progress rings, diagrams, user text and uploaded crests are not rewritten. Geometry is original and requires no external icon font or network dependency. Edit the shared library, then rebuild Athlete and run `node tools/build-widget-icons.mjs` for FIRAC’s separate deployment bundle. Its generated copy is checked in CI.

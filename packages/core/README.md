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

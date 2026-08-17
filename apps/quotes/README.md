# Quotes

## Purpose
Daily quote widget with deterministic day-based quote rotation, fallback quote pool, and optional `quotes.json` support.

## Current source
- Legacy production file: `../../quotes.html`
- Shared runtime: `../../core.js`

## Migration status
This app folder currently wraps the legacy widget without changing behaviour. Keep edits focused:
- Quote UI/logic: edit `../../quotes.html`
- Shared runtime/visual effects: edit `../../core.js`
- App-specific docs: edit this README

## Embed path
Use the root `quotes.html` path until deployment is updated to serve `apps/quotes/` directly.

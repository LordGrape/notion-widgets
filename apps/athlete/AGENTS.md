# Athlete agent guide

## Scope
This file applies to Athlete work. Read the root `AGENTS.md` first.

## Source and output
- `athlete.source.html`, `athlete-*.js`, and `athlete-*.css` are the current source set.
- `athlete.html` is the generated, stable production entry point. Never hand-edit it.
- Keep Athlete-specific behaviour within this application boundary; use `core.js` only for genuinely shared services.

## State boundary
- Namespace: `fitness`, key: `state`.
- Assessment results may mirror through the authenticated Worker to the existing Notion Test Log.
- Workouts, sets, custom exercises, bodyweight, and preferences remain in SyncEngine.
- Preserve existing records and migration behaviour. Avoid duplicate Notion rows.

## Checks
Run:

```bash
node tools/build-athlete.mjs
node tools/build-athlete.mjs --check
node tools/verify-athlete.mjs
```

Verify profile, training, progress, settings, assessment promotion, light and dark themes, and mobile layout when affected.

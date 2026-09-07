# Athlete

A single-file production widget for physical assessments, workout logging, and long-term progress.

## Current structure

The source shell and modules currently remain at the repository root because the generated production path and build automation depend on them. `athlete.html` is generated and must not be edited directly. Consolidating these source files under this folder should be completed as one atomic migration that updates the build script, verifier, workflow triggers, and source references together.

## Data boundary

- Assessments use the `fitness.state` SyncEngine record and may mirror to the existing Notion Test Log through the authenticated Worker.
- Stable widget entry IDs make Notion writes idempotent; deleting a linked assessment archives the corresponding row.
- Workouts, sets, custom exercises, bodyweight, and scoring preferences remain in SyncEngine to avoid duplicate systems and Notion clutter.
- Credentials remain in Cloudflare Worker secrets.

## Build and verify

```bash
node tools/build-athlete.mjs
node tools/build-athlete.mjs --check
node tools/verify-athlete.mjs
```

Edit the source modules and rebuild. Never edit generated `athlete.html` directly.

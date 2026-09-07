# Athlete

Athlete is organized as an application boundary under `apps/athlete/`.

## Public entry point

- Organized URL: `/apps/athlete/`
- Compatibility URL: `/athlete.html`
- `apps/athlete/index.html` preserves query strings and hash-based widget authentication when forwarding to the current single-file build.

## Data boundary

- Assessments use the `fitness.state` SyncEngine record and may mirror to the existing Notion Test Log through the authenticated Worker.
- Stable widget entry IDs make Notion writes idempotent; deleting a linked assessment archives the corresponding row.
- Workouts, sets, custom exercises, bodyweight, and scoring preferences remain in SyncEngine.
- Credentials remain in Cloudflare Worker secrets.

## Build and verify

```bash
node tools/build-athlete.mjs
node tools/build-athlete.mjs --check
node tools/verify-athlete.mjs
```

`athlete.html` is generated. Never edit it directly. Athlete-specific guidance lives in this folder even while the compatibility build remains at the root.

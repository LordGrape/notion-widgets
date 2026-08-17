# Sync worker

## Current source
The Cloudflare Worker currently lives at `../../worker/`.

## Purpose
Backend/state sync support for widgets that use SyncEngine.

## Migration status
The worker already has its own package-like structure (`package.json`, `src/`, `test/`, `wrangler.toml`). Keep edits in `worker/` until deployment is intentionally moved into `packages/sync-worker`.

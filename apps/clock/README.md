# Clock widget

Legacy source: `clock.html` at repo root.

## Purpose
A compact clock + stopwatch + timer widget designed for Notion embeds.

## Inputs
- Uses `SyncEngine` (`core.js`) for persisted user settings.
- Optional user keys in SyncEngine namespace `user`: `name`, `lat`, `lon`, `location`, `tz`.

## Run / preview
This repo currently previews via Wrangler (see root `package.json`).

## Deploy
Deployment is currently handled by the existing Wrangler configuration. This folder is part of the migration and may be wired into the deployment pipeline later.

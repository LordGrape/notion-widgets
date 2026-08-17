# notion-widgets

A collection of self-hosted widgets for embedding in Notion.

## Repo map
- `apps/` — individual widgets (one folder per widget)
- `packages/` — shared code used across widgets
- `core.js` — legacy shared runtime used by existing HTML widgets
- `wrangler.jsonc` — Cloudflare Workers/Pages config (current deployment)

## How to change one widget (AI-friendly)
1. Identify the widget folder (under `apps/`) or the legacy single-file widget at repo root.
2. Change only that widget plus any necessary shared code in `packages/`.
3. Run formatting: `pnpm format`.

## Development
- Preview locally: `pnpm preview`
- Deploy: `pnpm deploy`

## Migration status
This repo is being migrated from legacy single-file widgets at the repo root to a structured monorepo layout.
The legacy widgets remain supported during the transition.

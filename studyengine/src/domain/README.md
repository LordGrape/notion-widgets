# Domain layer (L1)

Pure rules of the Study Engine. Modules here must not import the DOM,
fetch, SyncEngine, GSAP, or any higher layer. They operate on plain data
(shapes in `../types.ts`) and are the cheapest code in the repo to test.

## Current citizens

- `lifecycle.ts`: card lifecycle derivation, stage setter, and the load-time
  migration. Moved verbatim from `learn-mode.ts` in Phase V1a (2026-08-18).

## Queued for Phase V1b (requires a local checkout)

These live in `studyengine.html` and are injected into modules through the
`__studyEngineSessionFlow` bridge. The monolith cannot be edited through
full-file API rewrites (1.36 MB), so these extractions wait for a local
session. See `../../docs/extraction-map.md` for the runbook.

- `fsrs.ts`: FSRS-6 scheduling (SACRED: `scheduleFsrs`, weights, decay helpers).
- `tiers.ts`: `TIER_PROFILES` and related constants.
- `xp.ts`: `computeXP` and Bloom multipliers.

## Rules

1. Downward imports only; nothing here imports from application, UI, or
   infrastructure layers (ADR-0001).
2. 300-line target, 600-line hard cap (ADR-0002).
3. Strict types. No `any`; use `unknown` and narrow.
4. Every module ships with a colocated `*.test.ts` using synthetic,
   public-domain fixtures.
5. `node scripts/verify-domain-extraction.mjs` must pass; it runs in CI.

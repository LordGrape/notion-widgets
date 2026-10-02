---
name: worker-route
description: Add or change an endpoint in the Cloudflare Worker (worker/), the repo's only home for secrets, Notion writes and protected network calls. Covers routing, auth, CORS, Notion calls, writing SyncEngine namespaces from the server, tests and deployment. Use for any change under worker/ or any widget feature that needs Notion or a private API.
---

# Add or change a Worker route

`worker/` is the secrets boundary: Notion tokens, database IDs, AI keys and VAPID private keys exist only as Worker secrets. Static widgets call it with the `X-Widget-Key` header. **A push to `main` that touches `worker/**` deploys to production automatically** (`.github/workflows/deploy-worker.yml`).

## Map

- Deployed entry: `src/index-with-reminders.ts` (health routes, the cron `scheduled` handler, Durable Object export). It forwards everything else to `src/index.ts`.
- Router: `src/index.ts`. An `if` chain on `url.pathname`, with a method check that returns `methodNotAllowed()` and a handler wrapped in `withCorsHeaders(...)`. Unknown paths fall through to a 404, and a top-level catch returns 500.
- Auth: `src/auth.ts` `validateAuth` runs before routing. Every route needs `X-Widget-Key === env.WIDGET_SECRET` **unless** it is listed in `PUBLIC_STUDYENGINE_ROUTES` or under `/widgets/`. New routes are private by default; keep it that way.
- CORS: `src/cors.ts`. Allowed methods are `GET, PUT, POST, OPTIONS`. A route using `DELETE` or `PATCH` must add it there too, or browsers will fail the preflight.
- Env: `src/types.ts` `Env`. Add new secrets as optional fields (`FOO_DB_ID?: string`).
- Tests: `test/*.test.ts` and `src/routes/__tests__/*.test.ts` (Vitest).

## Steps

1. **Read the neighbour first.** Pick the closest existing route (`todo-tasks.ts` for a Notion write with idempotency, `upcoming-assignments.ts` for a Notion read, `state.ts` for KV) and copy its shape.
2. **Handler** in `src/routes/<name>.ts`, exporting `handle<Name>(request, env)`:
   - Check the method yourself and return `405` JSON.
   - Missing configuration returns `501 { configured: false, error }`, not a crash. Copy `todo-tasks.ts`.
   - Validate input into a typed object before use, and return `400 { error }` with a plain-language message. No `any` in new code.
   - Upstream failure returns `502 { ok: false, error, detail }`. Never echo secrets or full upstream bodies.
3. **Notion calls** use `https://api.notion.com/v1`, headers `Authorization: Bearer ${env.NOTION_TOKEN}`, and `Notion-Version: 2022-06-28` (the version every existing route pins). Writes must be **idempotent**: derive a stable ID from client input (an `idempotencyKey`, an occurrence ID, or a widget entry ID), look it up before creating, and update if found. A retry must never create a duplicate page.
4. **Writing a widget's state from the server:** KV key = SyncEngine namespace (`env.WIDGET_KV.get("todo", "json")`). Each field is `{ value, _ts }`, and the client merges on `_ts`. Read, modify only your field, set a fresh `_ts`, preserve every other field and its timestamp, and write back. Some values are JSON strings (`todo.tasks`); match the existing encoding. Never PUT a partial namespace. `state.ts` has special guards for `dragon` and `studyengine`; don't bypass them.
5. **Register** in `src/index.ts` next to related routes. A cron-driven job goes in `index-with-reminders.ts`'s `scheduled` handler instead.
6. **Test** with a Vitest file next to the route's peers. Stub `fetch` with `vi.stubGlobal` and use an in-memory KV class (see `src/routes/__tests__/todo-tasks.test.ts`). Cover: happy path, bad input (400), missing config (501), upstream failure (502), and that a repeated call is idempotent. Synthetic data only.
7. **Client side:** call it through `SyncEngine.callWorker("/path", { method: "POST", headers: { "Content-Type": "application/json" }, body })` in `core.js`. It adds the stored `X-Widget-Key` and returns the raw `Response`. Handle `401` (locked or no key) and `501` (not configured) with calm UI states. Never hard-code a key or Worker secret in a static file. If a call is reused by several widgets, a named method beside `fetchUpcomingAssignments` in `core.js` is the precedent; adding one is additive, not a change to SyncEngine's contract.

## Protected: change only with explicit approval

- Grading and tutoring prompt contracts (`grade.ts`, `tutor.ts`, `learn-*.ts`, and the sacred functions listed in `scripts/SACRED-ANCHORS.md`). That file's `worker/` entries are current; its `studyengine/src/*.ts` references point at the retired frontend and are stale.
- FSRS parameters in Worker contracts, and anything in `study-evidence-ledger.ts` (evidence is immutable).
- `PUBLIC_STUDYENGINE_ROUTES`. Adding to it makes a route unauthenticated.
- `wrangler.toml` bindings, the cron schedule, and the Durable Object migrations.

## Verify and deploy

```bash
cd worker && npx tsc --noEmit && npm test -- --passWithNoTests
npx wrangler deploy --config wrangler.toml --dry-run --outdir "${TMPDIR:-/tmp}/nw-worker-dry"
```

Do not run `wrangler deploy` or `wrangler secret put` yourself. When a new secret is needed, tell the user the exact command (`wrangler secret put FOO_DB_ID`) to run, and say the route returns 501 until they do. Before pushing, run the `ship` skill: it will flag the automatic deploy.

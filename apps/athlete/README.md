# Athlete widget

Production source remains at the repository root so existing embeds stay stable.

## Durable data boundary

- Assessment results use SyncEngine for fast cross-device state and mirror to the existing Notion JTF2 **Test Log** through the authenticated Worker.
- Compatible manual Test Log rows are imported. Test, date, value, and load are used to adopt an existing row rather than create a duplicate.
- A stable `Widget Entry ID` keeps later saves idempotent. Deleting an assessment in Athlete archives its linked Notion row.
- Completed workouts, individual sets, custom exercises, bodyweight, and scoring preferences remain in SyncEngine. Mirroring those records would duplicate specialised training systems and add administrative clutter.
- The Notion token stays in Worker secrets. Static widget files contain only generic client logic.

## Files

- `athlete.source.html`: source shell
- `athlete-*.js` and `athlete-*.css`: source modules
- `athlete-notion.js`: bounded Test Log bridge
- `athlete.html`: generated single-file build
- `worker/src/routes/fitness-tests.ts`: authenticated Notion read, upsert, deduplication, and archive route

Build with `node tools/build-athlete.mjs` and verify with `node tools/verify-athlete.mjs`.

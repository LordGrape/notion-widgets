# __TITLE__

## Purpose
One or two sentences: what this widget does and the single workflow it is built around.

## Current source
- Production file: `../../__NS__.html`
- Shared runtime: `../../core.js`, `../../widget-icons.js`

## Embed path
`/__NS__.html`. Append `#key=<widget key>` for iOS Notion embeds where localStorage is blocked.

## State
SyncEngine namespace: `__NS__`
Key: `state`

```ts
type State = {
  v: 1
  items: unknown[]          // replace with the real shape
  appearance: { themeMode: "system" | "light" | "dark" }
}
```

Owned by this widget only. Other namespaces read: none.

## Behaviour worth preserving
- List anything that must not change incidentally.

## Checks
```bash
node .claude/skills/verify-change/scripts/plan-checks.mjs
node .claude/skills/verify-change/scripts/screenshot-matrix.mjs __NS__.html
```

# Lineup

A 7v7 roster, formation, and match-day rotation widget for coaching a small-sided team.

Production path: `/lineup.html`

## Purpose

Built around one sideline workflow: rotate whole squads rather than making individual
substitutions. Set a roster once, save two or more squads, then swap the group in a
single tap while the match clock keeps every player's minutes honest.

## Surfaces

| Tab | Responsibility |
| --- | --- |
| Lineup | Pitch, bench, formation presets, saved squads, image export |
| Match | Clock, swap reminder, next-squad preview, playing-time totals |
| Roster | Add, edit, reorder, remove, and mark players away for the day |
| Team | Team name, counts, backup import and export |

## State

All persistent state lives in the `lineup` SyncEngine namespace under a single `team`
key, so a roster edited on a phone appears on a laptop. `localStorage` is used only as
a fallback when `core.js` is unavailable, which keeps the widget usable standalone.

```text
team = {
  teamName, players[], formation, slots[7], squads[], currentSquadId, match
}
```

- `players[]`: `{ id, name, number, position, available }`
- `slots[7]`: `{ playerId, x, y, role }` where `x` and `y` are pitch percentages.
  Index `0` is the goalkeeper by convention. Free coordinates are what allow a
  formation to be nudged away from its preset.
- `squads[]`: `{ id, name, formation, slots[7] }`, a full positional snapshot
- `match`: `{ elapsedMs, intervalMin, lastAlertBucket, minutes{playerId: seconds} }`

The v1 build wrote to a raw `soccer7v7:v1` localStorage key. `migrateLegacy()` imports
that shape once and then removes it. Remove the migration only after it is certain no
device still holds v1 data.

## Behaviour worth preserving

- **The clock never auto-resumes after a reload.** Minutes are credited on a one second
  tick while the widget is open, so resuming automatically would invent playing time
  the app did not observe. Pausing on load keeps the totals defensible.
- **Presets reposition slots but keep the players on them.** Switching formation is a
  shape change, not a team change.
- **Only seven slots exist**, so the 7v7 limit is structural rather than validated.
- **Dragging an empty slot is allowed**, which lets a coach shape a formation before
  anyone is assigned to it.
- **Blue and amber, never red and green**, for the coming-on and going-off preview, so
  the swap is readable for colour-blind users.
- Tap-to-place is kept alongside pointer dragging because it is the reliable path on a
  phone in cold weather with gloves.

## Pitch geometry

Markings are drawn in a `0 0 100 150` viewBox with `xMidYMid meet`; the container is
locked to `aspect-ratio: 2/3`, matching a regulation 7v7 pitch of roughly 40 by 60
yards. Player coordinates are percentages, not viewBox units. The canvas export keeps
these two scales separate via `SX`/`SY` for markings and `PX`/`PY` for players. Mixing
them silently compresses the lineup into the top two thirds of the exported image.

## Export

`exportPitchImage()` redraws the pitch to a 2x canvas rather than screenshotting the
DOM, so the output is independent of the embed's rendered size and needs no extra
dependency.

## Verification

No build step. Open `lineup.html` directly, or run the repository checks:

```bash
pnpm check
```

For changes here, exercise: roster add/edit/reorder/away, tap-to-place, pointer drag on
both a marker and a bench card, free repositioning, formation switching with a full
pitch, squad save and load, the rotation swap preview, clock start/pause/reset, minute
accrual, reload persistence, and the PNG export. Check light and dark themes and a
narrow viewport, since the widget is embedded in a Notion column.

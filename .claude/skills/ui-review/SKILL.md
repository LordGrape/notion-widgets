---
name: ui-review
description: Review a UI change against this repo's established design (minimal purple glass, WidgetIcons duotone set, Canadian English, embed-safe layouts, the Broadcast mascot spec) before it ships. Use after any visual or copy change, when asked to review or polish UI, and as part of verify-change for HTML/CSS/UI source.
---

# Review a UI change

The goal is to keep the system feeling like one calm product: **improve function, settings, responsiveness and smoothness without redesigning or adding clutter.** A review here mostly catches drift. It is not a chance to restyle.

## 1. Mechanical scan

```bash
node .claude/skills/ui-review/scripts/scan-ui.mjs              # uncommitted work
node .claude/skills/ui-review/scripts/scan-ui.mjs origin/main  # everything unpushed
```

ERRORs (emoji used as icons, credential-like strings) must be fixed. WARNs (American spelling in user-facing text, new `localStorage`, new third-party script origin, off-system font) each need a decision. Fix them, or state why the exception is right.

## 2. Look at it

Render with `node .claude/skills/verify-change/scripts/screenshot-matrix.mjs <page>` and open every PNG with Read. Compare with `HEAD` when the change alters something existing (`git stash`, rerun with `--out <other dir>`, `git stash pop`). Judge what you see against this checklist.

### Visual language
- [ ] Uses the page's existing tokens (`--accent`, `--panel`, `--border`, `--text-dim`, etc.). No new raw hex values when a token exists, and no new accent hues. Study Engine's lime accent is local to Study Engine.
- [ ] Glass cards keep their translucent panel, soft border, and purple glow. No new heavy shadows, gradients, or borders that compete with content.
- [ ] Type stays Inter (UI) and JetBrains Mono (numbers and timers where already used). Hierarchy comes from weight and size, not new colours.
- [ ] Nothing new lives on the main surface that could live in Settings. Every added control earns its place.

### Icons
- [ ] Icons come from `widget-icons.js` via `data-widget-icon="name"` or `WidgetIcons.svg(name)`, using the existing semantic names (`settings`, `check`, `close`, `plus`, `calendar`, …).
- [ ] No emoji or platform-dependent Unicode as UI icons. Typographic glyphs (`·`, `—`, `→`) and shortcut symbols rendered by `widget-platform.js` are fine.
- [ ] A genuinely new icon was added to the shared set in the same Soft Duotone B style (24px grid, `wi-tone` soft layer, rounded strokes), and `node tools/build-widget-icons.mjs` was run.
- [ ] Icon-only buttons have an `aria-label`. Decorative icons have `aria-hidden="true"`.

### Themes, motion and layout
- [ ] Light, dark, and forced `data-theme` all look intentional: contrast is readable and no element is invisible in one theme.
- [ ] Reduced motion: no essential information is carried only by animation. The page honours the `prefers-reduced-motion` rule or `Core.reducedMotion`.
- [ ] 375px phone: no horizontal scroll, tap targets about 40px, nothing clipped. Desktop does not stretch content into long lines.
- [ ] Notion embed (iframe ~600px): it fits without inner double scrollbars. The `F`/Esc expand toggle from `core.js` still works when the widget uses `.container`.
- [ ] Keyboard: everything reachable by Tab, visible focus ring, Esc closes dialogs and popovers.

### Copy
- [ ] Canadian English (colour, centre, behaviour, favourite, cancelled, labelled).
- [ ] Short, calm, specific. States what happened and what the person can do, without exclamation-mark cheerleading or blame. Errors name the fix ("Add the widget key in Settings"), not the stack trace.
- [ ] Offline and local-only states are honest ("Saved on this device", not "Saved").
- [ ] Study Engine copy never implies mastery, grades, or verified AI feedback (see the `study-engine` skill).

### Command Centre's Broadcast (only when `apps/assistant/` or `core.js` mascot code changed)
- [ ] Still the approved build: purple CRT television head with broadcast glitches, broad-shouldered muscular build in a tailored charcoal executive suit, substantial gloves and shoes.
- [ ] Rubber-hose executive gestures, glitches occasional and restrained. Dialogue readable; wordless static-like chatter optional.
- [ ] The independent "hide partner" setting hides **all** of him, and the separate sound setting silences him. Both still work and persist.
- [ ] He never replaces a task control or an icon. Controls work identically with him hidden.

## 3. Report

List what you checked, each issue with file and line and a concrete fix, and anything you could not judge from screenshots (animation feel, sound). When the change is a deliberate redesign the user asked for, say which checklist items it intentionally departs from instead of flagging them as defects.

# Broadcast 3D

Source for the 3D Broadcast used by Command Centre (`apps/assistant/broadcast.glb` and `apps/assistant/broadcast-run.webp`). The model is built procedurally in Blender; there is no hand-edited .blend to keep in sync.

The executive wardrobe has a charcoal three-piece suit, peaked lapels, a silver tie bar, double-monk leather shoes and articulated silver hands with graphite joints and purple signal rings. The shallow leather suitcase head has a carry handle, silver clasps and corner protectors around the live purple face panel. The face, rig and five animation clips are retained. Rebuild both assets together; the CSS fallback in `apps/assistant/styles.css` and `broadcastMarkup()` carries the same waistcoat, tie bar, segmented hands and buckles. Bump the app revision, stylesheet/script URLs, sprite URL and service-worker cache when shipping rebuilt assets.

## Rebuild

```bash
PREVIEW=0 RUN_W=800 RUN_SAMPLES=96 blender -b --python tools/broadcast/build.py -- <outdir>
npx @gltf-transform/cli@4 optimize <outdir>/broadcast.glb apps/assistant/broadcast.glb --compress meshopt --texture-compress webp --texture-size 512 --simplify false
SPRITE_QUALITY=0.95 node tools/broadcast/sprite.cjs <outdir>/broadcast-run.png apps/assistant/broadcast-run.webp 800 880
```

Use `PREVIEW=1` to also render still frames of each clip into `<outdir>`. `RUN_W` is the width of one run frame in pixels (height is 1.1x; default 300), `RUN_SAMPLES` the anti-aliasing samples (default 48). The shipped sheet is 16 frames of 800x880 (12800x880), because the loading screen shows the run cycle up to about 1000 px wide.

For a quick modelling pass, `RENDER_RUN=0 PREVIEW_CLIPS=idle` skips the sprite render and previews only idle. These controls do not remove any exported animation clips. The output folder is created automatically and includes the editable `broadcast_rigged.blend`.

`node tools/broadcast/verify.cjs <screenshot-directory>` verifies the shipped rig and executive details, then opens the real app with synthetic state in light/dark, desktop/mobile, embedded and reduced-motion configurations. It exercises talking, cheering, slumping and glitching. Install `three@0.170.0` without saving it as a dependency to serve the app's pinned CDN modules locally during the test. Set `BROADCAST_BROWSER=chrome` or `msedge` to use an installed browser.

## Contract with the app

- Joints (glTF nodes): `Root`, `Body`, `Neck`, `ShoulderL/R`, `ElbowL/R`, `HipL/R`.
- Clips: `idle`, `talk`, `cheer`, `slump`, `run`. Every clip keys every joint, so switching clips never leaves a stale pose.
- The face is the mesh named `Screen`. `apps/assistant/broadcast3d.mjs` replaces its emissive map with a live canvas (moods, blinking, talking, glitches).
- The run sprite is 16 frames, laid out left to right, for the loading screen.

## Logo

`python tools/broadcast/logo.py` regenerates the Command Centre mark (Broadcast's suitcase with the M on its face panel): the two inline badges in `apps/assistant/index.html`, the light and dark theme variables in `styles.css`, and `icon.svg` (adapts to the browser's colour scheme), `icon-light.svg`, `icon-dark.svg` and `icon-maskable.svg`. The installed icons are dark-tile PNGs rendered from `icon-dark.svg` and `icon-maskable.svg` with `sharp` at 192, 512 (and maskable 512), 180 (`apple-touch-icon.png`) and 32 (`favicon-32.png`) px.

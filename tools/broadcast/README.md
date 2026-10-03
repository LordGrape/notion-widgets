# Broadcast 3D

Source for the 3D Broadcast used by Command Centre (`apps/assistant/broadcast.glb` and the loading-screen sheets `apps/assistant/broadcast-<scene>.webp`). The model is built procedurally in Blender; there is no hand-edited .blend to keep in sync.

The executive wardrobe has a charcoal three-piece suit, peaked lapels, a silver tie bar, double-monk leather shoes and articulated silver hands with graphite joints and purple signal rings. The shallow leather suitcase head has a carry handle, silver clasps and corner protectors around the live purple face panel. The face, rig and five animation clips are retained. Rebuild both assets together; the CSS fallback in `apps/assistant/styles.css` and `broadcastMarkup()` carries the same waistcoat, tie bar, segmented hands and buckles. Bump the app revision, stylesheet/script URLs, sprite URL and service-worker cache when shipping rebuilt assets.

## Rebuild

```bash
PREVIEW=0 SCENE_W=640 SCENE_SAMPLES=128 blender -b --python tools/broadcast/build.py -- <outdir>
npx @gltf-transform/cli@4 optimize <outdir>/broadcast.glb apps/assistant/broadcast.glb --compress meshopt --texture-compress webp --texture-size 512 --simplify false
node tools/broadcast/sprite.cjs <outdir>/scenes apps/assistant
```

Use `PREVIEW=1` to also render still frames of each clip into `<outdir>`. For a quick modelling pass, `SCENES= PREVIEW_CLIPS=idle` skips the scenes and previews only idle. These controls do not remove any exported animation clips.

## Loading scenes

`scenes.py` (run by `build.py`) renders the loading-screen scenes in Cycles on the GPU, with a shadow-catcher floor, motion blur and props built in the script:

| Scene | Frames | Loop | What happens |
| --- | --- | --- | --- |
| `run` | 16 | 0.64 s | Running, with dust where each foot pushes off |
| `laptop` | 48 | 2 s | Typing at a desk, then slamming Enter and leaning back |
| `meditate` | 40 | 2 s | Floating cross-legged with orbiting lights and a rune ring |
| `soccer` | 24 | 1 s | Juggling a football from foot to foot |
| `basketball` | 24 | 1 s | Dribbling beside him in a low stance; the hand is solved onto the ball each frame |

Every scene is a function of the frame keyed on every frame, so loops are seamless and balls meet the foot or hand they come from. Glows are rendered in a second pass with everything else held out, because Cycles shows the shadow catcher through transparent surfaces. `SCENES` picks scenes (comma separated), `SCENE_W` the frame width (height is 1.1x), `SCENE_SAMPLES` the samples, `SCENE_FRAMES=0,12` renders only some frames and `SCENE_CAMERA=x,y,z` moves the camera for a quick look.

`sprite.cjs` packs each scene into `broadcast-<scene>.webp`, 8 frames per row (`SPRITE_QUALITY`, default 80; `SPRITE_ALPHA`, default 80; alpha under `SPRITE_ALPHA_FLOOR`, default 12 of 255, is dropped so faint shadow-catcher haze does not blotch on light pages). The frame counts and loop lengths are repeated in `apps/assistant/styles.css` (`--rows`, `--loop`) and the scene list in the head script of `apps/assistant/index.html` and in `sw.js`; keep them in step. The output folder is created automatically and includes the editable `broadcast_rigged.blend`.

`node tools/broadcast/verify.cjs <screenshot-directory>` verifies the shipped rig and executive details, then opens the real app with synthetic state in light/dark, desktop/mobile, embedded and reduced-motion configurations. It exercises talking, cheering, slumping and glitching. Install `three@0.170.0` without saving it as a dependency to serve the app's pinned CDN modules locally during the test. Set `BROADCAST_BROWSER=chrome` or `msedge` to use an installed browser.

## Contract with the app

- Joints (glTF nodes): `Root`, `Body`, `Neck`, `ShoulderL/R`, `ElbowL/R`, `HipL/R`, `KneeL/R` (children of the hips).
- Clips: `idle`, `talk`, `cheer`, `slump`, `run`. Every clip keys every joint, so switching clips never leaves a stale pose.
- The face is the mesh named `Screen`. `apps/assistant/broadcast3d.mjs` replaces its emissive map with a live canvas (moods, blinking, talking, glitches).
- The loading screen picks one scene per page load; only that sheet is downloaded.

## Logo

`python tools/broadcast/logo.py` regenerates the Command Centre mark (Broadcast's suitcase with the M on its face panel): the two inline badges in `apps/assistant/index.html`, the light and dark theme variables in `styles.css`, and `icon.svg` (adapts to the browser's colour scheme), `icon-light.svg`, `icon-dark.svg` and `icon-maskable.svg`. The installed icons are dark-tile PNGs rendered from `icon-dark.svg` and `icon-maskable.svg` with `sharp` at 192, 512 (and maskable 512), 180 (`apple-touch-icon.png`) and 32 (`favicon-32.png`) px.

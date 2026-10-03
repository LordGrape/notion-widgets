# Broadcast 3D

Source for the 3D Broadcast used by Command Centre (`apps/assistant/broadcast.glb` and `apps/assistant/broadcast-run.webp`). The model is built procedurally in Blender; there is no hand-edited .blend to keep in sync.

## Rebuild

```bash
PREVIEW=0 blender -b --python tools/broadcast/build.py -- <outdir>
npx @gltf-transform/cli@4 optimize <outdir>/broadcast.glb apps/assistant/broadcast.glb --compress meshopt --texture-compress webp --texture-size 512 --simplify false
node tools/broadcast/sprite.cjs <outdir>/broadcast-run.png apps/assistant/broadcast-run.webp 200 220
```

Use `PREVIEW=1` to also render still frames of each clip into `<outdir>`.

## Contract with the app

- Joints (glTF nodes): `Root`, `Body`, `Neck`, `ShoulderL/R`, `ElbowL/R`, `HipL/R`.
- Clips: `idle`, `talk`, `cheer`, `slump`, `run`. Every clip keys every joint, so switching clips never leaves a stale pose.
- The face is the mesh named `Screen`. `apps/assistant/broadcast3d.mjs` replaces its emissive map with a live canvas (moods, blinking, talking, glitches).
- The run sprite is 16 frames, laid out left to right, for the loading screen.

# Carry

Carry is Broadcast's small lavender suitcase son. His home is beside the Today
heading in Command Centre. Tap him for a greeting; completing a task plays his
celebration. The existing companion visibility setting controls both characters.

## Build

Run from the repository root with Blender 5:

```sh
blender -b --python tools/carry/build.py -- ./carry-output
```

This produces `carry.blend` (editable studio scene), `carry.png` (transparent
portrait), and `carry.glb` (web model). Copy the GLB to `apps/assistant/carry.glb`.
Convert the portrait to a 400 by 400 transparent WebP at quality 90 and save it as
`apps/assistant/carry.webp`. Increment the application and service-worker revision
when replacing these assets.

The builder loads the existing modelling helpers and `idle`, `talk`, `cheer`,
`slump`, and `run` clip definitions from `tools/broadcast/build.py`. It gives Carry
the same joint names with proportions appropriate to his small body. Broadcast's
model and animation definitions are preserved.

The shared Three.js renderer loads Carry as an independent instance. His happy
face is emissive geometry, shared by his Blender portrait and live model. He has
no voice or random glitch effect. Reduced motion and failed 3D loads use the
portrait. View changes detach his canvas and stop his animation loop.

## Verification

Check Today in light and dark themes, at desktop, tablet and mobile widths, and
inside an iframe. Exercise greeting, task completion, switching to Docket and
back, hiding/restoring companions, reduced motion, and a failed model request.
Verify Broadcast still mounts on Docket and retains his own reactions.

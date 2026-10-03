"""Build Carry in Blender, reusing Broadcast's named joints and animation clips.

blender -b --python tools/carry/build.py -- <output-directory>
The editable studio, transparent preview and web GLB are generated together.
"""
import ast
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

OUT = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.film_transparent = True
scene.render.resolution_x = scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.render.fps = 24
scene.world = bpy.data.worlds.new("Studio")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.7, 0.65, 0.85, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.25
scene.view_settings.view_transform = "AgX"

# Reuse the existing authoring helpers and animation definitions without running
# the executive's geometry builder or expensive loading-screen sprite renders.
source_path = Path(__file__).resolve().parents[1] / "broadcast" / "build.py"
source = source_path.read_text(encoding="utf-8")
helpers = {"activate", "apply_tf", "apply_mod", "mat", "empty", "parent_to", "reset", "keyframes", "stash"}
tree = ast.parse(source)
for node in tree.body:
    if isinstance(node, ast.FunctionDef) and node.name in helpers:
        exec(compile(ast.Module(body=[node], type_ignores=[]), str(source_path), "exec"))
exec(source[source.index("Z = (0, 0, 0)"):source.index("# ---------- lights and camera")])

shell = mat("Carry lavender", (0.32, 0.20, 0.57), rough=0.34, coat=0.35)
rim = mat("Soft lilac rim", (0.52, 0.37, 0.74), rough=0.38, coat=0.22)
handle_mat = mat("Deep violet handle", (0.12, 0.065, 0.23), rough=0.38)
screen_mat = mat("Ink glass", (0.018, 0.012, 0.045), rough=0.24, coat=0.5)
latch = mat("Champagne buttons", (0.55, 0.43, 0.28), rough=0.35, metal=0.35)
face_mat = mat("Warm face light", (0.90, 0.82, 1.0), rough=0.4)
bsdf = face_mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Emission Color"].default_value = (0.78, 0.64, 1, 1)
bsdf.inputs["Emission Strength"].default_value = 0.7

root = empty("Root", (0, 0, 0))
body = empty("Body", (0, 0, 0.48), root)
neck = empty("Neck", (0, 0, 0.65), body)
J = {"Root": root, "Body": body, "Neck": neck}
for sign, side in ((-1, "L"), (1, "R")):
    shoulder = empty("Shoulder" + side, (sign * 0.73, 0, 0.64), body)
    elbow = empty("Elbow" + side, (sign * 0.81, -0.02, 0.47), shoulder)
    hip = empty("Hip" + side, (sign * 0.39, 0, 0.28), root)
    knee = empty("Knee" + side, (sign * 0.39, -0.14, 0.19), hip)
    J.update({"Shoulder" + side: shoulder, "Elbow" + side: elbow, "Hip" + side: hip, "Knee" + side: knee})


def box(name, loc, dimensions, material, bevel, joint=neck):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    # Round the front silhouette before flattening shallow screen panels.
    depth = max(dimensions[1], bevel * 2.2)
    obj.scale = (dimensions[0], depth, dimensions[2])
    apply_tf(obj)
    mod = obj.modifiers.new("Rounded corners", "BEVEL")
    mod.width, mod.segments = bevel, 8
    apply_mod(obj, mod.name)
    obj.scale.y = dimensions[1] / depth
    apply_tf(obj)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.modifiers.new("Soft normals", "WEIGHTED_NORMAL")
    obj.data.materials.append(material)
    parent_to(obj, joint)
    return obj


def ball(name, loc, scale, material, joint):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, location=loc)
    obj = bpy.context.object
    obj.name, obj.scale = name, scale
    apply_tf(obj)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.data.materials.append(material)
    parent_to(obj, joint)
    return obj


def line(name, points, radius, material):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth, curve.bevel_resolution = radius, 4
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, loc in zip(spline.points, points):
        point.co = (*loc, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(material)
    activate(obj)
    bpy.ops.object.convert(target="MESH")
    parent_to(obj, neck)


box("Carry case", (0, 0, 1.04), (1.60, 0.79, 1.55), shell, 0.28)
box("Back seam", (0, 0.23, 1.04), (1.58, 0.32, 1.51), handle_mat, 0.145)
box("Back shell", (0, 0.27, 1.04), (1.58, 0.31, 1.51), shell, 0.145)
box("Screen surround", (0, -0.372, 1.05), (1.41, 0.19, 1.29), rim, 0.19)
box("Screen glass", (0, -0.466, 1.05), (1.22, 0.095, 1.10), screen_mat, 0.17)
# The face is real emissive geometry, keeping the preview and web model identical.
# It deliberately has no Screen node, so Broadcast's dynamic face remains untouched.
for x in (-0.29, 0.29):
    line("Happy eye", [(x + 0.115 * math.cos(a), -0.521, 1.10 + 0.10 * math.sin(a)) for a in [i * math.pi / 32 for i in range(33)]], 0.026, face_mat)
line("Little smile", [(0.075 * math.cos(a), -0.521, 0.96 + 0.045 * math.sin(a)) for a in [math.pi + i * math.pi / 24 for i in range(25)]], 0.016, face_mat)
points = [(-0.25, 0, 1.77), (-0.25, 0, 1.93)]
points += [(0.25 * math.cos(a), 0, 1.93 + 0.14 * math.sin(a)) for a in [math.pi - i * math.pi / 32 for i in range(33)]]
points += [(0.25, 0, 1.77)]
line("Carry handle", points, 0.067, handle_mat)
for sign, side in ((-1, "L"), (1, "R")):
    box("Handle mount " + side, (sign * 0.25, 0, 1.80), (0.19, 0.21, 0.08), rim, 0.035)
    ball("Little arm " + side, (sign * 0.81, -0.015, 0.56), (0.14, 0.20, 0.25), shell, J["Shoulder" + side])
    ball("Mitten " + side, (sign * 0.81, -0.06, 0.37), (0.155, 0.18, 0.15), rim, J["Elbow" + side])
    ball("Tiny foot " + side, (sign * 0.39, -0.25, 0.17), (0.235, 0.33, 0.18), rim, J["Knee" + side])
box("Side latch", (0.81, 0.02, 1.16), (0.065, 0.26, 0.34), latch, 0.03)
box("Latch inset", (0.851, -0.015, 1.16), (0.017, 0.06, 0.12), handle_mat, 0.008)
REST = {key: (obj.location.copy(), obj.rotation_euler.copy()) for key, obj in J.items()}
# One friendly wave: raise the right mitten, wave twice, then settle at rest.
ANIMS["wave"] = (60, {
    "ShoulderR": [(0, Z, Z), (10, (0, -2.15, -0.12), (0, 0, 0.16)),
        (18, (0, -2.50, -0.12), (0, 0, 0.16)), (26, (0, -1.85, -0.12), (0, 0, 0.16)),
        (34, (0, -2.50, -0.12), (0, 0, 0.16)), (42, (0, -1.85, -0.12), (0, 0, 0.16)),
        (50, (0, -2.15, -0.12), (0, 0, 0.16)), (60, Z, Z)],
    "ElbowR": [(0, Z, Z), (10, (0, -0.35, 0), Z), (50, (0, -0.35, 0), Z), (60, Z, Z)],
    "Neck": [(0, Z, Z), (12, (0, 0.07, -0.04), Z), (48, (0, 0.07, -0.04), Z), (60, Z, Z)],
})
# Carry's short limbs need a bigger gesture than the executive's celebration.
ANIMS["cheer"] = (64, {
    "Root": [(0, Z, Z), (8, Z, (0, 0, -0.04)), (16, Z, (0, 0, 0.13)),
        (24, Z, Z), (32, Z, (0, 0, -0.03)), (40, Z, (0, 0, 0.13)), (48, Z, Z), (64, Z, Z)],
    "Neck": [(0, Z, Z), (16, (-0.08, 0.08, 0), Z), (40, (-0.08, -0.08, 0), Z), (64, Z, Z)],
    "ShoulderR": [(0, Z, Z), (12, (0, -2.4, 0), (0, 0, 0.2)), (24, (0, -2.1, 0), (0, 0, 0.15)), (40, (0, -2.4, 0), (0, 0, 0.2)), (52, (0, -2.1, 0), (0, 0, 0.15)), (64, Z, Z)],
    "ShoulderL": [(0, Z, Z), (12, (0, 2.4, 0), (0, 0, 0.2)), (24, (0, 2.1, 0), (0, 0, 0.15)), (40, (0, 2.4, 0), (0, 0, 0.2)), (52, (0, 2.1, 0), (0, 0, 0.15)), (64, Z, Z)],
    "ElbowR": [(0, Z, Z), (12, (0, -0.35, 0), Z), (52, (0, -0.35, 0), Z), (64, Z, Z)],
    "ElbowL": [(0, Z, Z), (12, (0, 0.35, 0), Z), (52, (0, 0.35, 0), Z), (64, Z, Z)],
})
# A gentle, seamless loop: look down at the composer and wiggle the mittens.
ANIMS["typing"] = (64, {
    "Neck": [(0, (0.10, 0, 0), Z), (16, (0.14, 0.06, 0), Z), (32, (0.10, 0, 0), Z), (48, (0.14, -0.06, 0), Z), (64, (0.10, 0, 0), Z)],
    "Body": [(0, Z, Z), (32, (0.025, 0, 0), Z), (64, Z, Z)],
    "ShoulderR": [(0, (-0.25, -0.3, 0), Z), (16, (-0.4, -0.5, 0), Z), (32, (-0.25, -0.3, 0), Z), (48, (-0.4, -0.5, 0), Z), (64, (-0.25, -0.3, 0), Z)],
    "ShoulderL": [(0, (-0.4, 0.5, 0), Z), (16, (-0.25, 0.3, 0), Z), (32, (-0.4, 0.5, 0), Z), (48, (-0.25, 0.3, 0), Z), (64, (-0.4, 0.5, 0), Z)],
})
for name, (length, spec) in ANIMS.items():
    keyframes(spec, length)
    stash(name, length)
for joint in J.values():
    for track in joint.animation_data.nla_tracks:
        track.mute = track.name != "idle"
scene.frame_set(0)

target = Vector((0, 0, 1.04))
for name, loc, power, size in (("Key", (-3, -4, 5), 450, 4), ("Fill", (3, -2, 3), 220, 3), ("Rim", (1, 3, 4), 500, 3)):
    bpy.ops.object.light_add(type="AREA", location=loc)
    light = bpy.context.object
    light.name = name
    light.data.energy, light.data.shape, light.data.size = power, "DISK", size
    light.rotation_euler = (target - light.location).to_track_quat("-Z", "Y").to_euler()
bpy.ops.object.camera_add(location=(3.0, -6.5, 2.9))
camera = bpy.context.object
camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.type, camera.data.ortho_scale = "ORTHO", 2.65
scene.camera = camera
scene.render.filepath = str(OUT / "carry.png")
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "carry.blend"))
bpy.ops.render.render(write_still=True)
# Export only model objects. Keep the studio in the saved .blend.
bpy.ops.object.select_all(action="DESELECT")
for obj in bpy.data.objects:
    obj.select_set(obj.type in {"MESH", "EMPTY"})
for joint in J.values():
    for track in joint.animation_data.nla_tracks:
        track.mute = False
bpy.ops.export_scene.gltf(filepath=str(OUT / "carry.glb"), export_format="GLB", use_selection=True,
    export_apply=True, export_animations=True, export_animation_mode="NLA_TRACKS",
    export_optimize_animation_size=False, export_optimize_animation_keep_anim_object=True,
    export_lights=False, export_cameras=False, export_yup=True)
print("Carry exported with reused clips:", ", ".join(ANIMS))

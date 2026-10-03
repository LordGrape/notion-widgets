"""Broadcast executive partner. Run: blender -b --python tools/broadcast/build.py -- <outdir>
Env: BROADCAST_POSE=idle|cheer, BROADCAST_FACES=smug,happy,stern, BROADCAST_VIEWS=front,three"""
import bpy, bmesh, math, sys, os
import numpy as np
from mathutils import Vector, Matrix

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else os.path.dirname(__file__)
os.makedirs(OUT, exist_ok=True)
POSE = os.environ.get("BROADCAST_POSE", "idle")

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1100; scene.render.resolution_y = 1300
scene.render.film_transparent = True
for k, v in (("taa_render_samples", 96), ("use_raytracing", True), ("use_shadows", True)):
    try:
        setattr(scene.eevee, k, v)
    except Exception:
        pass
try:
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Punchy"
except Exception:
    pass

world = bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.78, 0.76, 0.86, 1)
bg.inputs[1].default_value = 0.18


def mat(name, color, rough=0.5, metal=0.0, coat=0.0, coat_rough=0.1, sheen=0.0, sheen_tint=(1, 1, 1)):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    for k, v in {"Base Color": (*color, 1), "Roughness": rough, "Metallic": metal, "Coat Weight": coat,
                 "Coat Roughness": coat_rough, "Sheen Weight": sheen, "Sheen Tint": (*sheen_tint, 1)}.items():
        if k in p.inputs:
            p.inputs[k].default_value = v
    return m


SUIT = mat("Suit", (0.028, 0.025, 0.036), rough=0.5, sheen=0.18, sheen_tint=(0.7, 0.6, 1))
LAPEL = mat("Lapel", (0.034, 0.03, 0.045), rough=0.4, sheen=0.4)
PLASTIC = mat("TV", (0.04, 0.035, 0.05), rough=0.28, coat=0.8, coat_rough=0.08)
LEATHER = mat("Case leather", (0.024, 0.019, 0.032), rough=0.63, coat=0.12)
BEZEL = mat("Bezel", (0.012, 0.01, 0.016), rough=0.35)
GLOVE = mat("Glove", (0.085, 0.075, 0.11), rough=0.38, coat=0.4, coat_rough=0.2)
CUFF = mat("Cuff", (0.55, 0.53, 0.62), rough=0.5)
HAND = mat("Hand", (0.46, 0.44, 0.52), rough=0.3, metal=0.78, coat=0.25)
JOINT = mat("Graphite joints", (0.026, 0.023, 0.035), rough=0.38, metal=0.65)
SHOE = mat("Shoe", (0.018, 0.016, 0.022), rough=0.26, coat=0.65, coat_rough=0.16)
SOLE = mat("Sole", (0.013, 0.011, 0.017), rough=0.65)
WAISTCOAT = mat("Waistcoat", (0.045, 0.037, 0.059), rough=0.65)
SEAM = mat("Tailoring seams", (0.065, 0.054, 0.078), rough=0.7)
SIGNAL = mat("Hand signal", (0.36, 0.13, 0.85), rough=0.3)
signal_bsdf = SIGNAL.node_tree.nodes["Principled BSDF"]
signal_bsdf.inputs["Emission Color"].default_value = (0.36, 0.13, 0.85, 1)
signal_bsdf.inputs["Emission Strength"].default_value = 2.5
SHIRT = mat("Shirt", (0.88, 0.86, 0.95), rough=0.6)
TIE = mat("Tie", (0.36, 0.13, 0.85), rough=0.3, coat=0.6)
METAL = mat("Metal", (0.7, 0.68, 0.76), rough=0.2, metal=1.0)


def activate(o):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


def apply_tf(o):
    activate(o)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def apply_mod(o, name):
    activate(o)
    bpy.ops.object.modifier_apply(modifier=name)


def finish(o, m, sub=1):
    for poly in o.data.polygons:
        poly.use_smooth = True
    if sub:
        o.modifiers.new("Sub", "SUBSURF").levels = sub
    o.data.materials.clear()
    o.data.materials.append(m)
    return o


def ellipsoid(name, loc, scale, m, rot=(0, 0, 0), sub=1):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=14, radius=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    apply_tf(o)
    return finish(o, m, sub)


def rounded_box(name, loc, dims, m, bevel, segments=8, apply=True):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = dims
    apply_tf(o)
    b = o.modifiers.new("Bevel", "BEVEL")
    b.width = bevel
    b.segments = segments
    b.limit_method = "NONE"
    if apply:
        apply_mod(o, "Bevel")
    for poly in o.data.polygons:
        poly.use_smooth = True
    o.data.materials.append(m)
    return o


def capsule(name, p1, p2, r1, r2, m, seg=22, sub=1):
    """Tapered capsule between two points with rounded ends."""
    p1, p2 = Vector(p1), Vector(p2)
    axis = p2 - p1
    L = axis.length
    d = axis.normalized()
    u = d.orthogonal().normalized()
    v = d.cross(u)
    prof = [(r1 * math.sin(a), max(1e-3, r1 * math.cos(a))) for a in np.linspace(-math.pi / 2, 0, 7)]
    prof += [(L * t, r1 + (r2 - r1) * t) for t in np.linspace(0.2, 0.8, 4)]
    prof += [(L + r2 * math.sin(a), max(1e-3, r2 * math.cos(a))) for a in np.linspace(0, math.pi / 2, 7)]
    bm = bmesh.new()
    rings = []
    for z, r in prof:
        ring = []
        for i in range(seg):
            ang = 2 * math.pi * i / seg
            ring.append(bm.verts.new(p1 + d * z + (u * math.cos(ang) + v * math.sin(ang)) * r))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(seg):
            bm.faces.new((a[i], a[(i + 1) % seg], b[(i + 1) % seg], b[i]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    bpy.ops.object.select_all(action="DESELECT")
    return finish(o, m, sub)


# ---------- face texture ----------
def blur(a, r):
    for axis in (0, 1):
        for _ in range(3):
            pad = [(r + 1, r) if i == axis else (0, 0) for i in range(2)]
            c = np.cumsum(np.pad(a, pad, mode="edge"), axis=axis)
            n = c.shape[axis]
            a = (np.take(c, range(2 * r + 1, n), axis=axis) - np.take(c, range(0, n - 2 * r - 1), axis=axis)) / (2 * r + 1)
    return a


def face_image(kind, W=640, H=460):
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    cx, cy = W / 2, H / 2
    r = np.sqrt(((x - cx) / W) ** 2 + ((y - cy) / H) ** 2)
    base = np.stack([0.17 - r * 0.2, 0.05 - r * 0.05, 0.36 - r * 0.4], -1).clip(0.015, 1)
    mask = np.zeros((H, W), np.float32)

    def ellipse(ex, ey, rx, ry):
        return ((x - ex) / rx) ** 2 + ((y - ey) / ry) ** 2 <= 1

    if kind == "smug":
        for ex, sign in ((200, 1), (440, -1)):
            mask[ellipse(ex, 190, 78, 50) & (y > (190 - 30) + sign * 0.45 * (x - ex))] = 1
        d = np.sqrt((x - cx) ** 2 + (y - 95) ** 2)
        mask[(np.abs(d - 255) < 17) & (y > 290) & (np.abs(x - cx) < 190)] = 1
        mask[(y > 338) & (y < 382) & (np.abs(x - 392) < (382 - y) * 0.36)] = 1
    elif kind == "happy":
        for ex in (200, 440):
            d = np.sqrt((x - ex) ** 2 + (y - 220) ** 2)
            mask[(np.abs(d - 58) < 15) & (y < 220)] = 1
        mask[ellipse(cx, 295, 135, 95) & (y > 295)] = 1
    elif kind == "stern":
        for ex in (200, 440):
            mask[ellipse(ex, 205, 70, 18)] = 1
        mask[(np.abs(y - 335) < 11) & (np.abs(x - cx) < 120)] = 1
    glow = blur(mask, 12)
    img = base + glow[..., None] * np.array([0.7, 0.42, 1.0]) * 1.6
    img = img * (1 - mask[..., None]) + np.array([0.96, 0.9, 1.0]) * mask[..., None]
    img *= (1 - 0.2 * ((y.astype(int) // 3) % 2 == 0))[..., None]
    rgba = np.concatenate([img.clip(0, 1), np.ones((H, W, 1), np.float32)], -1)[::-1]
    im = bpy.data.images.new(f"face_{kind}", W, H)
    im.pixels.foreach_set(rgba.astype(np.float32).ravel())
    im.filepath_raw = os.path.join(OUT, f"face_{kind}.png")
    im.file_format = "PNG"
    im.save()
    return im


FACES = {k: face_image(k) for k in ("smug", "happy", "stern")}
SCREEN = bpy.data.materials.new("Screen")
SCREEN.use_nodes = True
nt = SCREEN.node_tree
p = nt.nodes["Principled BSDF"]
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = FACES["smug"]
nt.links.new(tex.outputs["Color"], p.inputs["Emission Color"])
p.inputs["Emission Strength"].default_value = 3.2
p.inputs["Base Color"].default_value = (0, 0, 0, 1)
p.inputs["Roughness"].default_value = 0.12
p.inputs["Coat Weight"].default_value = 1.0
p.inputs["Coat Roughness"].default_value = 0.02

# ---------- head: executive suitcase with a live face panel ----------
HZ = 2.62
head = rounded_box("Head", (0, 0, HZ), (1.92, 0.58, 1.22), LEATHER, bevel=0.14, segments=8)
cut = rounded_box("Cutter", (0, -0.35, HZ - 0.025), (1.43, 0.3, 0.84), BEZEL, bevel=0.10, segments=8)
cut.hide_render = cut.hide_viewport = True
bm_ = head.modifiers.new("Recess", "BOOLEAN")
bm_.object = cut
bm_.operation = "DIFFERENCE"
apply_mod(head, "Recess")
head.modifiers.new("Weighted", "WEIGHTED_NORMAL")
back = rounded_box("HeadBack", (0, 0.22, HZ), (1.88, 0.20, 1.18), LEATHER, bevel=0.085)
inner = rounded_box("ScreenWell", (0, -0.205, HZ - 0.025), (1.45, 0.035, 0.86), BEZEL, bevel=0.06, segments=4)

bpy.ops.mesh.primitive_plane_add(size=1, location=(0, -0.235, HZ - 0.025), rotation=(math.pi / 2, 0, 0))
screen = bpy.context.object
screen.scale = (1.35, 0.76, 1)
apply_tf(screen)
bm = bmesh.new()
bm.from_mesh(screen.data)
bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=24, use_grid_fill=True)
for vtx in bm.verts:
    vtx.co.y -= 0.015 * (1 - (vtx.co.x / 0.675) ** 2) * (1 - (vtx.co.z / 0.38) ** 2)
bm.to_mesh(screen.data)
bm.free()
finish(screen, SCREEN, 0)

def case_curve(name, points, radius, material):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth, curve.bevel_resolution = radius, 3
    spline = curve.splines.new("POLY")
    spline.points.add(len(points)-1)
    for point, position in zip(spline.points, points):
        point.co = (*position, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(material)
    activate(obj)
    bpy.ops.object.convert(target="MESH")
    return bpy.context.object

# One continuous handle and a fine opening seam, all attached to Neck.
handle = [(-0.32, 0, HZ + 0.62), (-0.32, 0, HZ + 0.76)]
handle += [(0.32 * math.cos(a), 0, HZ + 0.76 + 0.16 * math.sin(a)) for a in np.linspace(math.pi, 0, 25)]
handle.append((0.32, 0, HZ + 0.62))
case_curve("CaseHandle", handle, 0.053, LEATHER)
outline = []
for cx, cz, start in ((0.79, 0.44, 0), (-0.79, 0.44, 90), (-0.79, -0.44, 180), (0.79, -0.44, 270)):
    outline += [(cx + 0.115*math.cos(a), 0.13, HZ + cz + 0.115*math.sin(a)) for a in np.linspace(math.radians(start), math.radians(start+90), 12)]
case_curve("CaseSeam", outline+[outline[0]], 0.012, JOINT)
for s in (-1, 1):
    rounded_box(f"CaseMount{s}", (s*0.32, 0, HZ+0.61), (0.18, 0.17, 0.10), METAL, 0.027)
    rounded_box(f"CaseClasp{s}", (s*0.62, -0.295, HZ+0.46), (0.23, 0.045, 0.095), METAL, 0.022)
    for z in (-0.48, 0.48):
        rounded_box(f"CaseCorner{s}_{z}", (s*0.84, -0.257, HZ+z), (0.17, 0.095, 0.19), METAL, 0.055)

# ---------- body: broad, tapered jacket ----------
TZ = 1.42
torso = rounded_box("Torso", (0, 0, TZ), (1.34, 0.78, 1.1), SUIT, bevel=0.36, segments=10)
for vtx in torso.data.vertices:
    t = (vtx.co.z) / 0.55
    vtx.co.x *= 1 + 0.2 * t
    vtx.co.y *= 1 + 0.05 * t
finish(torso, SUIT, 1)
for side in (-1, 1):
    ellipsoid(f"Deltoid{side}", (side * 0.76, 0, 1.86), (0.31, 0.31, 0.28), SUIT)


def front_piece(name, pts, m, offset):
    me = bpy.data.meshes.new(name)
    me.from_pydata([Vector((q[0], q[1], min(q[2], 1.965))) for q in pts], [], [list(range(len(pts)))])
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    bm2 = bmesh.new()
    bm2.from_mesh(me)
    bmesh.ops.triangulate(bm2, faces=bm2.faces[:])
    bmesh.ops.subdivide_edges(bm2, edges=bm2.edges[:], cuts=8, use_grid_fill=True)
    bm2.to_mesh(me)
    bm2.free()
    sw = o.modifiers.new("Wrap", "SHRINKWRAP")
    sw.target = torso
    sw.wrap_method = "PROJECT"
    sw.use_project_y = True
    sw.use_positive_direction = True
    sw.use_negative_direction = False
    sw.offset = offset
    o.modifiers.new("Solid", "SOLIDIFY").thickness = 0.018
    return finish(o, m, 0)


front_piece("Shirt", [(-0.3, -0.6, 1.98), (0.3, -0.6, 1.98), (0.0, -0.6, 1.16)], SHIRT, 0.006)
front_piece("Tie", [(-0.065, -0.6, 1.9), (0.065, -0.6, 1.9), (0.12, -0.6, 1.36), (0.0, -0.6, 1.22), (-0.12, -0.6, 1.36)], TIE, 0.024)
front_piece("Waistcoat", [(-0.3, -0.6, 1.88), (0, -0.6, 1.43), (0.3, -0.6, 1.88), (0.32, -0.6, 1.02), (0.12, -0.6, 0.95), (0, -0.6, 1.03), (-0.12, -0.6, 0.95), (-0.32, -0.6, 1.02)], WAISTCOAT, 0.034)
front_piece("LapelL", [(-0.34, -0.6, 2.0), (-0.15, -0.6, 1.15), (-0.54, -0.6, 1.65), (-0.42, -0.6, 1.68), (-0.51, -0.6, 1.85)], LAPEL, 0.055)
front_piece("LapelR", [(0.34, -0.6, 2.0), (0.51, -0.6, 1.85), (0.42, -0.6, 1.68), (0.54, -0.6, 1.65), (0.15, -0.6, 1.15)], LAPEL, 0.055)
front_piece("CollarL", [(-0.31, -0.6, 2.03), (-0.05, -0.6, 1.97), (-0.2, -0.6, 1.83)], SHIRT, 0.022)
front_piece("CollarR", [(0.31, -0.6, 2.03), (0.2, -0.6, 1.83), (0.05, -0.6, 1.97)], SHIRT, 0.022)
front_piece("Pocket", [(0.42, -0.6, 1.62), (0.58, -0.6, 1.62), (0.5, -0.6, 1.72)], SHIRT, 0.036)
ellipsoid("TieKnot", (0, -0.46, 1.85), (0.075, 0.035, 0.06), TIE, sub=0)
front_piece("TieBar", [(-0.09, -0.6, 1.61), (0.09, -0.6, 1.61), (0.09, -0.6, 1.58), (-0.09, -0.6, 1.58)], METAL, 0.065)
for z in (1.34, 1.20, 1.07):
    front_piece("Button", [(-0.025, -0.6, z + 0.025), (0.025, -0.6, z + 0.025), (0.025, -0.6, z - 0.025), (-0.025, -0.6, z - 0.025)], BEZEL, 0.062)
for s in (-1, 1):
    front_piece(f"PocketFlap{s}", [(s * 0.33, -0.6, 1.24), (s * 0.57, -0.6, 1.28), (s * 0.56, -0.6, 1.17), (s * 0.33, -0.6, 1.13)], LAPEL, 0.048)

# ---------- arms and legs ----------
def make_hand(s, wrist, direction, curl):
    """Separate silver phalanges and graphite joints, pointing down -Z.
    Joined with material slots intact so the existing elbow rig animates it."""
    parts = [
        capsule(f"Wrist{s}", (0, 0, 0.035), (0, 0, -0.065), 0.065, 0.075, JOINT, seg=16, sub=0),
        rounded_box(f"Palm{s}", (0, 0, -0.12), (0.16, 0.24, 0.2), HAND, 0.055, segments=4),
    ]
    for i, (y, length) in enumerate(((-0.09, 0.145), (-0.03, 0.17), (0.03, 0.16), (0.09, 0.125))):
        base = Vector((0, y, -0.22))
        mid = base + Vector((-s * 0.016, 0, -length * 0.52))
        tip = mid + Vector((-s * (0.035 + curl * 0.035), 0, -length * 0.33))
        for j, (a, b) in enumerate(((base, mid), (mid, tip))):
            delta = (b - a).normalized()
            parts.append(capsule(f"Finger{i}_{j}", a + delta * 0.009, b - delta * 0.009, 0.025, 0.023, HAND, seg=12, sub=0))
        for point in (base, mid):
            parts.append(ellipsoid("Knuckle", point, (0.027, 0.027, 0.027), JOINT, sub=0))
    t0 = Vector((-s * 0.045, -0.115, -0.105))
    t1 = t0 + Vector((-s * 0.07, -0.055, -0.055))
    t2 = t1 + Vector((-s * 0.025, 0.025, -0.085))
    parts.extend((capsule("ThumbBase", t0, t1, 0.034, 0.031, HAND, seg=16, sub=0),
                  ellipsoid("ThumbJoint", t1, (0.034, 0.034, 0.034), JOINT, sub=0),
                  capsule("ThumbTip", t1 + (t2-t1).normalized()*0.018, t2, 0.03, 0.026, HAND, seg=16, sub=0)))
    parts.append(ellipsoid("SignalSocket", (s * 0.083, 0, -0.105), (0.013, 0.061, 0.061), JOINT, sub=0))
    bpy.ops.mesh.primitive_torus_add(major_segments=24, minor_segments=8, location=(s * 0.096, 0, -0.105), rotation=(0, math.pi / 2, 0), major_radius=0.043, minor_radius=0.008)
    parts.append(finish(bpy.context.object, SIGNAL, 0))
    # Bake primitives into the same local frame before joining.
    for part in parts:
        activate(part)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    hand_obj = bpy.context.object
    hand_obj.name = f"Hand{s}"
    for mod in list(hand_obj.modifiers):
        hand_obj.modifiers.remove(mod)
    for poly in hand_obj.data.polygons:
        poly.use_smooth = True
    # Local geometry already mirrors by side, so the frame must not mirror again.
    zt = -direction.normalized()
    xt = Vector((0, s, 0)) if POSE == "cheer" else Vector((1, 0, 0))
    xt = (xt - zt * xt.dot(zt)).normalized()
    yt = zt.cross(xt)
    hand_obj.rotation_mode = "QUATERNION"
    hand_obj.rotation_quaternion = Matrix((xt, yt, zt)).transposed().to_quaternion()
    hand_obj.location = wrist
    hand_obj.scale = (1.3, 1.3, 1.3)
    return hand_obj


def make_shoe(s):
    """Leather double-monk upper, thin welt, heel and two silver buckles."""
    x = s * 0.35
    profiles = [(-0.59, 0.015, 0.15), (-0.55, 0.16, 0.23), (-0.43, 0.25, 0.28), (-0.25, 0.27, 0.31), (-0.1, 0.245, 0.36), (0.05, 0.225, 0.40), (0.23, 0.215, 0.37), (0.30, 0.14, 0.30), (0.32, 0.01, 0.2)]
    vertices, faces = [], []
    count = 18
    for y, width, top in profiles:
        for i in range(count):
            a = 2 * math.pi * i / count
            vertices.append((x + width * math.cos(a), y, 0.125 + (top - 0.125) * max(0, math.sin(a))))
    for row in range(len(profiles)-1):
        for i in range(count):
            faces.append((row*count+i, row*count+(i+1)%count, (row+1)*count+(i+1)%count, (row+1)*count+i))
    faces.extend((tuple(reversed(range(count))), tuple((len(profiles)-1)*count+i for i in range(count))))
    me = bpy.data.meshes.new(f"Shoe{s}")
    me.from_pydata(vertices, [], faces)
    shoe = bpy.data.objects.new(f"Shoe{s}", me)
    bpy.context.collection.objects.link(shoe)
    finish(shoe, SHOE, 1)
    ellipsoid(f"Sole{s}", (x, -0.13, 0.09), (0.283, 0.465, 0.048), SOLE, sub=0)
    rounded_box(f"Shoe{s}Heel", (x, 0.14, 0.035), (0.43, 0.3, 0.07), SOLE, 0.018)
    for i, y in enumerate((-0.12, 0.045)):
        top, width = 0.361 + i * 0.04, 0.245 - i * 0.02
        points = [(x + dx, y, 0.135 + (top - 0.125) * math.sqrt(1 - (dx/width)**2)) for dx in np.linspace(-width*0.88, width*0.88, 15)]
        for j, (a, b) in enumerate(zip(points, points[1:])):
            capsule(f"Shoe{s}Strap{i}_{j}", a, b, 0.023, 0.023, SHOE, seg=8, sub=0)
        bx, by, bz = x + s * 0.12, y - 0.003, 0.15 + (top - 0.125) * math.sqrt(1-(0.12/width)**2)
        for j, (loc, dims) in enumerate((((bx - 0.049, by, bz), (0.013, 0.088, 0.013)), ((bx + 0.049, by, bz), (0.013, 0.088, 0.013)), ((bx, by - 0.04, bz), (0.11, 0.013, 0.013)), ((bx, by + 0.04, bz), (0.11, 0.013, 0.013)), ((bx, by, bz), (0.012, 0.074, 0.015)))):
            rounded_box(f"Shoe{s}Buckle{i}_{j}", loc, dims, METAL, 0.005, segments=3)


for s in (-1, 1):
    sh = Vector((s * 0.8, 0, 1.84))
    if POSE == "cheer":
        el, wr, hand = Vector((s * 1.16, -0.02, 2.12)), Vector((s * 1.26, -0.06, 2.55)), Vector((s * 1.28, -0.08, 2.72))
    else:
        el, wr, hand = Vector((s * 0.9, 0.06, 1.4)), Vector((s * 0.87, -0.04 - 0.04 * (s < 0), 1.0)), None
    capsule(f"Upper{s}", sh, el, 0.245, 0.205, SUIT)
    capsule(f"Fore{s}", el, wr, 0.225, 0.18, SUIT)
    d = (wr - el).normalized()
    capsule(f"ShirtCuff{s}", wr - d * 0.02, wr + d * 0.09, 0.155, 0.145, SHIRT)
    make_hand(s, wr + d * 0.08, d, 0.15 if POSE == "cheer" else 0.55)
    capsule(f"Leg{s}", (s * 0.32, 0, 0.98), (s * 0.34, 0, 0.4), 0.25, 0.21, SUIT)
    capsule(f"Leg{s}Crease", (s * 0.32, -0.242, 0.88), (s * 0.34, -0.207, 0.44), 0.007, 0.006, SEAM, seg=8, sub=0)
    make_shoe(s)


# =====================================================================
# Rig, animate, export (appended to the approved model script)
# =====================================================================
import numpy as np

for name in ("Cutter",):
    if name in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
for o in bpy.data.objects:
    if o.type == "MESH" and o.data.materials and o.data.materials[0] and o.data.materials[0].name == "Screen":
        o.name = "Screen"


def empty(name, loc, parent=None):
    bpy.ops.object.empty_add(type="PLAIN_AXES", radius=0.1, location=loc)
    e = bpy.context.object
    e.name = name
    if parent:
        e.parent = parent
        e.matrix_parent_inverse = parent.matrix_world.inverted()
    return e


def parent_to(obj, joint):
    mw = obj.matrix_world.copy()
    obj.parent = joint
    obj.matrix_parent_inverse = joint.matrix_world.inverted()
    obj.matrix_world = mw


root = empty("Root", (0, 0, 0))
body = empty("Body", (0, 0, 1.0), root)
neck = empty("Neck", (0, 0, 1.98), body)
J = {"Root": root, "Body": body, "Neck": neck}
for s in (-1, 1):
    side = "R" if s > 0 else "L"
    sh = empty(f"Shoulder{side}", (s * 0.8, 0, 1.84), body)
    el = empty(f"Elbow{side}", (s * 0.9, 0.06, 1.4), sh)
    hip = empty(f"Hip{side}", (s * 0.32, 0, 0.98), root)
    J[f"Shoulder{side}"], J[f"Elbow{side}"], J[f"Hip{side}"] = sh, el, hip

HEAD_PARTS = ("Head", "HeadBack", "ScreenWell", "Screen", "Case")
BODY_PARTS = ("Torso", "Deltoid", "Shirt", "Tie", "Lapel", "Collar", "Pocket", "TieKnot", "Button", "Waistcoat")
for o in list(bpy.data.objects):
    if o.type != "MESH" or o.parent:
        continue
    n = o.name
    limb = any(n.startswith(p) for p in ("Upper", "Fore", "ShirtCuff", "Hand", "Leg", "Shoe", "Sole"))
    if n.startswith(HEAD_PARTS):
        parent_to(o, neck)
    elif n.startswith(BODY_PARTS) and not limb:
        parent_to(o, body)
    else:
        for s in (-1, 1):
            side = "R" if s > 0 else "L"
            if n.startswith(f"Upper{s}"):
                parent_to(o, J[f"Shoulder{side}"])
            elif n.startswith((f"Fore{s}", f"ShirtCuff{s}", f"Hand{s}")):
                parent_to(o, J[f"Elbow{side}"])
            elif n.startswith((f"Leg{s}", f"Shoe{s}", f"Sole{s}")):
                parent_to(o, J[f"Hip{side}"])
orphans = [o.name for o in bpy.data.objects if o.type == "MESH" and not o.parent]
print("ORPHANS", orphans)
assert not orphans, f"Unrigged model parts: {orphans}"

REST = {k: (v.location.copy(), v.rotation_euler.copy()) for k, v in J.items()}
scene.render.fps = 24


def reset():
    for k, j in J.items():
        j.location, j.rotation_euler = REST[k][0].copy(), REST[k][1].copy()


def keyframes(spec, length):
    """spec: {joint: [(frame, (rx, ry, rz), (dx, dy, dz))]} relative to rest."""
    reset()
    for k, j in J.items():
        frames = spec.get(k) or [(0, (0, 0, 0), (0, 0, 0)), (length, (0, 0, 0), (0, 0, 0))]
        for frame, rot, off in frames:
            j.rotation_euler = (REST[k][1][0] + rot[0], REST[k][1][1] + rot[1], REST[k][1][2] + rot[2])
            j.location = REST[k][0] + Vector(off)
            j.keyframe_insert("rotation_euler", frame=frame)
            j.keyframe_insert("location", frame=frame)


def stash(name, length):
    for k, j in J.items():
        ad = j.animation_data
        act = ad.action
        act.name = f"{name}_{k}"
        track = ad.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 0, act)
        strip.frame_end = length
        track.mute = True
        ad.action = None
    reset()


Z = (0, 0, 0)
ANIMS = {}
ANIMS["idle"] = (96, {
    "Root": [(0, Z, Z), (48, Z, (0, 0, 0.03)), (96, Z, Z)],
    "Body": [(0, Z, Z), (48, (0.02, 0, 0), Z), (96, Z, Z)],
    "Neck": [(0, Z, Z), (30, (0.03, 0.04, 0.05), Z), (66, (-0.02, -0.03, -0.04), Z), (96, Z, Z)],
    "ShoulderR": [(0, Z, Z), (48, (0, -0.04, 0), Z), (96, Z, Z)],
    "ShoulderL": [(0, Z, Z), (48, (0, 0.04, 0), Z), (96, Z, Z)],
})
ANIMS["talk"] = (48, {
    "Root": [(0, Z, Z), (12, Z, (0, 0, 0.015)), (24, Z, Z), (36, Z, (0, 0, 0.015)), (48, Z, Z)],
    "Neck": [(0, Z, Z), (12, (0.09, 0, 0.04), Z), (24, (-0.02, 0, -0.03), Z), (36, (0.07, 0, 0.05), Z), (48, Z, Z)],
    "ShoulderR": [(0, (-0.3, -0.15, 0), Z), (24, (-0.38, -0.2, 0), Z), (48, (-0.3, -0.15, 0), Z)],
    "ElbowR": [(0, (-0.7, 0, 0), Z), (12, (-1.05, 0, 0.15), Z), (24, (-0.75, 0, 0), Z), (36, (-1.1, 0, -0.1), Z), (48, (-0.7, 0, 0), Z)],
    "ShoulderL": [(0, Z, Z), (24, (-0.08, 0.04, 0), Z), (48, Z, Z)],
    "ElbowL": [(0, (-0.15, 0, 0), Z), (24, (-0.3, 0, 0), Z), (48, (-0.15, 0, 0), Z)],
})
up = 2.55
ANIMS["cheer"] = (32, {
    "Root": [(0, Z, Z), (8, Z, (0, 0, 0.14)), (16, Z, Z), (24, Z, (0, 0, 0.14)), (32, Z, Z)],
    "Neck": [(0, (-0.12, 0, 0), Z), (32, (-0.12, 0, 0), Z)],
    "ShoulderR": [(0, (0, -up, 0), Z), (8, (0, -up - 0.15, 0), Z), (16, (0, -up, 0), Z), (24, (0, -up - 0.15, 0), Z), (32, (0, -up, 0), Z)],
    "ShoulderL": [(0, (0, up, 0), Z), (8, (0, up + 0.15, 0), Z), (16, (0, up, 0), Z), (24, (0, up + 0.15, 0), Z), (32, (0, up, 0), Z)],
    "ElbowR": [(0, (0, -0.35, 0), Z), (32, (0, -0.35, 0), Z)],
    "ElbowL": [(0, (0, 0.35, 0), Z), (32, (0, 0.35, 0), Z)],
})
ANIMS["slump"] = (48, {
    "Root": [(0, Z, (0, 0, -0.04)), (24, Z, (0, 0, -0.06)), (48, Z, (0, 0, -0.04))],
    "Body": [(0, (0.16, 0, 0), Z), (24, (0.2, 0, 0), Z), (48, (0.16, 0, 0), Z)],
    "Neck": [(0, (0.34, 0, 0.05), Z), (24, (0.38, 0, -0.05), Z), (48, (0.34, 0, 0.05), Z)],
    "ShoulderR": [(0, (-0.12, 0.1, 0), Z), (48, (-0.12, 0.1, 0), Z)],
    "ShoulderL": [(0, (-0.12, -0.1, 0), Z), (48, (-0.12, -0.1, 0), Z)],
})
ANIMS["run"] = (16, {
    "Root": [(0, Z, Z), (4, Z, (0, 0, 0.1)), (8, Z, Z), (12, Z, (0, 0, 0.1)), (16, Z, Z)],
    "Body": [(0, (0.2, 0, 0.06), Z), (8, (0.2, 0, -0.06), Z), (16, (0.2, 0, 0.06), Z)],
    "Neck": [(0, (-0.12, 0, 0), Z), (16, (-0.12, 0, 0), Z)],
    "HipR": [(0, (-0.65, 0, 0), Z), (8, (0.65, 0, 0), Z), (16, (-0.65, 0, 0), Z)],
    "HipL": [(0, (0.65, 0, 0), Z), (8, (-0.65, 0, 0), Z), (16, (0.65, 0, 0), Z)],
    "ShoulderR": [(0, (0.7, 0, 0), Z), (8, (-0.7, 0, 0), Z), (16, (0.7, 0, 0), Z)],
    "ShoulderL": [(0, (-0.7, 0, 0), Z), (8, (0.7, 0, 0), Z), (16, (-0.7, 0, 0), Z)],
    "ElbowR": [(0, (-1.3, 0, 0), Z), (16, (-1.3, 0, 0), Z)],
    "ElbowL": [(0, (-1.3, 0, 0), Z), (16, (-1.3, 0, 0), Z)],
})

# ---------- lights and camera for preview renders ----------
bpy.ops.object.empty_add(location=(0, 0, 1.7))
target = bpy.context.object
target.name = "CamTarget"


def area(name, loc, energy, color, size):
    bpy.ops.object.light_add(type="AREA", location=loc)
    l = bpy.context.object
    l.name = name
    l.data.energy, l.data.color, l.data.size = energy, color, size
    l.constraints.new("TRACK_TO").target = target


area("Key", (-3.6, -5.0, 5.4), 1500, (1, 0.96, 0.93), 3.5)
area("Fill", (4.8, -3.8, 2.2), 420, (0.82, 0.86, 1), 4)
area("RimL", (-3.2, 3.8, 4.2), 1500, (0.66, 0.42, 1), 2.5)
area("RimR", (3.4, 3.6, 3.6), 1300, (0.85, 0.5, 1), 2.5)
area("Top", (0, 0.5, 7), 500, (1, 1, 1), 5)
bpy.ops.object.camera_add()
cam = bpy.context.object
scene.camera = cam
cam.constraints.new("TRACK_TO").target = target

PREVIEW = os.environ.get("PREVIEW", "1") == "1"
for name, (length, spec) in ANIMS.items():
    keyframes(spec, length)
    if name == "run" and os.environ.get("RENDER_RUN", "1") == "1":
        # Sprite sheet for the loading screen.
        run_w = int(os.environ.get("RUN_W", "300"))
        scene.render.resolution_x, scene.render.resolution_y = run_w, round(run_w * 1.1)
        scene.eevee.taa_render_samples = int(os.environ.get("RUN_SAMPLES", "48"))
        cam.data.lens = 100
        cam.location = (-8.5, -9.5, 2.6)
        target.location = (0, 0, 1.72)
        frames = []
        for f in range(0, 16):
            scene.frame_set(f)
            path = os.path.join(OUT, f"run_{f:02d}.png")
            scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            frames.append(path)
        imgs = [bpy.data.images.load(p) for p in frames]
        w, h = imgs[0].size
        sheet = np.zeros((h, w * len(imgs), 4), np.float32)
        for i, im in enumerate(imgs):
            px = np.array(im.pixels[:], np.float32).reshape(h, w, 4)
            sheet[:, i * w:(i + 1) * w] = px
        out = bpy.data.images.new("run_sheet", w * len(imgs), h, alpha=True)
        out.pixels.foreach_set(sheet.ravel())
        out.filepath_raw = os.path.join(OUT, "broadcast-run.png")
        out.file_format = "PNG"
        out.save()
    elif PREVIEW and name in os.environ.get("PREVIEW_CLIPS", "idle,talk,cheer,slump").split(","):
        scene.render.resolution_x, scene.render.resolution_y = 500, 560
        scene.eevee.taa_render_samples = 48
        cam.data.lens = 75
        cam.location = (-6.4, -9.4, 2.9)
        target.location = (0, 0, 1.75)
        for f in (0, length // 4, length // 2):
            scene.frame_set(f)
            scene.render.filepath = os.path.join(OUT, f"anim_{name}_{f:02d}.png")
            bpy.ops.render.render(write_still=True)
    stash(name, length)

# ---------- export ----------
# Keep a usable studio scene in the editable file; the web export excludes it.
for j in J.values():
    for track in j.animation_data.nla_tracks:
        track.mute = track.name != "idle"
scene.frame_set(0)
cam.data.lens = 75
cam.location = (-6.4, -9.4, 2.9)
target.location = (0, 0, 1.75)
scene.render.resolution_x, scene.render.resolution_y = 1000, 1120
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "broadcast_rigged.blend"))
for o in list(bpy.data.objects):
    if o.type in ("LIGHT", "CAMERA") or o.name == "CamTarget":
        bpy.data.objects.remove(o, do_unlink=True)
for k, j in J.items():
    for t in j.animation_data.nla_tracks:
        t.mute = False
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, "broadcast.glb"),
    export_format="GLB",
    export_apply=True,
    export_animations=True,
    export_animation_mode="NLA_TRACKS",
    export_optimize_animation_size=False,
    export_optimize_animation_keep_anim_object=True,
    export_lights=False,
    export_cameras=False,
    export_yup=True,
)
print("EXPORTED")

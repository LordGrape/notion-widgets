"""Loading-screen scenes for Command Centre: Broadcast running, billing hours at a laptop,
meditating in mid-air, juggling a football and dribbling a basketball.

Executed by build.py after the clips are stashed (it shares build.py's globals: J, REST, reset,
cam, target, mat, rounded_box, capsule, ellipsoid, FACES, tex, OUT...). Every scene is a pure
function of the frame, keyed on every frame, so loops are seamless and the props stay in sync.
Frames are written to <outdir>/scenes/<scene>_NN.png; tools/broadcast/sprite.cjs packs them.
Props, actions and the Cycles setup are removed again before build.py saves and exports.

Env: SCENES=run,laptop,... SCENE_W=720 (frame width, height is 1.1x), SCENE_SAMPLES=128,
     SCENE_FRAMES=0,12 (render only these frames, for quick looks)."""

TAU = 2 * math.pi
SCENE_LIST = [n for n in os.environ.get("SCENES", "run,laptop,meditate,soccer,basketball").split(",") if n]
SCENE_W = int(os.environ.get("SCENE_W", "720"))
SCENE_DIR = os.path.join(OUT, "scenes")
os.makedirs(SCENE_DIR, exist_ok=True)
ONLY = {int(f) for f in os.environ.get("SCENE_FRAMES", "").split(",") if f}

# ---------- renderer ----------
scene.render.engine = "CYCLES"
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type == kind]
            if gpus:
                for d in prefs.devices:
                    d.use = d.type == kind
                scene.cycles.device = "GPU"
                print("CYCLES DEVICE", kind)
                break
        except Exception:
            continue
except Exception as error:
    print("CYCLES CPU", error)
scene.cycles.samples = int(os.environ.get("SCENE_SAMPLES", "128"))
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 6
scene.render.use_persistent_data = True
scene.render.film_transparent = True
scene.render.use_motion_blur = True
scene.render.motion_blur_shutter = 0.45
scene.render.resolution_x, scene.render.resolution_y = SCENE_W, round(SCENE_W * 1.1)
bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
# A matte face reads better at sprite size than one mirroring the studio.
screen_bsdf = SCREEN.node_tree.nodes["Principled BSDF"]
SCREEN_COAT = screen_bsdf.inputs["Coat Weight"].default_value
screen_bsdf.inputs["Coat Weight"].default_value = 0.3

# The floor is invisible but keeps every contact shadow.
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
floor = bpy.context.object
floor.name = "SceneFloor"
floor.is_shadow_catcher = True

PROPS = [floor]
# Only the key and top lights cast shadows; the rims would throw long ones at the camera.
LIGHT_SHADOWS = {o.name: o.data.use_shadow for o in bpy.data.objects if o.type == "LIGHT"}
for o in bpy.data.objects:
    if o.type == "LIGHT":
        o.data.use_shadow = o.name in ("Key", "Top")


def prop(o):
    PROPS.append(o)
    return o


def emit_mat(name, color, strength):
    m = mat(name, (0, 0, 0), rough=0.3)
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Emission Color"].default_value = (*color, 1)
    p.inputs["Emission Strength"].default_value = strength
    return m


def halo_mat(name, color, strength, opacity, power=2.2):
    """Soft radial glow that keeps its alpha on a transparent film."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    coord = nt.nodes.new("ShaderNodeTexCoord")
    grad = nt.nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = "SPHERICAL"
    nt.links.new(coord.outputs["Object"], grad.inputs["Vector"])
    pw = nt.nodes.new("ShaderNodeMath")
    pw.operation = "POWER"
    pw.inputs[1].default_value = power
    nt.links.new(grad.outputs["Fac"], pw.inputs[0])
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = opacity
    nt.links.new(pw.outputs[0], mul.inputs[0])
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color, 1)
    em.inputs["Strength"].default_value = strength
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(mul.outputs[0], mix.inputs["Fac"])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return m


def halo(name, loc, radius, m, face_camera=True, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_plane_add(size=2, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = (radius, radius, radius)
    o.data.materials.append(m)
    o.visible_shadow = False
    o["glow"] = True
    if face_camera:
        c = o.constraints.new("TRACK_TO")
        c.target, c.track_axis, c.up_axis = cam, "TRACK_Z", "UP_Y"
    return prop(o)


def glow_light(o):
    o.visible_shadow = False
    return o


def marker(name, loc, joint):
    """An empty fixed to a joint, used to read where a hand or a shoe is."""
    bpy.ops.object.empty_add(type="PLAIN_AXES", radius=0.05, location=loc)
    e = bpy.context.object
    e.name = name
    e.parent = joint
    e.matrix_parent_inverse = joint.matrix_world.inverted()
    return prop(e)


reset()
bpy.context.view_layer.update()
MARK = {}
for s, side in ((-1, "L"), (1, "R")):
    MARK[f"Toe{side}"] = marker(f"Toe{side}", (s * 0.35, -0.42, 0.34), J[f"Knee{side}"])
    MARK[f"Sole{side}"] = marker(f"Sole{side}", (s * 0.35, -0.5, 0.02), J[f"Knee{side}"])
    MARK[f"Heel{side}"] = marker(f"Heel{side}", (s * 0.35, 0.27, 0.0), J[f"Knee{side}"])
    MARK[f"Palm{side}"] = marker(f"Palm{side}", (s * 0.84, -0.13, 0.66), J[f"Elbow{side}"])


def P(rx=0.0, ry=0.0, rz=0.0, dx=0.0, dy=0.0, dz=0.0):
    return ((rx, ry, rz), (dx, dy, dz))


def apply_pose(pose):
    reset()
    for k, (rot, off) in pose.items():
        j = J[k]
        j.rotation_euler = (REST[k][1][0] + rot[0], REST[k][1][1] + rot[1], REST[k][1][2] + rot[2])
        j.location = REST[k][0] + Vector(off)
    bpy.context.view_layer.update()


def where(name):
    return MARK[name].matrix_world.translation.copy()


def grounded(pose, extra=0.0):
    """Lower or raise Root so the lowest sole touches the floor."""
    apply_pose(pose)
    low = min(where(n).z for n in ("SoleL", "SoleR", "HeelL", "HeelR"))
    rot, off = pose.get("Root", P())
    pose["Root"] = (rot, (off[0], off[1], off[2] - low + extra))
    return pose


def bump(f, centre, width, length):
    """Smooth 0..1 pulse at `centre`, wrapping around the loop."""
    d = (f - centre + length / 2) % length - length / 2
    return 0.5 * (1 + math.cos(math.pi * d / width)) if abs(d) < width else 0.0


def smooth(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def key_pose(pose, f):
    apply_pose(pose)
    for j in J.values():
        j.keyframe_insert("rotation_euler", frame=f)
        j.keyframe_insert("location", frame=f)


def key_obj(o, f, loc=None, rot=None, scale=None):
    if loc is not None:
        o.location = loc
        o.keyframe_insert("location", frame=f)
    if rot is not None:
        o.rotation_euler = rot
        o.keyframe_insert("rotation_euler", frame=f)
    if scale is not None:
        o.scale = scale if hasattr(scale, "__len__") else (scale, scale, scale)
        o.keyframe_insert("scale", frame=f)


def shade(o, m, smooth_shading=True):
    if smooth_shading:
        for poly in o.data.polygons:
            poly.use_smooth = True
    o.data.materials.clear()
    o.data.materials.append(m)
    return prop(o)


def cylinder(name, loc, radius, depth, m, rot=(0, 0, 0), verts=40):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    b = o.modifiers.new("Bevel", "BEVEL")
    b.width, b.segments = min(radius, depth) * 0.18, 3
    o.modifiers.new("Weighted", "WEIGHTED_NORMAL")
    return shade(o, m)


def box(name, loc, dims, m, bevel=0.03):
    o = rounded_box(name, loc, dims, m, bevel, segments=4)
    return prop(o)


def sphere(name, loc, radius, m, segments=48):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=segments // 2, radius=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = (radius, radius, radius)
    return shade(o, m)


# ---------- props ----------
def football(radius):
    white = mat("Football white", (0.86, 0.85, 0.9), rough=0.35, coat=0.5, coat_rough=0.15)
    black = mat("Football panel", (0.03, 0.025, 0.045), rough=0.35, coat=0.5, coat_rough=0.15)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1)
    ico = bpy.context.object
    corners = [v.co.normalized() for v in ico.data.vertices]
    bpy.data.objects.remove(ico, do_unlink=True)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5, radius=1)
    o = bpy.context.object
    o.name = "Football"
    o.data.materials.append(white)
    o.data.materials.append(black)
    limit = math.cos(0.34)
    for poly in o.data.polygons:
        poly.use_smooth = True
        c = poly.center.normalized()
        poly.material_index = 1 if max(c.dot(k) for k in corners) > limit else 0
    o.scale = (radius, radius, radius)
    return prop(o)


def basketball(radius):
    m = bpy.data.materials.new("Basketball")
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Roughness"].default_value = 0.62
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["Object"], sep.inputs[0])

    def op(kind, a, b=None, value=None):
        n = nt.nodes.new("ShaderNodeMath")
        n.operation = kind
        nt.links.new(a, n.inputs[0])
        if b is not None:
            nt.links.new(b, n.inputs[1])
        elif value is not None:
            n.inputs[1].default_value = value
        return n.outputs[0]

    ax = op("ABSOLUTE", sep.outputs["X"])
    ay = op("ABSOLUTE", sep.outputs["Y"])
    az = op("ABSOLUTE", op("SUBTRACT", op("ABSOLUTE", sep.outputs["Z"]), value=0.66))
    near = op("MINIMUM", ax, op("MINIMUM", ay, az))
    seam = op("LESS_THAN", near, value=0.026)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    nt.links.new(seam, mix.inputs["Factor"])
    mix.inputs["A"].default_value = (0.62, 0.15, 0.02, 1)
    mix.inputs["B"].default_value = (0.02, 0.015, 0.02, 1)
    nt.links.new(mix.outputs["Result"], p.inputs["Base Color"])
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 260
    nt.links.new(coord.outputs["Object"], noise.inputs["Vector"])
    bump_node = nt.nodes.new("ShaderNodeBump")
    bump_node.inputs["Strength"].default_value = 0.25
    nt.links.new(noise.outputs["Fac"], bump_node.inputs["Height"])
    nt.links.new(bump_node.outputs["Normal"], p.inputs["Normal"])
    return sphere("Basketball", (0, 0, 0), radius, m, segments=64)


def screen_image(W=480, H=300):
    """The laptop's docket: a timer bar and rows of billable entries, tiled vertically."""
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    img = np.zeros((H, W, 3), np.float32) + np.array([0.05, 0.03, 0.1])
    rng = np.random.default_rng(7)
    for row in range(10):
        top = row * 30 + 8
        width = rng.integers(140, 380)
        tone = np.array([0.55, 0.5, 0.75]) if row % 3 else np.array([0.62, 0.32, 1.0])
        img[(y >= top) & (y < top + 9) & (x >= 26) & (x < 26 + width)] = tone
        img[(y >= top) & (y < top + 9) & (x >= W - 70) & (x < W - 26)] = (0.85, 0.82, 1.0)
    rgba = np.concatenate([img, np.ones((H, W, 1), np.float32)], -1)[::-1]
    im = bpy.data.images.new("laptop_docket", W, H)
    im.pixels.foreach_set(rgba.astype(np.float32).ravel())
    im.pack()
    return im


def laptop_screen_mat():
    m = bpy.data.materials.new("Laptop screen")
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (0, 0, 0, 1)
    p.inputs["Roughness"].default_value = 0.1
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    image = nt.nodes.new("ShaderNodeTexImage")
    image.image = screen_image()
    image.extension = "REPEAT"
    nt.links.new(coord.outputs["UV"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], image.inputs["Vector"])
    nt.links.new(image.outputs["Color"], p.inputs["Emission Color"])
    p.inputs["Emission Strength"].default_value = 2.2
    return m, mapping.inputs["Location"], p.inputs["Emission Strength"]


# ---------- scenes ----------
def run_scene():
    L = 16
    puffs = []
    puff_mat = mat("Dust", (0.55, 0.52, 0.62), rough=0.9)
    for i in range(2):
        group = []
        for k in range(3):
            group.append(sphere(f"Puff{i}_{k}", (0, 0, -5), 1, puff_mat, segments=16))
        puffs.append(group)

    def pose(f):
        t = f / L
        c = math.cos(TAU * t)
        p = {
            "Body": P(0.2, 0, 0.07 * c),
            "Neck": P(-0.12 + 0.03 * math.sin(2 * TAU * t), 0, -0.05 * c),
            "HipR": P(-0.7 * c), "HipL": P(0.7 * c),
            "KneeR": P(0.3 + 1.25 * max(0.0, math.sin(TAU * (t - 0.5)))),
            "KneeL": P(0.3 + 1.25 * max(0.0, math.sin(TAU * t))),
            "ShoulderR": P(0.75 * c, 0, 0), "ShoulderL": P(-0.75 * c, 0, 0),
            "ElbowR": P(-1.35 - 0.2 * c), "ElbowL": P(-1.35 + 0.2 * c),
        }
        return grounded(p, 0.09 * max(0.0, math.sin(2 * TAU * t + 0.4)))

    def props(f):
        # A puff of dust where each foot pushes off, drifting back and fading.
        for i, (group, start) in enumerate(zip(puffs, (2, 10))):
            age = (f - start) % L
            for k, o in enumerate(group):
                u = age / 9
                size = 0.0 if age > 9 else 0.16 * math.sin(math.pi * min(1, u)) * (1 - 0.2 * k)
                side = -1 if i == 0 else 1
                key_obj(o, f, loc=(side * 0.3 + 0.12 * k * side, 0.55 + u * 0.9 + 0.12 * k, 0.08 + u * 0.25 + 0.05 * k), scale=max(size, 0.0001))

    return dict(length=L, fps=25, face="smug", pose=pose, props=props,
                camera=((-8.5, -9.5, 2.6), (0, 0, 1.72), 100))


def laptop_scene():
    L = 48
    wood = mat("Desk walnut", (0.06, 0.03, 0.022), rough=0.35, coat=0.5, coat_rough=0.1)
    alu = mat("Laptop aluminium", (0.62, 0.6, 0.68), rough=0.28, metal=1.0)
    keys = mat("Keys", (0.03, 0.028, 0.04), rough=0.5)
    cushion = mat("Chair cushion", (0.09, 0.035, 0.19), rough=0.5, sheen=0.4, sheen_tint=(0.8, 0.6, 1))
    chrome = mat("Chrome", (0.8, 0.78, 0.86), rough=0.12, metal=1.0)
    mug_mat = mat("Mug", (0.36, 0.13, 0.85), rough=0.25, coat=0.8)
    logo = emit_mat("Laptop logo", (0.75, 0.55, 1.0), 6)
    screen_m, scroll, glow = laptop_screen_mat()

    # Chair
    box("ChairSeat", (0, 0.08, 0.37), (1.35, 1.05, 0.14), cushion, 0.06)
    box("ChairBack", (0, 0.62, 1.05), (1.25, 0.14, 1.05), cushion, 0.06)
    box("ChairSpine", (0, 0.58, 0.45), (0.12, 0.08, 0.5), chrome, 0.03)
    cylinder("ChairPost", (0, 0.08, 0.2), 0.06, 0.3, chrome)
    for i in range(5):
        a = TAU * i / 5 + 0.3
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0.3 * math.cos(a), 0.08 + 0.3 * math.sin(a), 0.07), rotation=(0, 0, a))
        leg = bpy.context.object
        leg.name = f"ChairLeg{i}"
        leg.scale = (0.6, 0.07, 0.05)
        shade(leg, chrome, False)
        sphere(f"ChairCaster{i}", (0.58 * math.cos(a), 0.08 + 0.58 * math.sin(a), 0.045), 0.045, keys, 16)
    # Desk
    DZ = 1.06
    box("DeskTop", (0, -1.0, DZ), (2.6, 1.25, 0.09), wood, 0.03)
    for sx in (-1.15, 1.15):
        for sy in (-1.5, -0.5):
            box(f"DeskLeg{sx}{sy}", (sx, sy, DZ / 2), (0.09, 0.09, DZ), keys, 0.02)
    # Laptop: base, keyboard, lid with a docket screen and a glowing mark on the back.
    box("LaptopBase", (0, -0.75, DZ + 0.065), (1.35, 0.9, 0.05), alu, 0.02)
    box("LaptopKeys", (0, -0.71, DZ + 0.091), (1.15, 0.45, 0.006), keys, 0.002)
    lid_angle = math.radians(14)
    hinge = Vector((0, -1.18, DZ + 0.09))
    bpy.ops.object.empty_add(location=hinge, rotation=(lid_angle, 0, 0))
    lid = prop(bpy.context.object)
    lid.name = "LaptopLid"
    for o, loc in ((box("LidShell", (0, 0, 0), (1.35, 0.035, 0.82), alu, 0.02), (0, -0.01, 0.42)),):
        o.parent, o.location = lid, loc
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0.012, 0.43), rotation=(math.pi / 2, 0, math.pi))
    scr = bpy.context.object
    scr.name = "LaptopScreen"
    scr.scale = (1.22, 0.72, 1)
    shade(scr, screen_m, False).parent = lid
    o = sphere("LaptopMark", (0, -0.035, 0.45), 0.09, logo, 24)
    o.scale = (0.09, 0.012, 0.09)
    o.parent = lid
    glow_light(o)
    # Screen light on his face, and a coffee
    bpy.ops.object.light_add(type="AREA", location=(0, -0.9, DZ + 0.55), rotation=(math.radians(100), 0, 0))
    screen_light = prop(bpy.context.object)
    screen_light.data.shape, screen_light.data.size, screen_light.data.size_y = "RECTANGLE", 1.2, 0.7
    screen_light.data.color, screen_light.data.energy = (0.72, 0.52, 1.0), 160
    screen_light.visible_glossy = False
    screen_light.data.use_shadow = False
    cylinder("Mug", (1.05, -0.65, DZ + 0.2), 0.13, 0.32, mug_mat)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.08, minor_radius=0.025, location=(1.2, -0.65, DZ + 0.2), rotation=(math.pi / 2, 0, 0))
    shade(bpy.context.object, mug_mat)

    SLAM = 40

    def pose(f):
        typing = 1 - bump(f, 41, 9, L)
        wind = bump(f, 37, 4, L)            # hand rises
        slam = bump(f, SLAM, 2.2, L)        # hand comes down hard
        settle = bump(f, 44, 5, L)
        tapR = math.sin(TAU * f / 4) * typing
        tapL = math.sin(TAU * f / 4 + math.pi * 0.6) * typing
        nod = math.sin(TAU * f / 12)
        return {
            "Root": P(dz=-0.3 - 0.03 * slam),
            "Body": P(0.1 + 0.03 * nod - 0.08 * settle + 0.06 * slam, 0, 0.03 * math.sin(TAU * f / 24)),
            "Neck": P(0.14 + 0.05 * nod * typing - 0.22 * settle, 0, 0.06 * settle),
            "HipR": P(-math.pi / 2 + 0.06), "HipL": P(-math.pi / 2 + 0.06),
            "KneeR": P(math.pi / 2 - 0.06), "KneeL": P(math.pi / 2 - 0.06),
            "ShoulderR": P(-0.42 - 0.04 * tapR, -0.12, 0.05),
            "ElbowR": P(-1.1 + 0.11 * tapR, 0.0, 0.0),
            "ShoulderL": P(-0.42 - 0.04 * tapL - 1.25 * wind + 0.05 * slam, 0.1 + 0.15 * wind, -0.05),
            "ElbowL": P(-1.1 + 0.11 * tapL - 0.9 * wind + 0.15 * slam, 0.0, 0.0),
        }

    def props(f):
        scroll.default_value = (0, f / L, 0)
        scroll.keyframe_insert("default_value", frame=f)
        glow.default_value = 2.2 + 3.5 * bump(f, SLAM, 3, L)
        glow.keyframe_insert("default_value", frame=f)

    return dict(length=L, fps=24, face="smug", pose=pose, props=props,
                camera=((-11.2, -6.4, 4.1), (0.1, -0.45, 1.5), 112))


def meditate_scene():
    L = 40
    orb_mat = emit_mat("Orb", (0.78, 0.55, 1.0), 9)
    rune_mat = emit_mat("Rune", (0.55, 0.3, 1.0), 7)
    orbs = []
    for i in range(3):
        o = glow_light(sphere(f"Orb{i}", (0, 0, 0), 0.11, orb_mat, 24))
        h = halo(f"OrbGlow{i}", (0, 0, 0), 0.55, halo_mat(f"Orb glow {i}", (0.62, 0.4, 1.0), 2.6, 0.9))
        orbs.append((o, h))
    ring = []
    for i in range(12):
        ring.append(glow_light(sphere(f"Rune{i}", (0, 0, 0), 0.045, rune_mat, 16)))
    floor_glow = halo("FloorGlow", (0, 0, 0.01), 1.7, halo_mat("Floor glow", (0.5, 0.28, 1.0), 2.2, 0.55, 1.6), face_camera=False)
    aura = halo("Aura", (0, 0.6, 1.9), 2.3, halo_mat("Aura", (0.6, 0.35, 1.0), 2.6, 0.2, 1.6))
    motes = []
    mote_mat = emit_mat("Mote", (0.9, 0.8, 1.0), 6)
    rng = np.random.default_rng(3)
    for i in range(10):
        o = glow_light(sphere(f"Mote{i}", (0, 0, 0), 1, mote_mat, 12))
        motes.append((o, rng.uniform(0, TAU), rng.uniform(0.9, 1.7), rng.uniform(0, 1)))

    def lift(f):
        return 0.62 + 0.11 * math.sin(TAU * f / L)

    def pose(f):
        t = f / L
        breathe = math.sin(TAU * t)
        return {
            "Root": P(dz=-0.33 + lift(f)),
            "Body": P(0.02 * breathe, 0, 0, dz=0.012 * breathe),
            "Neck": P(-0.04 + 0.04 * math.sin(TAU * t - 0.8), 0, 0.03 * math.sin(TAU * t)),
            "HipR": P(-1.5, 0, 0.72), "HipL": P(-1.5, 0, -0.72),
            "KneeR": P(0.32, 2.45, 0), "KneeL": P(0.12, -2.45, 0),
            "ShoulderR": P(-0.32, -0.3 - 0.03 * breathe, 0.0), "ShoulderL": P(-0.32, 0.3 + 0.03 * breathe, 0.0),
            "ElbowR": P(-0.45, 0, 0.1), "ElbowL": P(-0.45, 0, -0.1),
        }

    def props(f):
        t = f / L
        z = lift(f)
        for i, (o, h) in enumerate(orbs):
            a = TAU * (t / 3 + i / 3)
            loc = (1.75 * math.cos(a), 1.75 * math.sin(a) * 0.8, 1.85 + 0.35 * math.sin(a + 1.2) + z - 0.6)
            key_obj(o, f, loc=loc)
            key_obj(h, f, loc=loc)
        for i, o in enumerate(ring):
            a = TAU * (i / 12 + t / 12)
            key_obj(o, f, loc=(1.05 * math.cos(a), 1.05 * math.sin(a), z + 0.05), scale=0.06 * (1 + 0.3 * math.sin(TAU * (t + i / 4))))
        key_obj(floor_glow, f, scale=1.7 - 0.25 * (z - 0.62) / 0.11)
        key_obj(aura, f, loc=(0, 0.6, 1.9 + z - 0.6))
        for o, a, r, phase in motes:
            u = (t + phase) % 1
            key_obj(o, f, loc=(r * math.cos(a + u), r * math.sin(a + u), 0.4 + 2.6 * u), scale=max(1e-4, 0.03 * math.sin(math.pi * u)))

    return dict(length=L, fps=20, face="happy", pose=pose, props=props,
                camera=((-8.5, -9.5, 4.2), (0, 0, 1.9), 92))


def soccer_scene():
    L = 24
    R = 0.3
    ball = football(R)

    def kick(f, centre):
        return bump(f, centre, 7, L)

    def pose(f):
        kl, kr = kick(f, 0), kick(f, 12)
        sway = kl - kr
        p = {
            "Root": P(),
            "Body": P(0.08 + 0.05 * (kl + kr), 0.07 * sway, 0.05 * sway),
            "Neck": P(0.2, 0, -0.08 * sway),
            "HipL": P(-1.25 * kl, 0, -0.1 * kl), "HipR": P(-1.25 * kr, 0, 0.1 * kr),
            "KneeL": P(0.12 + 0.75 * kl + 0.12 * kr), "KneeR": P(0.12 + 0.75 * kr + 0.12 * kl),
            "ShoulderL": P(-0.2 + 0.15 * kr, 0.95 + 0.25 * kr, 0), "ShoulderR": P(-0.2 + 0.15 * kl, -0.95 - 0.25 * kl, 0),
            "ElbowL": P(-0.45, 0, 0), "ElbowR": P(-0.45, 0, 0),
        }
        return grounded(p)

    contacts = {}
    for f, side in ((0, "L"), (12, "R")):
        apply_pose(pose(f))
        contacts[f] = where(f"Toe{side}") + Vector((0, 0, R))

    def props(f):
        a, b = (0, 12) if f < 12 else (12, 24)
        u = (f - a) / 12
        p0, p1 = contacts[a % 24], contacts[b % 24]
        loc = p0.lerp(p1, u) + Vector((0, -0.4 * math.sin(math.pi * u), 4 * 0.72 * u * (1 - u)))
        key_obj(ball, f, loc=loc, rot=(-TAU * f / L, 0.4, TAU * f / L * 0.5))

    return dict(length=L, fps=24, face="happy", pose=pose, props=props,
                camera=((-8.5, -9.5, 2.9), (0, -0.2, 1.75), 100))


def solve_arm(pose, side, target, guess):
    """Find shoulder (x, y) and elbow (x) angles that put the palm on `target` (coordinate descent)."""
    params, step = list(guess), 0.25
    limits = ((-2.2, 0.8), (-1.6, 1.6), (-2.2, 0.0))

    def cost(q):
        trial = dict(pose)
        trial[f"Shoulder{side}"] = P(q[0], q[1], 0)
        trial[f"Elbow{side}"] = P(q[2])
        apply_pose(trial)
        # A little pull toward a relaxed elbow keeps the arm natural when several poses reach.
        return (where(f"Palm{side}") - target).length_squared + 0.0004 * (q[2] + 0.7) ** 2

    best = cost(params)
    while step > 0.002:
        moved = False
        for i in range(3):
            for d in (step, -step):
                q = list(params)
                q[i] = min(limits[i][1], max(limits[i][0], q[i] + d))
                c = cost(q)
                if c < best:
                    params, best, moved = q, c, True
        if not moved:
            step /= 2
    return params


def basketball_scene():
    L = 24
    BOUNCE = 12                          # two dribbles per loop
    R = 0.32
    ball = basketball(R)
    spot = Vector((-1.5, -0.38, 0))     # where the ball hits the floor, beside the near foot
    top, low = 1.0, 0.82                 # ball centre at the top of the dribble, and where the hand lets go

    def ball_z(f):
        # |cos| is a dribble: rounded at the hand, a sharp bounce at the floor.
        return R + (top - R) * abs(math.cos(math.pi * f / BOUNCE))

    def body(f):
        t = f / L
        push = math.cos(TAU * f / BOUNCE)      # 1 at the top of each dribble
        return grounded({
            "Body": P(0.34 + 0.04 * push, -0.05, -0.16),
            "Neck": P(-0.08 + 0.05 * push, 0, 0.18 + 0.04 * math.sin(TAU * t)),
            "HipL": P(-0.7, 0.16, -0.18), "HipR": P(-0.7, -0.16, 0.18),
            "KneeL": P(0.78 + 0.08 * push), "KneeR": P(0.78 + 0.08 * push),
            "ShoulderR": P(-0.35, -1.05 + 0.06 * math.sin(TAU * t), 0.1),
            "ElbowR": P(-0.55 - 0.1 * math.sin(TAU * t)),
        })

    # The hand rides the ball down to `low`, lets go, waits there, and meets it on the way back up.
    arms, guess = {}, (-0.6, 0.4, -0.5)
    for f in range(L):
        pose = body(f)
        hand = max(ball_z(f), low) + R + 0.06
        guess = arms[f] = solve_arm(pose, "L", Vector((spot.x, spot.y, hand)), guess)

    def pose(f):
        p = body(f)
        q = arms[f % L]
        p["ShoulderL"], p["ElbowL"] = P(q[0], q[1], 0), P(q[2])
        return p

    def props(f):
        key_obj(ball, f, loc=(spot.x, spot.y, ball_z(f)), rot=(-TAU * f / BOUNCE * 0.5, 0, 0))

    return dict(length=L, fps=24, face="smug", pose=pose, props=props,
                camera=((-8.5, -9.5, 2.6), (-0.2, -0.25, 1.55), 100))


def render_frame(path, glows):
    """Glows are rendered in their own pass (the floor would show through them), with everything
    else held out, then laid over the main pass."""
    scene.render.filepath = path
    for o in glows:
        o.hide_render = True
    bpy.ops.render.render(write_still=True)
    if not glows:
        return
    solid = [o for o in bpy.data.objects if o.type == "MESH" and not o.get("glow") and o is not floor and not o.hide_render]
    for o in glows:
        o.hide_render = False
    floor.hide_render = True
    for o in solid:
        o.is_holdout = True
    glow_path = path[:-4] + "_glow.png"
    scene.render.filepath = glow_path
    bpy.ops.render.render(write_still=True)
    for o in solid:
        o.is_holdout = False
    floor.hide_render = False
    base, over = bpy.data.images.load(path), bpy.data.images.load(glow_path)
    w, h = base.size
    a = np.empty(w * h * 4, np.float32)
    b = np.empty(w * h * 4, np.float32)
    base.pixels.foreach_get(a)
    over.pixels.foreach_get(b)
    a, b = a.reshape(-1, 4), b.reshape(-1, 4)
    a[:, :3] *= a[:, 3:]
    b[:, :3] *= b[:, 3:]
    out = b + a * (1 - b[:, 3:])
    out[:, :3] /= np.maximum(out[:, 3:], 1e-6)
    base.pixels.foreach_set(out.ravel())
    base.filepath_raw = path
    base.file_format = "PNG"
    base.save()
    bpy.data.images.remove(base)
    bpy.data.images.remove(over)
    os.remove(glow_path)


BUILDERS = dict(run=run_scene, laptop=laptop_scene, meditate=meditate_scene, soccer=soccer_scene, basketball=basketball_scene)
MANIFEST = {}

for name in SCENE_LIST:
    first_prop = len(PROPS)
    spec = BUILDERS[name]()
    L = spec["length"]
    tex.image = FACES[spec["face"]]
    for f in range(L + 1):
        p = spec["pose"](f % L)
        key_pose(p, f)
        spec["props"](f % L)
    scene.render.fps = spec["fps"]
    (cx, cy, cz), aim, lens = spec["camera"]
    cam.location = (cx, cy, cz)
    target.location = aim
    cam.data.lens = lens
    if os.environ.get("SCENE_CAMERA"):
        cam.location = [float(v) for v in os.environ["SCENE_CAMERA"].split(",")]
    glows = [o for o in PROPS if o.get("glow")]
    for f in range(L):
        if ONLY and f not in ONLY:
            continue
        scene.frame_set(f)
        path = os.path.join(SCENE_DIR, f"{name}_{f:02d}.png")
        render_frame(path, glows)
    MANIFEST[name] = dict(frames=L, fps=spec["fps"])
    # Drop this scene's animation and props.
    for j in J.values():
        ad = j.animation_data
        if ad and ad.action:
            bpy.data.actions.remove(ad.action)
            ad.action = None
    for o in PROPS[first_prop:]:
        bpy.data.objects.remove(o, do_unlink=True)
    del PROPS[first_prop:]
    for a in list(bpy.data.actions):
        if a.users == 0:
            bpy.data.actions.remove(a)
    reset()

import json
with open(os.path.join(SCENE_DIR, "scenes.json"), "w") as fh:
    json.dump(MANIFEST, fh, indent=1)

# ---------- restore build.py's state ----------
for o in PROPS:
    bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions):
    if a.users == 0:
        bpy.data.actions.remove(a)
tex.image = FACES["smug"]
screen_bsdf.inputs["Coat Weight"].default_value = SCREEN_COAT
for name, value in LIGHT_SHADOWS.items():
    bpy.data.objects[name].data.use_shadow = value
bpy.context.preferences.edit.keyframe_new_interpolation_type = "BEZIER"
scene.render.use_motion_blur = False
scene.render.engine = "BLENDER_EEVEE"
scene.render.fps = 24
reset()
print("SCENES", MANIFEST)

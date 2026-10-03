/* Broadcast in 3D. The model and its clips are built in Blender from
   tools/broadcast/build.py; this module plays them with three.js and draws the
   face live, so moods, talking and glitches cost nothing to change. Optional by
   design: any failure leaves the 2D partner in place. */

import { mouthOpen } from "./voice.mjs";

const W = 640;
const H = 460;
export const MOODS = ["smug", "approve", "stern", "panic", "happy"];
let loading = null;

export function canUse3D() {
	try {
		if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
		const probe = document.createElement("canvas");
		return !!(probe.getContext("webgl2") || probe.getContext("webgl"));
	} catch {
		return false;
	}
}

export function loadBroadcast3D(url) {
	loading ||= create(url).catch((error) => {
		loading = null;
		throw error;
	});
	return loading;
}

/* ---------- face ---------- */
function eye(ctx, mood, x, blink) {
	const y = 190;
	if (blink && mood !== "happy") {
		ctx.beginPath();
		ctx.roundRect(x - 66, y + 4, 132, 18, 9);
		ctx.fill();
		return;
	}
	ctx.beginPath();
	if (mood === "smug") {
		const inner = x < W / 2 ? 1 : -1;
		ctx.save();
		ctx.beginPath();
		ctx.moveTo(x - 90, y - 34 - inner * 0.45 * 90);
		ctx.lineTo(x + 90, y - 34 + inner * 0.45 * 90);
		ctx.lineTo(x + 90, y + 60);
		ctx.lineTo(x - 90, y + 60);
		ctx.closePath();
		ctx.clip();
		ctx.beginPath();
		ctx.ellipse(x, y, 78, 50, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	} else if (mood === "approve") {
		ctx.ellipse(x, y + 8, 70, 40, 0, 0, Math.PI);
		ctx.fill();
	} else if (mood === "stern") {
		ctx.roundRect(x - 70, y + 2, 140, 26, 13);
		ctx.fill();
	} else if (mood === "panic") {
		ctx.arc(x, y, 54, 0, Math.PI * 2);
		ctx.fill();
		ctx.save();
		ctx.shadowBlur = 0;
		ctx.fillStyle = "#170a30";
		ctx.beginPath();
		ctx.arc(x + (x < W / 2 ? 10 : -10), y + 6, 18, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	} else {
		ctx.lineWidth = 28;
		ctx.arc(x, y + 30, 58, Math.PI * 1.05, Math.PI * 1.95);
		ctx.stroke();
	}
}

function mouth(ctx, mood, open) {
	const cx = W / 2;
	ctx.beginPath();
	if (open > 0) {
		ctx.ellipse(cx, 318, 112, 16 + 62 * open, 0, 0, Math.PI);
		ctx.fill();
		return;
	}
	if (mood === "smug") {
		ctx.lineWidth = 32;
		ctx.arc(cx, 95, 255, Math.PI / 2 - 0.62, Math.PI / 2 + 0.62);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(380, 338);
		ctx.lineTo(406, 338);
		ctx.lineTo(393, 384);
		ctx.closePath();
		ctx.fill();
	} else if (mood === "approve") {
		ctx.lineWidth = 24;
		ctx.arc(cx, 170, 165, Math.PI * 0.32, Math.PI * 0.68);
		ctx.stroke();
	} else if (mood === "stern") {
		ctx.lineWidth = 22;
		ctx.moveTo(214, 336);
		ctx.lineTo(426, 336);
		ctx.stroke();
	} else if (mood === "panic") {
		ctx.lineWidth = 18;
		ctx.moveTo(206, 340);
		for (let i = 1; i <= 8; i++) ctx.lineTo(206 + i * 29, 340 + (i % 2 ? -18 : 18));
		ctx.stroke();
	} else {
		ctx.ellipse(cx, 292, 135, 95, 0, 0, Math.PI);
		ctx.fill();
	}
}

function drawFace(ctx, mood, now, talkOpen, glitch) {
	const bg = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * 0.62);
	bg.addColorStop(0, "#2d0e60");
	bg.addColorStop(1, "#0a0418");
	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, W, H);
	ctx.save();
	ctx.fillStyle = ctx.strokeStyle = "#f4ecff";
	ctx.shadowColor = "#b07cff";
	ctx.shadowBlur = 34;
	ctx.lineCap = "round";
	const blink = now % 4300 < 130;
	eye(ctx, mood, 200, blink);
	eye(ctx, mood, 440, blink);
	mouth(ctx, mood, talkOpen);
	ctx.restore();
	ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
	for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
	if (glitch) {
		for (let i = 0; i < 7; i++) {
			const y = Math.random() * H, h = 6 + Math.random() * 28, dx = (Math.random() - 0.5) * 70;
			ctx.drawImage(ctx.canvas, 0, y, W, h, dx, y, W, h);
		}
		ctx.fillStyle = "rgba(176, 124, 255, 0.18)";
		ctx.fillRect(0, Math.random() * H, W, 10 + Math.random() * 30);
	}
}

/* ---------- scene ---------- */
async function create(url) {
	const THREE = await import("three");
	const [{ GLTFLoader }, { MeshoptDecoder }, { RoomEnvironment }] = await Promise.all([
		import("three/addons/loaders/GLTFLoader.js"),
		import("three/addons/libs/meshopt_decoder.module.js"),
		import("three/addons/environments/RoomEnvironment.js"),
	]);
	const canvas = document.createElement("canvas");
	canvas.className = "broadcast-canvas";
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
	renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.AgXToneMapping ?? THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 0.92;
	const scene = new THREE.Scene();
	const pmrem = new THREE.PMREMGenerator(renderer);
	scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
	scene.environmentIntensity = 0.32;
	const light = (color, intensity, x, y, z) => {
		const l = new THREE.DirectionalLight(color, intensity);
		l.position.set(x, y, z);
		scene.add(l);
	};
	light(0xfff3ea, 2.2, -3.6, 5.4, 5.0);
	light(0xd2dcff, 0.6, 4.8, 2.2, 3.8);
	light(0xa66bff, 2.4, -3.2, 4.2, -3.8);
	light(0xd88bff, 2.0, 3.4, 3.6, -3.6);
	scene.add(new THREE.HemisphereLight(0xf2ebff, 0x1b1527, 0.3));

	const loader = new GLTFLoader();
	loader.setMeshoptDecoder(MeshoptDecoder);
	const gltf = await loader.loadAsync(url);
	const model = gltf.scene;
	scene.add(model);
	// Blender's fabric sheen reads far stronger here and greys out the suit.
	model.traverse((node) => {
		if (node.material && "sheen" in node.material) node.material.sheen = 0;
	});

	const faceCanvas = document.createElement("canvas");
	faceCanvas.width = W;
	faceCanvas.height = H;
	const faceCtx = faceCanvas.getContext("2d");
	const faceTexture = new THREE.CanvasTexture(faceCanvas);
	faceTexture.colorSpace = THREE.SRGBColorSpace;
	faceTexture.flipY = false;
	const screen = model.getObjectByName("Screen");
	if (screen?.material) {
		screen.material.emissiveMap = faceTexture;
		screen.material.emissive = new THREE.Color(0xffffff);
		screen.material.emissiveIntensity = 2.4;
		screen.material.needsUpdate = true;
	}
	const neck = model.getObjectByName("Neck");
	const neckRest = neck ? neck.position.clone() : null;

	const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
	const focus = new THREE.Vector3(0, 1.72, 0);
	const viewDir = new THREE.Vector3(-6.4, 1.15, 9.4).normalize();

	const mixer = new THREE.AnimationMixer(model);
	const clips = Object.fromEntries(gltf.animations.map((clip) => [clip.name, clip]));
	let current = null, pending = null, mood = "approve", faceOverride = null, overrideUntil = 0;
	let talkPlan = null, talkStart = 0;
	let talkUntil = 0, glitchUntil = 0, host = null, frame = 0, last = performance.now(), lastFace = 0;
	const base = () => (mood === "panic" ? "slump" : "idle");

	function play(name, { once = false, repeats = 1 } = {}) {
		const clip = clips[name];
		if (!clip) return;
		const next = mixer.clipAction(clip);
		if (next === current && !once) return;
		next.reset();
		next.setLoop(THREE.LoopRepeat, once ? repeats : Infinity);
		next.clampWhenFinished = true;
		next.fadeIn(0.35).play();
		if (current && current !== next) current.fadeOut(0.35);
		current = next;
		pending = once ? next : null;
	}
	mixer.addEventListener("finished", (event) => {
		if (event.action === pending) {
			pending = null;
			play(base());
		}
	});
	play("idle");

	function resize() {
		if (!host) return;
		const w = host.clientWidth || 1, h = host.clientHeight || 1;
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
		const needV = 3.8 / (2 * Math.tan(halfV));
		const needH = 3.0 / (2 * Math.tan(halfV) * camera.aspect);
		camera.position.copy(focus).addScaledVector(viewDir, Math.max(needV, needH));
		camera.lookAt(focus);
		camera.updateProjectionMatrix();
	}
	const observer = new ResizeObserver(resize);

	function tick(now) {
		frame = 0;
		if (!host || !canvas.isConnected) return;
		frame = requestAnimationFrame(tick);
		if (document.hidden || !canvas.offsetParent) return;
		const dt = Math.min(0.05, (now - last) / 1000);
		last = now;
		mixer.update(dt);
		const glitching = now < glitchUntil || Math.random() < 0.0015;
		if (neck && neckRest) {
			neck.position.x = neckRest.x + (glitching ? (Math.random() - 0.5) * 0.04 : 0);
		}
		if (now - lastFace > 33 || glitching) {
			if (now > overrideUntil) faceOverride = null;
			const talking = now < talkUntil;
			const open = !talking ? 0 : talkPlan ? Math.max(0.06, mouthOpen(talkPlan, (now - talkStart) / 1000)) : 0.25 + 0.75 * Math.abs(Math.sin(now / 85) * Math.sin(now / 210));
			drawFace(faceCtx, faceOverride || mood, now, open, glitching);
			faceTexture.needsUpdate = true;
			lastFace = now;
		}
		renderer.render(scene, camera);
	}

	const api = {
		attach(element) {
			if (host) observer.unobserve(host);
			host = element;
			host.appendChild(canvas);
			observer.observe(host);
			resize();
			last = performance.now();
			if (!frame) frame = requestAnimationFrame(tick);
		},
		setMood(next) {
			if (!MOODS.includes(next) || next === mood) return;
			mood = next;
			if (!pending) play(base());
		},
		react(kind, plan = null) {
			const now = performance.now();
			if (kind === "cheer") {
				faceOverride = "happy";
				overrideUntil = now + 2600;
				play("cheer", { once: true, repeats: 3 });
			} else if (kind === "slump") {
				play("slump", { once: true, repeats: 2 });
			} else if (kind === "glitch") {
				glitchUntil = now + 450;
			} else {
				talkPlan = plan;
				talkStart = now;
				talkUntil = now + (plan ? plan.duration * 1000 : 2200);
				play("talk", { once: true, repeats: Math.max(1, Math.ceil((plan ? plan.duration : 2.2) / (clips.talk?.duration || 2))) });
				if (Math.random() < 0.35) glitchUntil = now + 220;
			}
		},
	};
	return api;
}

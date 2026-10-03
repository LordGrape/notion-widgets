/* Broadcast's voice: a deep, wordless radio-host murmur. A line is planned as
   syllables (rhythm, pitch and vowel colour set by mood), and the same plan
   drives both the sound and his mouth, so they always move together. */

const MOODS = {
	happy: { pitch: 112, pace: 1.0, spread: 0.12 },
	smug: { pitch: 92, pace: 1.08, spread: 0.1 },
	approve: { pitch: 98, pace: 1.0, spread: 0.08 },
	stern: { pitch: 82, pace: 1.18, spread: 0.05 },
	panic: { pitch: 124, pace: 0.78, spread: 0.16 },
};
/* Muffled, dark vowel formants for a baritone murmur: [F1, F2, F3]. */
const VOWELS = [
	[730, 1090, 2440],
	[570, 840, 2410],
	[440, 1020, 2240],
	[530, 1500, 2480],
	[640, 1190, 2390],
];

export function seeded(seed = 1) {
	let s = seed >>> 0 || 1;
	return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function syllablePlan(text, mood = "approve", random = Math.random) {
	const m = MOODS[mood] || MOODS.approve;
	const words = String(text).split(/\s+/).filter(Boolean);
	const syllables = [];
	let t = 0.04;
	const total = Math.min(16, words.reduce((n, w) => n + Math.max(1, Math.round(w.replace(/[^a-z]/gi, "").length / 3.2)), 0));
	for (const word of words) {
		const count = Math.max(1, Math.round(word.replace(/[^a-z]/gi, "").length / 3.2));
		for (let i = 0; i < count && syllables.length < total; i++) {
			const progress = syllables.length / Math.max(1, total - 1);
			const len = (0.11 + random() * 0.08) * m.pace;
			const stress = i === 0 ? 1 : 0.8;
			syllables.push({
				at: t,
				len,
				amp: (0.7 + random() * 0.3) * stress,
				pitch: m.pitch * (1 + m.spread * (random() - 0.5)) * (1 - 0.12 * progress),
				vowel: Math.floor(random() * VOWELS.length),
			});
			t += len + (0.02 + random() * 0.03) * m.pace;
		}
		if (syllables.length >= total) break;
		t += /[.,!?;:]$/.test(word) ? 0.22 * m.pace : (0.04 + random() * 0.05) * m.pace;
	}
	const last = syllables.at(-1);
	if (last) last.pitch *= 0.88;
	return { syllables, duration: last ? last.at + last.len + 0.08 : 0 };
}

/* How open the mouth is at time t (seconds) into the plan, 0..1. */
export function mouthOpen(plan, t) {
	for (const s of plan?.syllables || []) {
		if (t < s.at || t > s.at + s.len) continue;
		const x = (t - s.at) / s.len;
		const shape = x < 0.2 ? x / 0.2 : x > 0.75 ? (1 - x) / 0.25 : 1;
		return Math.max(0, Math.min(1, s.amp * shape));
	}
	return 0;
}

let context = null, current = null;

function audio() {
	const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
	if (!Ctx) return null;
	context ||= new Ctx();
	if (context.state === "suspended") context.resume().catch(() => {});
	return context;
}

function warmCurve() {
	const curve = new Float32Array(1024);
	for (let i = 0; i < curve.length; i++) {
		const x = (i / (curve.length - 1)) * 2 - 1;
		curve[i] = Math.tanh(1.6 * x) / Math.tanh(1.6);
	}
	return curve;
}

export function stopVoice() {
	try {
		current?.disconnect();
	} catch {}
	current = null;
}

/* Plays a plan. Returns false when audio is unavailable (for example before
   the first tap, when browsers keep audio locked). */
export function speak(plan, { volume = 0.22 } = {}) {
	const c = audio();
	if (!c || !plan?.syllables.length) return false;
	stopVoice();
	const out = c.createGain();
	out.gain.value = volume;
	const highpass = c.createBiquadFilter();
	highpass.type = "highpass";
	highpass.frequency.value = 65;
	const lowpass = c.createBiquadFilter();
	lowpass.type = "lowpass";
	lowpass.frequency.value = 2300;
	const warmth = c.createWaveShaper();
	warmth.curve = warmCurve();
	const body = c.createBiquadFilter();
	body.type = "peaking";
	body.frequency.value = 180;
	body.gain.value = 5;
	warmth.connect(body);
	body.connect(highpass);
	highpass.connect(lowpass);
	lowpass.connect(out);
	out.connect(c.destination);
	current = out;
	const t0 = c.currentTime + 0.03;
	for (const s of plan.syllables) {
		const at = t0 + s.at, end = at + s.len;
		const osc = c.createOscillator();
		osc.type = "sawtooth";
		osc.frequency.setValueAtTime(s.pitch * 1.03, at);
		osc.frequency.linearRampToValueAtTime(s.pitch * 0.97, end);
		const env = c.createGain();
		env.gain.setValueAtTime(0.0001, at);
		env.gain.linearRampToValueAtTime(s.amp, at + 0.025);
		env.gain.linearRampToValueAtTime(s.amp * 0.8, end - 0.03);
		env.gain.linearRampToValueAtTime(0.0001, end + 0.03);
		VOWELS[s.vowel].forEach((freq, i) => {
			const formant = c.createBiquadFilter();
			formant.type = "bandpass";
			formant.frequency.value = freq;
			formant.Q.value = 6 + i * 3;
			const level = c.createGain();
			level.gain.value = [1.0, 0.45, 0.18][i];
			osc.connect(formant);
			formant.connect(level);
			level.connect(env);
		});
		env.connect(warmth);
		osc.start(at);
		osc.stop(end + 0.05);
	}
	const end = t0 + plan.duration + 0.1;
	setTimeout(() => {
		if (current === out) stopVoice();
	}, (end - c.currentTime) * 1000 + 50);
	return true;
}

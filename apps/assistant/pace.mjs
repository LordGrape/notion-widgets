import { SPRINT, sessionPlan } from "./sprints.mjs";
import { courseLabel } from "./readings-import.mjs";

/* Learning from your own reading. Pure: finished tasks and the time logged against them go in, a pace per
   class comes out. With little data for a class it leans on your overall pace, then on the default. */

const median = (values) => {
	const a = [...values].sort((x, y) => x - y), n = a.length;
	return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null;
};
const quarter = (x) => Math.round(x * 4) / 4;

/* The course a task belongs to: the longest course name that appears in its text. */
export function courseOfTask(text, names = []) {
	const t = String(text || "").toLowerCase();
	let best = "";
	for (const name of names) {
		const label = courseLabel(name).toLowerCase();
		if (label.length >= 3 && t.includes(label) && label.length > best.length) best = label;
	}
	return best;
}

/* One sample per finished reading with at least three logged minutes: pages, minutes, minutes per page. */
export function paceSamples({ tasks = [], sessions = [], pagesOf, names = [] }) {
	const minutes = new Map();
	for (const s of sessions) if (s && s.taskId && Number(s.seconds) > 0) minutes.set(String(s.taskId), (minutes.get(String(s.taskId)) || 0) + Number(s.seconds) / 60);
	const out = [];
	for (const t of tasks) {
		if (!t || !t.done) continue;
		const spent = minutes.get(String(t.id));
		const pages = pagesOf(t);
		if (!(spent >= 3) || !(pages >= 2)) continue;
		const pace = spent / pages;
		if (pace < 0.5 || pace > 40) continue;
		out.push({ pace, pages, minutes: spent, course: courseOfTask(t.text, names), at: Number(t.doneAt || t.completedAt || t.created) || 0 });
	}
	return out.sort((a, b) => a.at - b.at);
}

/* Minutes per page for a course. Recent readings count most. A class with one reading is pulled halfway
   to your overall pace, so a single odd day does not set it. */
export function learnedPace(samples, course = "", { defaultPace = 6, prior = 2, recent = 8 } = {}) {
	const overall = samples.length >= 3 ? median(samples.slice(-12).map((s) => s.pace)) : null;
	const mine = course ? samples.filter((s) => s.course === course).slice(-recent) : [];
	if (mine.length) {
		const base = overall ?? defaultPace;
		const own = median(mine.map((s) => s.pace));
		return { pace: quarter((mine.length * own + prior * base) / (mine.length + prior)), source: "course", n: mine.length, course };
	}
	if (overall) return { pace: quarter(overall), source: "overall", n: samples.length, course: "" };
	return { pace: defaultPace, source: "default", n: 0, course: "" };
}

/* How long a sprint can be right now. `free` is the minutes until the next class or booked block
   (Infinity when nothing is booked) and `remaining` is the work left on the task. */
export function sprintCap({ free = Infinity, remaining = 0 }) {
	const normal = SPRINT.max;
	const need = remaining > 0 ? Math.min(remaining, normal) : normal;
	if (free < need + 5) return { max: Math.max(10, Math.floor((free - 5) / 5) * 5), mode: "tight", free };
	if (free >= 2 * normal + SPRINT.breakMin + 10 && remaining > normal + SPRINT.breakMin) return { max: SPRINT.open, mode: "open", free };
	return { max: normal, mode: "normal", free };
}

/* Minutes from `now` to the start of the next commitment, with its name. */
export function nextCommitment(now, commitments = []) {
	const next = commitments.filter((c) => c.start > now).sort((a, b) => a.start - b.start)[0];
	return next ? { free: (next.start - now) / 60000, name: next.name || "", at: next.start } : { free: Infinity, name: "", at: 0 };
}

const SPRINT_ROW = /^Sprint (\d+):?\s*pp?\.\s*(\d+)(?:[–-](\d+))?\s*\((\d+) min\)\s*$/i;
const RECALL_ROW = /^Close the book/i;

/* After a sprint is ticked, work out how fast you are really reading and re-plan the rest. Sprints are
   time-boxed, so a faster reader simply gets more pages in each one. Returns null when there is nothing
   to learn from yet (no ticked sprint or no page numbers). */
export function replanRemaining({ subs = [], taskId = "", spentMinutes = 0, priorPace = 6, max = SPRINT.max, now = Date.now() }) {
	const parsed = subs.map((s) => ({ s, m: String(s.text || "").match(SPRINT_ROW) }));
	const sprints = parsed.filter((r) => r.m);
	const done = sprints.filter((r) => r.s.done);
	if (!sprints.length || !done.length) return null;
	const first = Math.min(...sprints.map((r) => +r.m[2]));
	const last = Math.max(...sprints.map((r) => +(r.m[3] || r.m[2])));
	const lastDone = Math.max(...done.map((r) => +(r.m[3] || r.m[2])));
	const pagesDone = lastDone - first + 1;
	const observed = spentMinutes >= 5 && pagesDone >= 2 ? spentMinutes / pagesDone : null;
	const pace = observed ? quarter((priorPace + observed * done.length) / (1 + done.length)) : priorPace;
	const recallDone = subs.some((s) => RECALL_ROW.test(s.text || "") && s.done);
	const isPending = (s) => !s.done && (SPRINT_ROW.test(s.text || "") || RECALL_ROW.test(s.text || ""));
	const before = subs.filter(isPending).map((s) => s.text);
	const keep = subs.filter((s) => !isPending(s));
	const remaining = last - lastDone;
	let added = [];
	if (remaining > 0) {
		const plan = sessionPlan({ minutes: Math.ceil(remaining * pace), start: lastDone + 1, end: last, max, offset: done.length });
		added = plan.filter((r) => !(r.kind === "recall" && recallDone)).map((r, i) => ({ id: `${taskId}_sprint_${now}_${i}`, text: r.text, done: false }));
	} else if (!recallDone) {
		added = [{ id: `${taskId}_sprint_${now}_0`, text: "Close the book: write the rule and the holding from memory (5 min)", done: false }];
	}
	const next = [...keep, ...added];
	return { subs: next, pace, observed, changed: before.join("|") !== added.map((s) => s.text).join("|") };
}

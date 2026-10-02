import { isoDate } from "./domain.mjs";

/* Billable-hours model. Pure functions only: tasks, focus sessions and timetable
   events go in; a docket (entries, totals, pace) comes out. Nothing here stores
   state, so the ledger can never drift from the widgets that own the data. */

export const KINDS = ["class", "reading", "study", "writing", "admin"];
export const BILLABLE = new Set(["class", "reading", "study", "writing"]);
export const KIND_LABEL = {
	class: "Class",
	reading: "Reading",
	study: "Study",
	writing: "Writing",
	admin: "Admin",
};
export const WEEKLY_TARGET = 35;
const DAY = 86400000;
const MAX_SESSIONS = 300;

/* Order matters: an explicit reading cue wins over "outline", and writing wins
   over "review" ("review and draft memo" is writing). */
const RULES = [
	[
		"reading",
		/\b(read(ing)?|skim|pp?\.?\s*\d|pages?\s*\d|ch(apter)?s?\.?\s*\d)/i,
	],
	[
		"writing",
		/\b(write|writing|draft|memo|essay|brief|factum|assignment|paper|reflection|submission|proofread|edit)/i,
	],
	[
		"study",
		/\b(study|review|outline|flash\s?cards?|anki|practice|quiz|exam|canvass|summar|memori[sz]e|revise|revision|notes?|mock|f?irac|problem set|tutorial|moot)/i,
	],
];

export const isKind = (value) => KINDS.includes(value);
export function classifyText(text = "") {
	const value = String(text);
	for (const [kind, pattern] of RULES) if (pattern.test(value)) return kind;
	return "admin";
}
/* A kind chosen by the user always beats the parser. */
export const taskKind = (task = {}) =>
	isKind(task.kind) ? task.kind : classifyText(task.text);

/* Docket convention: tenths of an hour. Under three minutes bills nothing. */
export const unitsFor = (mins) => (mins >= 3 ? Math.round(mins / 6) / 10 : 0);
export const minutesFor = (units) => Math.round(Number(units) * 60);
export const formatUnits = (units) => (Math.round(units * 10) / 10).toFixed(1);

export function weekStart(date = new Date()) {
	const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
	return d;
}
export function weekKeys(date = new Date()) {
	const start = weekStart(date);
	return Array.from({ length: 7 }, (_, i) => {
		const d = new Date(start);
		d.setDate(start.getDate() + i);
		return isoDate(d);
	});
}

function parseSessions(raw) {
	let value = raw;
	if (typeof value === "string") {
		try {
			value = JSON.parse(value);
		} catch {
			value = [];
		}
	}
	return Array.isArray(value) ? value : [];
}

export function sessionEntries(rawSessions, tasks = []) {
	const byId = new Map(tasks.map((t) => [String(t.id), t]));
	return parseSessions(rawSessions)
		.filter(
			(s) => s && Number(s.seconds) >= 60 && Number(s.completedAt) > 0,
		)
		.map((s) => {
			const task = byId.get(String(s.taskId));
			const end = Number(s.completedAt);
			const note = String(s.note || "").trim();
			return {
				id: String(s.id || `${s.taskId}:${end}`),
				source: s.manual ? "manual" : "focus",
				taskId: String(s.taskId || ""),
				kind: isKind(s.kind) ? s.kind : task ? taskKind(task) : classifyText(note),
				description: note || task?.text || "Focused work",
				start: end - Math.round(Number(s.seconds) * 1000),
				end,
				minutes: Math.round(Number(s.seconds) / 60),
			};
		});
}

/* Class time counts as it is attended: a block in progress counts to "now". */
export function classEntries(events = [], now = new Date()) {
	const at = now.getTime();
	return events
		.filter(
			(e) =>
				String(e.category || "").toLowerCase() === "class" &&
				e.eventType !== "reminder",
		)
		.map((e) => {
			const start = new Date(`${e.dateKey}T${e.start}`).getTime();
			const end = new Date(`${e.dateKey}T${e.end}`).getTime();
			const counted = Math.min(end, at);
			return {
				id: `class:${e.id}:${e.dateKey}`,
				source: "class",
				taskId: "",
				kind: "class",
				description: e.name,
				start,
				end: counted,
				minutes: Math.round((counted - start) / 60000),
			};
		})
		.filter((e) => e.minutes >= 1);
}

export function summarize(entries, now = new Date(), target = WEEKLY_TARGET) {
	const from = weekStart(now).getTime();
	const week = entries
		.filter((e) => e.start >= from && e.start < from + 7 * DAY)
		.map((e) => ({ ...e, units: unitsFor(e.minutes) }))
		.sort((a, b) => a.start - b.start);
	const byKind = Object.fromEntries(KINDS.map((k) => [k, 0]));
	for (const e of week) byKind[e.kind] += e.units;
	const billable = KINDS.filter((k) => BILLABLE.has(k)).reduce(
		(sum, k) => sum + byKind[k],
		0,
	);
	const elapsed = Math.min(1, Math.max(0, (now.getTime() - from) / (7 * DAY)));
	const expected = target * elapsed;
	const diff = billable - expected;
	return {
		entries: week,
		byKind,
		billable: Math.round(billable * 10) / 10,
		nonBillable: Math.round(byKind.admin * 10) / 10,
		target,
		pct: Math.min(100, Math.round((billable / target) * 100)),
		expected: Math.round(expected * 10) / 10,
		pace: diff >= 1 ? "ahead" : diff <= -1 ? "behind" : "on pace",
		remaining: Math.max(0, Math.round((target - billable) * 10) / 10),
	};
}

export function manualSession({ taskId, minutes, note, kind, endAt }) {
	const mins = Math.round(Number(minutes));
	if (!(mins >= 3)) throw new Error("Log at least 0.1 hours.");
	const end = Number(endAt) || Date.now();
	return {
		id: `manual:${end}:${taskId || "free"}`,
		taskId: String(taskId || ""),
		seconds: mins * 60,
		completedAt: end,
		manual: true,
		note: String(note || "").trim().slice(0, 200),
		...(isKind(kind) ? { kind } : {}),
	};
}

/* Appends to the Clock-owned focus_sessions payload, keeping its shape and cap. */
export function appendSession(raw, session) {
	const history = parseSessions(raw).filter((s) => s && s.id !== session.id);
	history.push(session);
	return JSON.stringify(history.slice(-MAX_SESSIONS));
}

export function removeSession(raw, id) {
	return JSON.stringify(parseSessions(raw).filter((s) => s && s.id !== id));
}

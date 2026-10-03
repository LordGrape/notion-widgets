import { dailyGoal, dateKey } from "../todo/src/daily-goal.mjs";
export { dailyGoal, dateKey };
export const isoDate = (d = new Date()) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const localDate = (key) => new Date(`${key}T12:00:00`);
export const normalizeDateKey = (key) => {
	const [y, m, d] = String(key || "")
		.split("-")
		.map(Number);
	return y && m && d
		? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
		: "";
};
export const minutes = (value) => {
	const [h, m] = String(value).split(":").map(Number);
	return h * 60 + m;
};
export const timeString = (n) =>
	`${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export const duration = (t = {}) =>
	Number(t.plannedMinutes) ||
	(t.scheduledStart && t.scheduledEnd
		? Math.max(
				1,
				Math.round(
					(Date.parse(t.scheduledEnd) - Date.parse(t.scheduledStart)) / 60000,
				),
			)
		: { quick: 15, m30: 30, m60: 60, deep: 120 }[t.time] || 0);
export const isCalendarReminder = (task, courses = []) => {
	if (task?.calendarReminder || task?.eventType === "reminder") return true;
	if (task?.source !== "timetable" || !task.scheduleId) return false;
	const block = courses.find((item) => item?.id === task.scheduleId);
	return !!(
		block &&
		(block.eventType === "reminder" ||
			(block.category === "personal" &&
				block.trackCompletion &&
				block.startDate &&
				block.startDate === block.endDate))
	);
};
export const focusTasks = (tasks, courses = []) =>
	tasks.filter((task) => !isCalendarReminder(task, courses));
export function todayTasks(tasks, now = new Date()) {
	const key = isoDate(now);
	return tasks.filter((t) =>
		t.done
			? t.doneAt &&
				isoDate(new Date(t.doneAt)) === key &&
				(!t.dueKey || normalizeDateKey(t.dueKey) <= key) &&
				t.due !== "tomorrow"
			: t.due === "today" ||
				(t.dueKey ? normalizeDateKey(t.dueKey) <= key : t.due !== "tomorrow"),
	);
}
/* A task's scheduled block as [start, end] in ms, or null. */
export const blockOf = (t = {}) => {
	const start = Date.parse(t.scheduledStart), end = Date.parse(t.scheduledEnd);
	return Number.isFinite(start) && Number.isFinite(end) && end > start ? [start, end] : null;
};
const RANK = { must: 0, should: 1, could: 2 };
/* What Focus should be on right now. In order:
   1. a task you chose, until a scheduled block starts after you chose it;
   2. the block on now;
   3. a block that ended today but is still open (running over);
   4. the next block today;
   5. unscheduled Must, then Should, work due today.
   `selection` is { taskId, at }; a selection without `at` predates this rule and yields to any block. */
export function focusPick(tasks, { now = Date.now(), selection = null } = {}) {
	const day = isoDate(new Date(now));
	const open = todayTasks(tasks, new Date(now)).filter((t) => !t.done);
	const timed = open
		.map((t) => ({ t, block: blockOf(t) }))
		.filter(({ block }) => block && isoDate(new Date(block[0])) === day);
	const chosen = selection?.taskId && tasks.find((t) => !t.done && String(t.id) === String(selection.taskId));
	if (chosen) {
		const at = Number(selection.at) || 0;
		const superseded = timed.some(({ t, block }) => t.id !== chosen.id && block[0] > at && block[0] <= now);
		if (!superseded) return { task: chosen, reason: "chosen", block: blockOf(chosen) };
	}
	const live = timed.filter(({ block }) => block[0] <= now && now < block[1]).sort((a, b) => b.block[0] - a.block[0])[0];
	if (live) return { task: live.t, reason: "now", block: live.block };
	const over = timed.filter(({ block }) => block[1] <= now).sort((a, b) => b.block[1] - a.block[1])[0];
	if (over) return { task: over.t, reason: "over", block: over.block };
	const next = timed.filter(({ block }) => block[0] > now).sort((a, b) => a.block[0] - b.block[0])[0];
	if (next) return { task: next.t, reason: "next", block: next.block };
	const loose = open
		.filter((t) => !blockOf(t) && t.pri !== "could")
		.sort((a, b) => (RANK[a.pri || "must"] ?? 0) - (RANK[b.pri || "must"] ?? 0))[0];
	return loose ? { task: loose, reason: "priority", block: null } : { task: null, reason: "none", block: null };
}
/* Minutes for a focus timer: what is left of a block on now, else the estimate. */
export function focusLength(task, now = Date.now()) {
	const block = blockOf(task);
	if (block && block[0] <= now && now < block[1]) return Math.max(5, Math.round((block[1] - now) / 60000));
	return duration(task) || 45;
}
export function intervals(events, start = 540, end = 1020) {
	const ranges = events
		.map((e) => [
			Math.max(start, minutes(e.start)),
			Math.min(end, minutes(e.end)),
		])
		.filter(([s, e]) => e > s)
		.sort((a, b) => a[0] - b[0]);
	const merged = [];
	for (const [s, e] of ranges) {
		const last = merged.at(-1);
		if (last && s <= last[1]) last[1] = Math.max(e, last[1]);
		else merged.push([s, e]);
	}
	return merged;
}
export function gaps(events, start = 540, end = 1020) {
	let cursor = start;
	const result = [];
	for (const [s, e] of intervals(events, start, end)) {
		if (s > cursor) result.push([cursor, s]);
		cursor = e;
	}
	if (cursor < end) result.push([cursor, end]);
	return result;
}
export function validateSlot(events, start, end, exclude) {
	if (
		!Number.isFinite(start) ||
		!Number.isFinite(end) ||
		start < 0 ||
		end > 1439 ||
		end <= start
	)
		throw new Error("Choose a valid time range within the day.");
	if (
		events.some(
			(e) =>
				e.id !== exclude && start < minutes(e.end) && end > minutes(e.start),
		)
	)
		throw new Error(
			"That time overlaps a scheduled block. Choose an open time.",
		);
}
export function suggestSlot(events, preferred, duration, end = 1439, exclude) {
	for (const [start, finish] of gaps(
		events.filter((e) => e.id !== exclude),
		preferred,
		end,
	)) {
		const snapped = Math.ceil(start / 15) * 15;
		if (snapped + duration <= finish) return snapped;
	}
	return null;
}
export const escapeHtml = (value) =>
	String(value ?? "").replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c
			],
	);

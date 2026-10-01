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
export const escapeHtml = (value) =>
	String(value ?? "").replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c
			],
	);

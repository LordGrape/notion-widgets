import { isoDate, localDate, normalizeDateKey, minutes, timeString, duration } from "./domain.mjs";

/* Pure helpers for the Plan calendar: tasks that carry a time but no timetable
   block, the "plan tomorrow" nudge, and click-to-time conversion. Nothing here
   writes to storage. */

export const NUDGE_HOUR = 16;

/* An open task with a scheduledStart on this date whose block is missing (the
   To-Do widget stores the time on the task; only Command Centre blocks create a
   timetable entry). Shown on the calendar as a ghost so it is not invisible. */
export function ghostEvents(tasks, dateKey, realEvents = []) {
	const out = [];
	for (const t of tasks) {
		if (t.done || !t.scheduledStart) continue;
		const start = new Date(t.scheduledStart);
		if (Number.isNaN(start.getTime()) || isoDate(start) !== dateKey) continue;
		if (t.scheduleId && realEvents.some((e) => e.id === t.scheduleId)) continue;
		const from = start.getHours() * 60 + start.getMinutes();
		const to = Math.min(1439, from + Math.max(15, duration(t) || 60));
		if (to <= from) continue;
		out.push({
			id: "task:" + t.id,
			taskId: t.id,
			ghost: true,
			name: t.text,
			start: timeString(from),
			end: timeString(to),
			location: "",
			color: "#9461e9",
			dateKey,
			sourceDate: dateKey,
		});
	}
	return out;
}

/* The day to nudge about: tomorrow, or Monday from Friday or Saturday (Sunday's
   tomorrow is already Monday). planNudge stays quiet before 16:00 or once dismissed. */
export function nudgeDate(now = new Date()) {
	const day = now.getDay();
	const d = new Date(now);
	d.setDate(d.getDate() + (day === 5 ? 3 : day === 6 ? 2 : 1));
	return isoDate(d);
}

export function planNudge({ now = new Date(), eventsFor, tasks = [], dismissed = "" }) {
	if (now.getHours() < NUDGE_HOUR) return null;
	const date = nudgeDate(now);
	if (dismissed === date) return null;
	if (eventsFor(date).length) return null;
	const waiting = tasks.filter((t) => !t.done && !t.scheduledStart && !t.scheduleId && normalizeDateKey(t.dueKey) === date).length;
	const label = localDate(date).toLocaleDateString("en-CA", { weekday: "long" });
	return {
		date,
		waiting,
		text: waiting
			? `${label} has ${waiting} ${waiting === 1 ? "task" : "tasks"} but no times. Plan it?`
			: `${label} has nothing on the calendar. Plan it?`,
	};
}

/* Pixel offset inside a calendar column to a 15-minute-snapped start time. */
export function timeAtOffset(y, startMinute, endMinute, hour = 76) {
	const raw = startMinute + (y * 60) / hour;
	const snapped = Math.round(raw / 15) * 15;
	return timeString(Math.max(startMinute, Math.min(endMinute - 15, snapped)));
}

export { minutes };

/* A block's tag lives in its description as a "Type: study" line, because the
   timetable widget keeps descriptions but drops unknown block fields. */
const TYPE_LINE = /^[ \t]*Type:[ \t]*([A-Za-z]+)[ \t]*$/im;
export function parseTypeTag(description = "", kinds = []) {
	const kind = String(description).match(TYPE_LINE)?.[1]?.toLowerCase();
	return kinds.includes(kind) ? kind : null;
}
export function stripTypeTag(description = "") {
	return String(description).replace(/^[ \t]*Type:[ \t]*[A-Za-z]+[ \t]*(\r?\n|$)/im, "").trim();
}
export function withTypeTag(description = "", kind = null) {
	const rest = stripTypeTag(description);
	if (!kind) return rest;
	return rest ? `Type: ${kind}\n${rest}` : `Type: ${kind}`;
}

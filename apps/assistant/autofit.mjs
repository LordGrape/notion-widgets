import { gaps, minutes as clock, timeString, duration } from "./domain.mjs";

/* Plan my day. Pure planner: unscheduled tasks and the day's existing events go
   in; a proposed set of calendar blocks comes out. It never writes anything. */

export const PLAN_START = 9 * 60;
export const PLAN_END = 21 * 60;
export const DEFAULT_MINUTES = 30;
export const BUFFER = 10;
const RANK = { must: 0, should: 1, could: 2 };
const SNAP = 15;

export const isUnscheduled = (t) => !t.done && !t.scheduleId && !t.scheduledStart;

/* Must first, then Should, then Could. Within a tier overdue work leads, then
   the order the user already chose. */
export function orderForPlanning(tasks, today) {
	const rank = (t) => RANK[t.pri] ?? 0;
	const late = (t) => (t.dueKey && String(t.dueKey) < today ? 0 : 1);
	return [...tasks].sort(
		(a, b) =>
			rank(a) - rank(b) ||
			late(a) - late(b) ||
			(a.order ?? a.created ?? 0) - (b.order ?? b.created ?? 0),
	);
}

export function planDay({
	tasks,
	events,
	today,
	nowMinute = 0,
	start = PLAN_START,
	end = PLAN_END,
	buffer = BUFFER,
}) {
	const from = Math.max(start, Math.ceil(nowMinute / SNAP) * SNAP);
	const busy = events.map((e) => ({ start: e.start, end: e.end }));
	const placed = [];
	const unplaced = [];
	for (const t of orderForPlanning(tasks.filter(isUnscheduled), today)) {
		const length = duration(t) || DEFAULT_MINUTES;
		let slot = null;
		for (const [open, close] of gaps(busy, from, end)) {
			const snapped = Math.ceil(open / SNAP) * SNAP;
			if (snapped + length <= close) {
				slot = snapped;
				break;
			}
		}
		const base = { id: t.id, text: t.text, pri: t.pri || "must", minutes: length, estimated: !duration(t) };
		if (slot === null) {
			unplaced.push({ ...base, reason: length > end - from ? "Longer than the time left today." : "No open stretch is long enough." });
			continue;
		}
		placed.push({ ...base, start: timeString(slot), end: timeString(slot + length) });
		busy.push({ start: timeString(slot), end: timeString(Math.min(end, slot + length + buffer)) });
	}
	const free = gaps(busy, from, end).reduce((sum, [a, b]) => sum + (b - a), 0);
	return {
		placed: placed.sort((a, b) => clock(a.start) - clock(b.start)),
		unplaced,
		from,
		end,
		freeAfter: free,
	};
}

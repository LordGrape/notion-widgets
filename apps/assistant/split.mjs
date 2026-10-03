/* Splitting a task when a session ends part-way. Pure functions: a task and how
   far you got go in; the finished part and the remainder come out. */

const RANGE = /(\d+)\s*[-–—]\s*(\d+)/;
const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);

/* Where in a page range you most likely got to, from time spent against time
   planned. Never the first or last page, so both halves are real work. */
export function suggestLastPage({ start, end, plannedMinutes, focusedMinutes }) {
	const pages = end - start + 1;
	if (pages < 2) return start;
	const fraction = plannedMinutes > 0 ? Math.min(0.95, Math.max(0.05, focusedMinutes / plannedMinutes)) : 0.5;
	return Math.min(end - 1, Math.max(start, start + Math.floor(pages * fraction) - 1));
}

function withRange(text, from, to) {
	const label = from === to ? String(from) : `${from}–${to}`;
	const next = text.replace(RANGE, label);
	return from === to ? next.replace(/\bpp\./i, "p.") : next;
}

export function planPageSplit({ text, plannedMinutes, focusedMinutes, start, end, lastPage }) {
	if (!(Number.isInteger(start) && Number.isInteger(end) && end > start)) throw new Error("This task has no page range to split.");
	if (!(Number.isInteger(lastPage) && lastPage >= start && lastPage < end)) throw new Error(`Choose a page from ${start} to ${end - 1}.`);
	const total = end - start + 1;
	const donePages = lastPage - start + 1;
	const restPages = end - lastPage;
	const pace = plannedMinutes > 0 ? plannedMinutes / total : focusedMinutes > 0 ? focusedMinutes / donePages : 6;
	return {
		doneText: withRange(text, start, lastPage),
		doneMinutes: Math.max(1, Math.round(focusedMinutes > 0 ? focusedMinutes : donePages * pace)),
		restText: withRange(text, lastPage + 1, end),
		restMinutes: Math.max(5, Math.ceil(restPages * pace)),
	};
}

export function planTimeSplit({ text, plannedMinutes, focusedMinutes, remainingMinutes }) {
	const left = Number(remainingMinutes) > 0 ? Number(remainingMinutes) : round5((plannedMinutes || 60) - focusedMinutes);
	const base = String(text).replace(/\s*\(continued\)\s*$/i, "");
	return {
		doneText: base,
		doneMinutes: Math.max(1, Math.round(focusedMinutes || plannedMinutes || 30)),
		restText: `${base} (continued)`,
		restMinutes: Math.max(5, Math.round(left)),
	};
}

export const defaultRemaining = ({ plannedMinutes, focusedMinutes }) => round5((plannedMinutes || 60) - (focusedMinutes || 0));

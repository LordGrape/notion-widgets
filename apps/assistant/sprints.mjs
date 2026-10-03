/* Focus sprints for long reading. Pure: minutes and a page range go in, a realistic plan comes out.
   Sustained attention drops over a long unbroken block, so a task is cut into sprints of at most 50
   minutes with a short break between them and a longer one after every third. `max` is the longest
   sprint allowed right now: longer when nothing is booked, shorter when something is coming up. */

export const SPRINT = { max: 50, open: 75, single: 55, breakMin: 10, longBreakMin: 25, longEvery: 3 };

export const sprintCount = (total, max = SPRINT.max) => (total > 0 && total > max + 5 ? Math.ceil(total / max) : 1);

/* The focus block for a task of `total` minutes: the whole task when it is short, otherwise one sprint. */
export function sprintMinutes(total, max = SPRINT.max) {
	const n = Number(total);
	if (!(n > 0)) return Math.min(45, max);
	return Math.max(5, Math.ceil(n / sprintCount(n, max)));
}

/* The break that follows sprint `index` (1-based), or 0 after the last one. */
export const breakAfter = (index, count) => (index >= count ? 0 : index % SPRINT.longEvery === 0 ? SPRINT.longBreakMin : SPRINT.breakMin);

const rangeLabel = (a, b) => (a === b ? `p. ${a}` : `pp. ${a}–${b}`);

/* Sprint rows for a task. With a page range each sprint gets its own pages; reading plans end with a
   short recall step, because testing yourself from memory outperforms re-reading. `offset` numbers the
   rows after sprints that are already done. */
export function sessionPlan({ minutes, start = null, end = null, max = SPRINT.max, offset = 0 }) {
	const total = Number(minutes) > 0 ? Number(minutes) : 0;
	const count = sprintCount(total, max);
	const each = sprintMinutes(total, max);
	const hasPages = Number.isInteger(start) && Number.isInteger(end) && end >= start;
	const pages = hasPages ? end - start + 1 : 0;
	const rows = [];
	let from = start;
	for (let i = 1; i <= count; i++) {
		const minutesHere = i === count && total ? Math.max(5, total - each * (count - 1)) : each;
		let text = `Sprint ${offset + i}`;
		let to = null;
		if (hasPages) {
			to = i === count ? end : start - 1 + Math.round((pages * i) / count);
			if (to < from) to = from;
			text += `: ${rangeLabel(from, to)}`;
			from = to + 1;
		}
		rows.push({ kind: "sprint", index: offset + i, text: `${text} (${minutesHere} min)`, minutes: minutesHere, breakAfter: breakAfter(offset + i, offset + count) });
	}
	if (hasPages) rows.push({ kind: "recall", index: offset + count + 1, text: "Close the book: write the rule and the holding from memory (5 min)", minutes: 5, breakAfter: 0 });
	return rows;
}

/* Steps saved on a task that are too long to be one sitting, such as "(138 min)". */
export const oversizedSteps = (subs = []) => subs.some((s) => Number(String(s.text || "").match(/\((\d+)\s*min\)/)?.[1]) > SPRINT.open + 5);

/* The break that follows a saved step, when it is a sprint row. */
export function breakAfterStep(subs, index) {
	const sprints = subs.filter((s) => /^Sprint \d+/i.test(s.text || ""));
	const mine = subs[index];
	if (!mine || !/^Sprint (\d+)/i.test(mine.text || "")) return 0;
	return breakAfter(Number(mine.text.match(/^Sprint (\d+)/i)[1]), sprints.length);
}

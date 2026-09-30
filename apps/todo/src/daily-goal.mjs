export function dateKey(date = new Date()) {
	return (
		date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
	);
}
function keyNumber(key) {
	const [y, m, d] = String(key || "")
		.split("-")
		.map(Number);
	return y * 10000 + m * 100 + d || 0;
}
export function dailyGoal(tasks, shouldGoal = 1, now = new Date()) {
	const key = dateKey(now);
	const today = tasks.filter((t) =>
		t.done
			? t.doneAt &&
				dateKey(new Date(t.doneAt)) === key &&
				(!t.dueKey || keyNumber(t.dueKey) <= key) &&
				t.due !== "tomorrow"
			: t.due === "today" ||
				(t.dueKey ? keyNumber(t.dueKey) <= key : t.due !== "tomorrow"),
	);
	// Unclassified tasks remain commitments until deliberately marked Could Do.
	const must = today.filter((t) => t.pri !== "should" && t.pri !== "could");
	const should = today.filter((t) => t.pri === "should");
	const target = Math.min(Math.max(0, Number(shouldGoal) || 0), should.length);
	const mustDone = must.filter((t) => t.done).length,
		shouldDone = should.filter((t) => t.done).length;
	const total = must.length + target,
		done = mustDone + Math.min(target, shouldDone);
	return {
		mustTotal: must.length,
		mustDone,
		shouldTarget: target,
		shouldDone,
		total,
		done,
		pct: total ? Math.round((done / total) * 100) : 0,
		complete: total > 0 && done === total,
	};
}

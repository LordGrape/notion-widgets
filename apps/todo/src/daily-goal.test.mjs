import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyGoal } from "./daily-goal.mjs";
const now = new Date(2026, 8, 30, 12),
	doneAt = now.getTime();
test("Could tasks do not block a completed commitment", () => {
	const g = dailyGoal(
		[
			{ pri: "must", done: true, doneAt },
			{ pri: "should", done: true, doneAt },
			{ pri: "could", done: false },
		],
		1,
		now,
	);
	assert.equal(g.complete, true);
	assert.equal(g.pct, 100);
});
test("Should target is bounded by today’s planned Should tasks", () => {
	assert.equal(
		dailyGoal([{ pri: "must", done: true, doneAt }], 1, now).complete,
		true,
	);
	assert.equal(
		dailyGoal(
			[
				{ pri: "should", done: true, doneAt },
				{ pri: "should", done: false },
			],
			2,
			now,
		).complete,
		false,
	);
});
test("Unclassified and overdue commitments still block", () => {
	assert.equal(
		dailyGoal([{ done: false }, { pri: "must", done: true, doneAt }], 0, now)
			.complete,
		false,
	);
	assert.equal(
		dailyGoal([{ pri: "must", done: false, dueKey: "2026-09-29" }], 0, now)
			.mustTotal,
		1,
	);
});
test("Future and historical completions do not inflate progress", () => {
	const tasks = [
		{ pri: "must", done: false, dueKey: "2026-10-01" },
		{ pri: "must", done: true, doneAt: doneAt - 86400000 },
		{ pri: "must", done: true, doneAt, due: "tomorrow", dueKey: "2026-10-01" },
	];
	assert.equal(dailyGoal(tasks, 1, now).total, 0);
});
test("An empty or bonus-only day is not falsely celebrated", () => {
	assert.equal(dailyGoal([], 1, now).complete, false);
	assert.equal(
		dailyGoal([{ pri: "could", done: false }], 1, now).complete,
		false,
	);
});

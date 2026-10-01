import test from "node:test";
import assert from "node:assert/strict";
import {
	dailyGoal,
	todayTasks,
	gaps,
	intervals,
	validateSlot,
	suggestSlot,
	duration,
	focusTasks,
	isCalendarReminder,
} from "./domain.mjs";
test("capacity merges overlaps and preserves usable gaps", () => {
	const e = [
		{ start: "10:00", end: "12:00" },
		{ start: "11:00", end: "13:00" },
		{ start: "15:00", end: "16:00" },
	];
	assert.deepEqual(intervals(e), [
		[600, 780],
		[900, 960],
	]);
	assert.deepEqual(gaps(e), [
		[540, 600],
		[780, 900],
		[960, 1020],
	]);
});
test("scheduling rejects overlap, invalid input and midnight overflow", () => {
	const e = [{ id: "class", start: "10:00", end: "11:00" }];
	assert.throws(() => validateSlot(e, 630, 675), /overlaps/);
	assert.throws(() => validateSlot(e, 1410, 1470), /valid time/);
	assert.throws(() => validateSlot(e, NaN, 700), /valid time/);
	assert.doesNotThrow(() => validateSlot(e, 660, 705));
	assert.doesNotThrow(() => validateSlot(e, 600, 660, "class"));
});
test("finish line matches standalone model and Could never blocks it", () => {
	const now = new Date("2026-10-01T12:00:00");
	const t = [
		{ pri: "must", due: "today", done: true, doneAt: now.getTime() },
		{ pri: "should", due: "today", done: false },
		{ pri: "could", due: "today", done: false },
	];
	assert.equal(dailyGoal(t, 0, now).complete, true);
	assert.equal(dailyGoal(t, 1, now).complete, false);
});
test("today includes overdue commitments and excludes future tasks", () => {
	const now = new Date("2026-10-01T12:00:00");
	assert.deepEqual(
		todayTasks(
			[
				{ id: "overdue", dueKey: "2026-09-30" },
				{ id: "legacy-overdue", dueKey: "2026-9-30" },
				{ id: "legacy-today", dueKey: "2026-10-1" },
				{ id: "future", dueKey: "2026-10-03" },
				{ id: "tomorrow", due: "tomorrow" },
				{ id: "flex" },
			],
			now,
		).map((t) => t.id),
		["overdue", "legacy-overdue", "legacy-today", "flex"],
	);
});
test("duration uses explicit estimates and exact scheduled windows", () => {
	assert.equal(duration({ plannedMinutes: 45, time: "m60" }), 45);
	assert.equal(
		duration({
			scheduledStart: "2026-10-01T13:00:00Z",
			scheduledEnd: "2026-10-01T13:45:00Z",
		}),
		45,
	);
});

test("one-off personal calendar reminders stay out of focus and daily work", () => {
	const haircut = {
		id: "tt:haircut:tuesday",
		text: "Haircut",
		pri: "should",
		due: "future",
		source: "timetable",
		scheduleId: "haircut-event",
		scheduledStart: "2026-10-06T14:00:00.000Z",
	};
	const courses = [{
		id: "haircut-event",
		name: "Haircut",
		category: "personal",
		trackCompletion: true,
		startDate: "2026-10-06",
		endDate: "2026-10-06",
	}];
	assert.equal(isCalendarReminder(haircut, courses), true);
	assert.deepEqual(focusTasks([haircut], courses), []);
	assert.equal(isCalendarReminder({ source: "timetable", scheduleId: "weekly-study" }, [
		{ id: "weekly-study", category: "study", trackCompletion: true },
	]), false);
});

test("drop suggestions fit a complete task into the next available gap", () => {
	const events = [
		{ id: "class", start: "11:00", end: "12:00" },
		{ id: "lunch", start: "12:00", end: "13:00" },
		{ id: "study", start: "13:00", end: "14:00" },
		{ id: "other", start: "15:00", end: "16:00" },
	];
	assert.equal(suggestSlot(events, 675, 45, 1020), 840);
	assert.equal(suggestSlot(events, 855, 60, 1020), 960);
	assert.equal(suggestSlot(events, 675, 30, 1020, "class"), 675);
	assert.equal(suggestSlot(events, 1005, 45, 1020), null);
});

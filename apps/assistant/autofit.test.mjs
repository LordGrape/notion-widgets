import test from "node:test";
import assert from "node:assert/strict";
import { planDay, orderForPlanning, isUnscheduled } from "./autofit.mjs";

const T = (id, pri, minutes, extra = {}) => ({
	id,
	text: id,
	pri,
	plannedMinutes: minutes,
	created: Number(id.replace(/\D/g, "")) || 0,
	done: false,
	...extra,
});

test("must tasks are placed before should and could", () => {
	const order = orderForPlanning(
		[T("c1", "could", 30), T("s1", "should", 30), T("m1", "must", 30)],
		"2026-10-02",
	).map((t) => t.id);
	assert.deepEqual(order, ["m1", "s1", "c1"]);
});
test("overdue work leads within its tier", () => {
	const order = orderForPlanning(
		[T("m1", "must", 30, { dueKey: "2026-10-02" }), T("m2", "must", 30, { dueKey: "2026-10-01" })],
		"2026-10-02",
	).map((t) => t.id);
	assert.deepEqual(order, ["m2", "m1"]);
});
test("already scheduled and finished tasks are ignored", () => {
	assert.equal(isUnscheduled(T("a", "must", 30)), true);
	assert.equal(isUnscheduled(T("a", "must", 30, { scheduleId: "x" })), false);
	assert.equal(isUnscheduled(T("a", "must", 30, { done: true })), false);
});
test("tasks fill the open stretches with a buffer between them", () => {
	const plan = planDay({
		tasks: [T("m1", "must", 60), T("s1", "should", 30)],
		events: [{ start: "09:00", end: "12:00" }],
		today: "2026-10-02",
		nowMinute: 0,
	});
	assert.deepEqual(plan.placed.map((p) => [p.id, p.start, p.end]), [
		["m1", "12:00", "13:00"],
		["s1", "13:15", "13:45"],
	]);
	assert.equal(plan.unplaced.length, 0);
});
test("nothing is placed in the past", () => {
	const plan = planDay({
		tasks: [T("m1", "must", 30)],
		events: [],
		today: "2026-10-02",
		nowMinute: 14 * 60 + 5,
	});
	assert.equal(plan.placed[0].start, "14:15");
});
test("tasks without an estimate use thirty minutes and say so", () => {
	const plan = planDay({
		tasks: [{ id: "x", text: "x", pri: "must", created: 1, done: false }],
		events: [],
		today: "2026-10-02",
		nowMinute: 600,
	});
	assert.equal(plan.placed[0].minutes, 30);
	assert.equal(plan.placed[0].estimated, true);
});
test("a task that cannot fit is reported, and smaller ones still land", () => {
	const plan = planDay({
		tasks: [T("m1", "must", 240), T("s1", "should", 30)],
		events: [{ start: "09:00", end: "18:00" }],
		today: "2026-10-02",
		nowMinute: 0,
	});
	assert.deepEqual(plan.unplaced.map((u) => u.id), ["m1"]);
	assert.equal(plan.placed[0].id, "s1");
	assert.equal(plan.placed[0].start, "18:00");
});
test("the plan never runs past the end of the window", () => {
	const plan = planDay({
		tasks: [T("m1", "must", 90)],
		events: [{ start: "09:00", end: "20:00" }],
		today: "2026-10-02",
		nowMinute: 0,
	});
	assert.equal(plan.placed.length, 0);
	assert.equal(plan.unplaced[0].id, "m1");
});

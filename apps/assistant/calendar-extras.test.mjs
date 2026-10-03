import test from "node:test";
import assert from "node:assert/strict";
import { ghostEvents, nudgeDate, planNudge, timeAtOffset } from "./calendar-extras.mjs";

const at = (key, h, m = 0) => new Date(`${key}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`).toISOString();

test("a timed task without a block appears as a ghost", () => {
	const t = { id: "a", text: "Read pp. 78-98", scheduledStart: at("2026-10-03", 9), plannedMinutes: 90 };
	const [g] = ghostEvents([t], "2026-10-03", []);
	assert.equal(g.start, "09:00");
	assert.equal(g.end, "10:30");
	assert.equal(g.ghost, true);
	assert.deepEqual(ghostEvents([t], "2026-10-04", []), []);
});

test("no ghost when its block is already drawn, or the task is done", () => {
	const t = { id: "a", text: "x", scheduledStart: at("2026-10-03", 9), scheduleId: "b1" };
	assert.deepEqual(ghostEvents([t], "2026-10-03", [{ id: "b1" }]), []);
	assert.equal(ghostEvents([t], "2026-10-03", []).length, 1);
	assert.deepEqual(ghostEvents([{ ...t, done: true }], "2026-10-03", []), []);
});

test("ghost defaults to an hour and never crosses midnight", () => {
	assert.equal(ghostEvents([{ id: "a", text: "x", scheduledStart: at("2026-10-03", 9) }], "2026-10-03")[0].end, "10:00");
	assert.equal(ghostEvents([{ id: "a", text: "x", scheduledStart: at("2026-10-03", 23, 30), plannedMinutes: 120 }], "2026-10-03")[0].end, "23:59");
});

test("nudge targets tomorrow, or Monday from Friday and Saturday", () => {
	assert.equal(nudgeDate(new Date("2026-10-01T18:00:00")), "2026-10-02");
	assert.equal(nudgeDate(new Date("2026-10-02T18:00:00")), "2026-10-05");
	assert.equal(nudgeDate(new Date("2026-10-03T18:00:00")), "2026-10-05");
	assert.equal(nudgeDate(new Date("2026-10-04T18:00:00")), "2026-10-05");
});

test("nudge waits until 16:00, respects dismissal and a planned day", () => {
	const now = (h) => new Date(`2026-10-01T${h}:00`);
	const none = () => [];
	assert.equal(planNudge({ now: now("15:59"), eventsFor: none }), null);
	assert.match(planNudge({ now: now("16:00"), eventsFor: none }).text, /nothing on the calendar/);
	assert.equal(planNudge({ now: now("17:00"), eventsFor: none, dismissed: "2026-10-02" }), null);
	assert.equal(planNudge({ now: now("17:00"), eventsFor: () => [{ id: "x" }] }), null);
});

test("nudge counts tasks due that day that have no time", () => {
	const tasks = [{ id: "a", text: "x", dueKey: "2026-10-02" }, { id: "b", text: "y", dueKey: "2026-10-02", scheduledStart: "2026-10-02T09:00:00" }];
	const n = planNudge({ now: new Date("2026-10-01T17:00:00"), eventsFor: () => [], tasks });
	assert.equal(n.waiting, 1);
	assert.match(n.text, /1 task but no times/);
});

test("a click offset snaps to 15 minutes inside the window", () => {
	assert.equal(timeAtOffset(0, 540, 1020), "09:00");
	assert.equal(timeAtOffset(76, 540, 1020), "10:00");
	assert.equal(timeAtOffset(100, 540, 1020), "10:15");
	assert.equal(timeAtOffset(99999, 540, 1020), "16:45");
});

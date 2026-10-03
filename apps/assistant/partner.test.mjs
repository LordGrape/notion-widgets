import test from "node:test";
import assert from "node:assert/strict";
import { LINES, EVENT_LINES, STEADY_LINES, momentFor, pickLine, pickEventLine, nextStep, milestoneReached, weeklyReview } from "./partner.mjs";

test("the moment that matters most wins", () => {
	const base = { mood: "stern", day: 3, hour: 14, streak: 4, todayActive: false, milestone: 0 };
	assert.equal(momentFor(base), "stern");
	assert.equal(momentFor({ ...base, hour: 20 }), "streakRisk");
	assert.equal(momentFor({ ...base, hour: 20, day: 6 }), "stern");
	assert.equal(momentFor({ ...base, day: 1, hour: 9 }), "monday");
	assert.equal(momentFor({ ...base, milestone: 7 }), "milestone");
	assert.equal(momentFor({ ...base, pct: 85 }), "almost");
	assert.equal(momentFor({ ...base, hour: 18, tomorrowBooked: false }), "tomorrow");
	assert.equal(momentFor({ ...base, hour: 20, tomorrowBooked: false }), "streakRisk");
});
test("lines fill their numbers and avoid repeats within a day", () => {
	const first = pickLine("stern", { gap: "3.0" }, { date: "2026-10-02" });
	assert.match(first.text, /^[^{}]+$/);
	const second = pickLine("stern", { gap: "3.0" }, { date: "2026-10-02", used: [first.id] });
	assert.notEqual(second.id, first.id);
	const all = LINES.stern;
	const exhausted = pickLine("stern", { gap: "3.0" }, { date: "2026-10-02", used: all });
	assert.ok(all.includes(exhausted.id));
	assert.equal(pickLine("stern", {}, { date: "2026-10-02" }).id, first.id);
});
test("the next step is always one concrete action", () => {
	assert.equal(nextStep({ task: { id: "a", text: "Read pp. 1-10" }, moment: "stern", hasOpenTasks: true }).label, "Focus on Read pp. 1-10");
	assert.equal(nextStep({ task: null, moment: "stern", hasOpenTasks: true }).kind, "plan");
	assert.equal(nextStep({ task: null, moment: "stern", hasOpenTasks: false }).kind, "log");
	assert.equal(nextStep({ task: { id: "a", text: "x" }, moment: "monday", hasOpenTasks: true }).kind, "plan");
	assert.equal(nextStep({ task: { id: "a", text: "x" }, moment: "tomorrow", hasOpenTasks: true }).kind, "book");
	assert.ok(nextStep({ task: { id: "a", text: "A very long task title that keeps going on and on" }, moment: "x" }).label.endsWith("…"));
});
test("milestones celebrate once each", () => {
	assert.equal(milestoneReached(2, 0), 0);
	assert.equal(milestoneReached(3, 0), 3);
	assert.equal(milestoneReached(8, 3), 7);
	assert.equal(milestoneReached(8, 7), 0);
});
test("the weekly review gives a verdict and notes", () => {
	const summary = { billable: 36, target: 35, byKind: { class: 9, reading: 20, study: 7, practice: 2, writing: 0 } };
	const review = weeklyReview(summary, { streak: 5 });
	assert.equal(review.verdict, "Exceeds expectations");
	assert.equal(review.tone, "happy");
	assert.deepEqual(review.notes, ["Most of your independent time went to reading.", "No writing at all. Put some on the calendar this week.", "You carried a 5-day streak into this week."]);
	assert.equal(weeklyReview({ ...summary, billable: 15 }).verdict, "We need to talk");
	assert.equal(weeklyReview({ ...summary, billable: 29 }).verdict, "Meets expectations");
});

test("he sounds like a partner, not a judge", () => {
	const all = [...Object.values(LINES).flat(), ...Object.values(EVENT_LINES).flat()];
	assert.ok(all.length >= 80);
	for (const line of all) assert.doesNotMatch(line, /counsel|court/i);
	for (const [moment, lines] of Object.entries(LINES)) assert.ok(lines.length >= 4, moment);
});
test("late nights, empty dockets and mornings have their own voice", () => {
	const base = { mood: "stern", day: 3, hour: 14, streak: 0, todayActive: false, milestone: 0 };
	assert.equal(momentFor({ ...base, hour: 23 }), "late");
	assert.equal(momentFor({ ...base, hour: 2 }), "late");
	assert.equal(momentFor({ ...base, billable: 0 }), "empty");
	assert.equal(momentFor({ ...base, hour: 8 }), "morning");
	assert.equal(momentFor({ ...base, hour: 8, day: 6 }), "stern");
	assert.equal(momentFor({ ...base, hour: 8, day: 1 }), "monday");
});
test("focus events pick from their own lines", () => {
	assert.ok(EVENT_LINES.start.includes(pickEventLine("start", () => 0.99)));
	assert.ok(EVENT_LINES.start.includes(pickEventLine("unknown", () => 0)));
});

test("coming back, the ceiling and a plan take priority in that order", () => {
	const base = { mood: "stern", day: 3, hour: 9, streak: 1, todayActive: true, milestone: 0 };
	assert.equal(momentFor({ ...base, comeback: true }), "comeback");
	assert.equal(momentFor({ ...base, comeback: true, overCeiling: true }), "ceiling");
	assert.equal(momentFor({ ...base, plan: "After LAW 195, read pp. 1-10" }), "plan");
	assert.equal(momentFor({ ...base, plan: "x", hour: 15 }), "stern");
	assert.match(pickLine("plan", { plan: "After LAW 195, read pp. 1-10" }).text, /After LAW 195/);
});
test("steady intensity softens only the pressure moments", () => {
	const steady = pickLine("stern", { gap: "3.0" }, { intensity: "steady" });
	assert.ok(STEADY_LINES.stern.some((l) => l.replace("{gap}", "3.0") === steady.text));
	const approve = pickLine("approve", {}, { intensity: "steady" });
	assert.ok(LINES.approve.includes(approve.id));
	for (const line of Object.values(STEADY_LINES).flat()) assert.doesNotMatch(line, /my office|excuse|lying|bleeding/i);
});

import test from "node:test";
import assert from "node:assert/strict";
import { conflicts, resolveOverlap } from "./overlap.mjs";
import { minutes } from "./domain.mjs";

const ev = (id, start, end, extra = {}) => ({ id, sourceDate: "2026-10-03", name: id, start, end, category: "personal", ...extra });
const day = [ev("practice", "10:30", "12:30"), ev("property", "12:30", "17:00"), ev("dinner", "17:00", "18:00"), ev("late", "20:00", "21:00")];
const brief = (r) => r.changes.map((c) => `${c.event.id} ${c.start}-${c.end}`);

test("a fact pattern that runs long pushes the reading and what follows it", () => {
	const r = resolveOverlap(day, minutes("10:30"), minutes("13:15"), "push", day[0]);
	assert.deepEqual(brief(r), ["property 13:15-17:45", "dinner 17:45-18:45"]);
	assert.equal(r.blocked, "");
});
test("shorten trims only the covered part", () => {
	assert.deepEqual(brief(resolveOverlap(day, minutes("10:30"), minutes("13:15"), "shorten", day[0])), ["property 13:15-17:00"]);
	/* Moving into the middle of a block ends that block where the move begins. */
	assert.deepEqual(brief(resolveOverlap(day, minutes("16:30"), minutes("17:30"), "shorten", day[2])), ["property 12:30-16:30"]);
});
test("push ends a block the new time starts inside, and leaves later free time alone", () => {
	const r = resolveOverlap(day, minutes("16:00"), minutes("17:30"), "push", day[2]);
	assert.deepEqual(brief(r), ["property 12:30-16:00"]);
	assert.deepEqual(brief(resolveOverlap(day, minutes("18:00"), minutes("20:30"), "push")), ["late 20:30-21:30"]);
});
test("classes never move", () => {
	const withClass = [ev("study", "09:00", "10:00"), ev("torts", "10:00", "11:30", { category: "class" })];
	const r = resolveOverlap(withClass, minutes("09:00"), minutes("10:30"), "push", withClass[0]);
	assert.deepEqual(r.changes, []);
	assert.match(r.blocked, /torts is a class/);
	assert.deepEqual(resolveOverlap(withClass, minutes("09:00"), minutes("10:30"), "overlap", withClass[0]).changes, []);
});
test("limits: covered blocks cannot be shortened, nothing is pushed past midnight", () => {
	assert.match(resolveOverlap(day, minutes("12:00"), minutes("18:30"), "shorten", day[0]).blocked, /covered completely/);
	const lateDay = [ev("a", "22:00", "23:30")];
	assert.match(resolveOverlap(lateDay, minutes("21:00"), minutes("23:00"), "push").blocked, /past midnight/);
});
test("conflicts ignore the block itself and reminders", () => {
	const withReminder = [...day, ev("call", "12:00", "12:15", { eventType: "reminder" })];
	assert.deepEqual(conflicts(withReminder, minutes("10:30"), minutes("13:00"), day[0]).map((e) => e.id), ["property"]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { reorderIds, insertionIndex, movedTimes, resizedEnd, snap } from "./interactions.mjs";

test("reorder puts the dragged task before the target", () => {
	assert.deepEqual(reorderIds(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
	assert.deepEqual(reorderIds(["a", "b", "c"], "a", "c"), ["b", "a", "c"]);
});
test("reorder appends when dropped at the end or on an unknown target", () => {
	assert.deepEqual(reorderIds(["a", "b", "c"], "a"), ["b", "c", "a"]);
	assert.deepEqual(reorderIds(["a", "b"], "a", "zzz"), ["b", "a"]);
});
test("reorder adds a task that came from another group", () => {
	assert.deepEqual(reorderIds(["a", "b"], "x", "b"), ["a", "x", "b"]);
	assert.deepEqual(reorderIds([], "x"), ["x"]);
});
test("a drop between rows is found from their midpoints", () => {
	const mids = [100, 160, 220];
	assert.equal(insertionIndex(mids, 50), 0);
	assert.equal(insertionIndex(mids, 130), 1);
	assert.equal(insertionIndex(mids, 300), 3);
	assert.equal(insertionIndex([], 10), 0);
});
test("moving keeps the length, snaps and stays in the day", () => {
	assert.deepEqual(movedTimes("09:00", "10:30", 11 * 60 + 7), { start: "11:00", end: "12:30", minutes: 90 });
	assert.deepEqual(movedTimes("09:00", "10:00", 11 * 60 + 8), { start: "11:15", end: "12:15", minutes: 60 });
	assert.equal(movedTimes("09:00", "10:00", -50).start, "00:00");
	assert.deepEqual(movedTimes("09:00", "11:00", 23 * 60 + 30), { start: "21:45", end: "23:45", minutes: 120 });
});
test("resizing is at least 15 minutes and snaps", () => {
	assert.equal(resizedEnd("09:00", 9 * 60 + 2), "09:15");
	assert.equal(resizedEnd("09:00", 10 * 60 + 40), "10:45");
	assert.equal(resizedEnd("09:00", 99999), "23:59");
	assert.equal(snap(7), 0);
	assert.equal(snap(8), 15);
});

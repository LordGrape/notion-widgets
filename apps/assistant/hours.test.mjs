import test from "node:test";
import assert from "node:assert/strict";
import {
	classifyText,
	taskKind,
	unitsFor,
	weekStart,
	weekKeys,
	sessionEntries,
	classEntries,
	summarize,
	manualSession,
	appendSession,
	removeSession,
} from "./hours.mjs";

test("task text is tagged by the smart parser", () => {
	assert.equal(classifyText("Read Criminal Law pp. 78-98"), "reading");
	assert.equal(classifyText("pp. 70-78 of Torts Reading"), "reading");
	assert.equal(classifyText("Review class notes"), "study");
	assert.equal(classifyText("Prepare seminar outline"), "study");
	assert.equal(classifyText("Send memo draft"), "writing");
	assert.equal(classifyText("Read and outline chapter 4"), "reading");
	assert.equal(classifyText("Email the registrar"), "admin");
});
test("an explicit kind overrides the parser", () => {
	assert.equal(taskKind({ text: "Read cases", kind: "study" }), "study");
	assert.equal(taskKind({ text: "Read cases", kind: "bogus" }), "reading");
});
test("docket units are tenths of an hour", () => {
	assert.equal(unitsFor(2), 0);
	assert.equal(unitsFor(3), 0.1);
	assert.equal(unitsFor(30), 0.5);
	assert.equal(unitsFor(70), 1.2);
	assert.equal(unitsFor(60), 1);
});
test("weeks run Monday to Sunday", () => {
	assert.equal(weekStart(new Date(2026, 9, 2, 15)).getDay(), 1);
	assert.equal(weekStart(new Date(2026, 9, 4)).getDate(), 28);
	assert.deepEqual(weekKeys(new Date(2026, 9, 2)), [
		"2026-09-28",
		"2026-09-29",
		"2026-09-30",
		"2026-10-01",
		"2026-10-02",
		"2026-10-03",
		"2026-10-04",
	]);
	assert.equal(weekStart(new Date(2026, 9, 5)).getDate(), 5);
});
test("focus sessions become entries with task kind and narrative", () => {
	const end = new Date(2026, 9, 2, 12, 0).getTime();
	const tasks = [{ id: "a", text: "Read Criminal Law pp. 78-98" }];
	const [entry, ...rest] = sessionEntries(
		JSON.stringify([
			{ id: "s1", taskId: "a", seconds: 3600, completedAt: end },
			{ id: "s2", taskId: "a", seconds: 30, completedAt: end },
		]),
		tasks,
	);
	assert.equal(rest.length, 0);
	assert.equal(entry.kind, "reading");
	assert.equal(entry.description, "Read Criminal Law pp. 78-98");
	assert.equal(entry.minutes, 60);
	assert.equal(entry.end - entry.start, 3600000);
	const [noted] = sessionEntries(
		[{ id: "s3", taskId: "a", seconds: 600, completedAt: end, note: "Mens rea" }],
		tasks,
	);
	assert.equal(noted.description, "Mens rea");
});
test("class time counts only what has been attended", () => {
	const events = [
		{ id: "law", name: "LAW 195", category: "class", dateKey: "2026-10-02", start: "10:00", end: "11:30" },
		{ id: "gym", name: "Gym", category: "personal", dateKey: "2026-10-02", start: "12:00", end: "13:00" },
		{ id: "later", name: "LAW 200", category: "class", dateKey: "2026-10-02", start: "15:00", end: "16:00" },
	];
	const midClass = classEntries(events, new Date(2026, 9, 2, 11, 0));
	assert.deepEqual(midClass.map((e) => [e.id, e.minutes]), [["class:law:2026-10-02", 60]]);
	const after = classEntries(events, new Date(2026, 9, 2, 14, 0));
	assert.equal(after[0].minutes, 90);
});
test("weekly summary totals billable hours and excludes admin", () => {
	const now = new Date(2026, 9, 2, 18, 0);
	const at = (h) => new Date(2026, 9, 2, h).getTime();
	const tasks = [
		{ id: "r", text: "Read pp. 1-10" },
		{ id: "a", text: "Email registrar" },
	];
	const sessions = [
		{ id: "1", taskId: "r", seconds: 3600, completedAt: at(12) },
		{ id: "2", taskId: "a", seconds: 1800, completedAt: at(13) },
	];
	const classes = classEntries(
		[{ id: "law", name: "LAW 195", category: "class", dateKey: "2026-10-02", start: "10:00", end: "11:30" }],
		now,
	);
	const result = summarize([...sessionEntries(sessions, tasks), ...classes], now);
	assert.equal(result.byKind.reading, 1);
	assert.equal(result.byKind.class, 1.5);
	assert.equal(result.nonBillable, 0.5);
	assert.equal(result.billable, 2.5);
	assert.equal(result.pct, 7);
	assert.equal(result.pace, "behind");
	assert.equal(result.remaining, 32.5);
});
test("entries from previous weeks are ignored", () => {
	const now = new Date(2026, 9, 2, 18, 0);
	const old = new Date(2026, 8, 20, 12).getTime();
	const result = summarize(
		sessionEntries([{ id: "x", taskId: "", seconds: 3600, completedAt: old }], []),
		now,
	);
	assert.equal(result.billable, 0);
});
test("manual logs validate and merge into the Clock payload", () => {
	assert.throws(() => manualSession({ taskId: "a", minutes: 1 }));
	const entry = manualSession({ taskId: "a", minutes: 45, note: " Brief ", endAt: 1000 });
	assert.equal(entry.seconds, 2700);
	assert.equal(entry.note, "Brief");
	const first = appendSession("[]", entry);
	const again = appendSession(first, entry);
	assert.equal(JSON.parse(again).length, 1);
	const big = JSON.stringify(Array.from({ length: 300 }, (_, i) => ({ id: String(i) })));
	assert.equal(JSON.parse(appendSession(big, entry)).length, 300);
});
test("untethered sessions are tagged from their narrative and can be removed", () => {
	const end = new Date(2026, 9, 2, 12).getTime();
	const raw = JSON.stringify([
		{ id: "m1", taskId: "", seconds: 3600, completedAt: end, manual: true, note: "Memo draft on remedies" },
		{ id: "m2", taskId: "", seconds: 3600, completedAt: end, manual: true, note: "Read pp. 3-9" },
	]);
	assert.deepEqual(sessionEntries(raw, []).map((e) => e.kind), ["writing", "reading"]);
	assert.deepEqual(JSON.parse(removeSession(raw, "m1")).map((s) => s.id), ["m2"]);
});

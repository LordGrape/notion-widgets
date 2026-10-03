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
	heatRange,
	dayTotals,
	levelFor,
	heatCells,
	streakStats,
	moodFor,
	mergeEntries,
	comparison,
	practiceShare,
	isLateNight,
	lateNightHours,
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

const daysOf = (...pairs) => new Map(pairs);
test("heat range is whole Monday-first weeks ending this week", () => {
	const keys = heatRange("2026-10-02", 3);
	assert.equal(keys.length, 21);
	assert.equal(keys[0], "2026-09-14");
	assert.equal(keys[20], "2026-10-04");
});
test("day totals sum billable units per local day and skip admin", () => {
	const at = (d, h) => new Date(2026, 9, d, h).getTime();
	const totals = dayTotals([
		{ kind: "reading", minutes: 60, start: at(1, 9) },
		{ kind: "class", minutes: 90, start: at(1, 13) },
		{ kind: "admin", minutes: 120, start: at(1, 16) },
		{ kind: "study", minutes: 30, start: at(2, 9) },
	]);
	assert.equal(totals.get("2026-10-01"), 2.5);
	assert.equal(totals.get("2026-10-02"), 0.5);
});
test("levels scale against the daily target", () => {
	assert.equal(levelFor(0, 7), 0);
	assert.equal(levelFor(1, 7), 1);
	assert.equal(levelFor(2.5, 7), 2);
	assert.equal(levelFor(5, 7), 3);
	assert.equal(levelFor(7, 7), 4);
});
test("heat cells flag today and the future", () => {
	const { columns, months } = heatCells({ totals: daysOf(["2026-10-02", 7]), today: "2026-10-02", weeks: 2, dailyTarget: 7 });
	assert.equal(columns.length, 2);
	const today = columns[1].find((c) => c.today);
	assert.equal(today.level, 4);
	assert.equal(columns[1][6].future, true);
	assert.equal(months[0].week, 0);
});
test("weekends rest and weekdays break the streak", () => {
	const keys = heatRange("2026-10-09", 3);
	const active = ["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06"];
	const totals = new Map(active.map((k) => [k, 3]));
	const stats = streakStats(totals, keys, "2026-10-06");
	assert.equal(stats.current, 4);
	assert.equal(stats.best, 4);
	const recess = streakStats(totals, keys, "2026-10-08");
	assert.equal(recess.current, 4);
	assert.deepEqual(recess.recessDays, ["2026-10-07"]);
	assert.equal(recess.recessLeft, false);
	const broken = streakStats(totals, keys, "2026-10-09");
	assert.equal(broken.current, 0);
	assert.equal(broken.best, 4);
});
test("today does not break a streak before it has ended", () => {
	const keys = heatRange("2026-10-07", 2);
	const totals = new Map([["2026-10-05", 3], ["2026-10-06", 3]]);
	assert.equal(streakStats(totals, keys, "2026-10-07").current, 2);
});
test("streak milestones track progress", () => {
	const keys = heatRange("2026-10-09", 3);
	const totals = new Map(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"].map((k) => [k, 3]));
	const stats = streakStats(totals, keys, "2026-10-09");
	assert.equal(stats.current, 5);
	assert.equal(stats.next, 7);
	assert.equal(stats.progress, 50);
});

test("the partner's mood follows the week", () => {
	const base = { target: 35, expected: 20, billable: 20, pace: "on pace" };
	assert.equal(moodFor(base), "approve");
	assert.equal(moodFor({ ...base, billable: 23, pace: "ahead" }), "smug");
	assert.equal(moodFor({ ...base, billable: 17, pace: "behind" }), "stern");
	assert.equal(moodFor({ ...base, billable: 10, pace: "behind" }), "panic");
	assert.equal(moodFor({ ...base, billable: 17, pace: "behind" }, { sunday: true }), "panic");
	assert.equal(moodFor({ ...base, billable: 35 }), "happy");
	assert.equal(moodFor({ ...base, billable: 10, pace: "behind" }, { current: false }), "approve");
});

test("practice is its own type", () => {
	assert.equal(classifyText("Torts practice exam 2019"), "practice");
	assert.equal(classifyText("Anki flashcards for mens rea"), "practice");
	assert.equal(classifyText("Problem set 3"), "practice");
	assert.equal(classifyText("Review class notes"), "study");
	assert.equal(classifyText("Exam outline"), "study");
});
test("sessions on the same task and day merge into one docket line", () => {
	const at = (d, h) => new Date(2026, 9, d, h).getTime();
	const e = (taskId, start, minutes, source = "focus") => ({ taskId, kind: "reading", source, start, end: start + minutes * 60000, minutes, description: taskId });
	const merged = mergeEntries([e("a", at(2, 13), 54), e("a", at(2, 14), 15), e("a", at(2, 15), 14), e("a", at(3, 9), 30), e("b", at(2, 16), 20), e("", at(2, 17), 10, "manual")]);
	assert.equal(merged.length, 4);
	const first = merged[0];
	assert.equal(first.minutes, 83);
	assert.equal(first.sessions, 3);
	assert.equal(first.end, at(2, 15) + 14 * 60000);
});
test("a missed weekday uses the recess only when there is a streak to protect", () => {
	const keys = heatRange("2026-10-09", 2);
	const totals = new Map([["2026-10-05", 3]]);
	assert.equal(streakStats(new Map(), keys, "2026-10-08").recessDays.length, 0);
	assert.equal(streakStats(totals, keys, "2026-10-07").current, 1);
});
test("this week is compared with your own record", () => {
	const c = comparison({ billable: 10, target: 35 }, [{ billable: 20 }, { billable: 30 }]);
	assert.deepEqual(c, { last: 20, average: 25, toBeat: 10.1, toTarget: 25, beaten: false });
	assert.equal(comparison({ billable: 21, target: 35 }, [{ billable: 20 }]).beaten, true);
	assert.equal(comparison({ billable: 5, target: 35 }, []).average, 0);
});
test("practice share counts independent time only", () => {
	const s = practiceShare({ byKind: { class: 9, reading: 6, study: 2, practice: 2, writing: 0 } });
	assert.equal(s.independent, 10);
	assert.equal(s.share, 0.2);
});

test("work that ends after midnight is flagged", () => {
	const at = (h) => new Date(2026, 9, 2, h, 30).getTime();
	const late = { end: at(1), minutes: 60, units: 1 };
	const evening = { end: at(22), minutes: 60, units: 1 };
	assert.equal(isLateNight(late), true);
	assert.equal(isLateNight(evening), false);
	assert.equal(lateNightHours([late, evening, { end: at(3), minutes: 30, units: 0.5 }]), 1.5);
});

import { scheduledEntries } from "./hours.mjs";
const t0 = (hm) => new Date(`2026-10-02T${hm}:00`);
const plan = (id, text, from, to, extra = {}) => ({ id, text, scheduledStart: t0(from).toISOString(), scheduledEnd: t0(to).toISOString(), ...extra });

test("scheduled billable blocks count as their time passes", () => {
	const [e] = scheduledEntries([plan("p", "Practice public law fact pattern", "10:30", "12:30")], { now: t0("11:15") });
	assert.deepEqual([e.kind, e.minutes, e.live, e.source], ["practice", 45, true, "scheduled"]);
	assert.equal(scheduledEntries([plan("p", "Practice fact pattern", "10:30", "12:30")], { now: t0("14:00") })[0].minutes, 120);
});
test("scheduled entries skip admin, future, excluded and pre-feature blocks", () => {
	const tasks = [plan("d", "Create dinner", "10:00", "11:00"), plan("r", "Read Torts pp. 1-20", "15:00", "16:00"), plan("x", "Read Torts pp. 20-40", "09:00", "10:00")];
	assert.deepEqual(scheduledEntries(tasks, { now: t0("12:00"), excluded: ["plan:x:2026-10-02"] }), []);
	assert.deepEqual(scheduledEntries([tasks[2]], { now: t0("12:00"), since: t0("11:00").getTime() }), []);
});
test("scheduled time stops when the task is ticked off and never double-bills a session", () => {
	const done = plan("p", "Practice fact pattern", "10:00", "12:00", { done: true, doneAt: t0("11:00").toISOString() });
	assert.equal(scheduledEntries([done], { now: t0("13:00") })[0].minutes, 60);
	const session = { id: "s", taskId: "p", seconds: 1800, completedAt: t0("10:45").getTime() };
	assert.equal(scheduledEntries([plan("p", "Practice fact pattern", "10:00", "12:00")], { now: t0("13:00"), sessions: [session] })[0].minutes, 90);
	const manual = { id: "m", taskId: "p", seconds: 3600, completedAt: t0("18:00").getTime(), manual: true };
	assert.deepEqual(scheduledEntries([plan("p", "Practice fact pattern", "10:00", "12:00")], { now: t0("19:00"), sessions: [manual] }), []);
});

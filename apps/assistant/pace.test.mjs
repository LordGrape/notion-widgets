import test from "node:test";
import assert from "node:assert/strict";
import { courseOfTask, paceSamples, learnedPace, sprintCap, nextCommitment, replanRemaining } from "./pace.mjs";
import { sessionPlan } from "./sprints.mjs";

const names = ["LAW 140 Criminal Law", "LAW 150 Torts", "LAW 120 Contracts"];

test("a task is matched to the course named in its text", () => {
	assert.equal(courseOfTask("Read Criminal Law pp. 78–98", names), "criminal law");
	assert.equal(courseOfTask("read torts pp. 5-9", names), "torts");
	assert.equal(courseOfTask("Read the casebook pp. 5-9", names), "");
	assert.equal(courseOfTask("Read Criminal Law pp. 1-4", []), "");
});

const pages = (t) => (t.pages ? t.pages : 0);
const task = (id, text, pagesN, done = true, at = 1) => ({ id, text, pages: pagesN, done, created: at });
const session = (taskId, minutes) => ({ taskId, seconds: minutes * 60 });

test("a sample needs a finished task, its pages and at least three logged minutes", () => {
	const tasks = [task("a", "Read Torts pp. 1-10", 10), task("b", "Read Torts pp. 11-20", 10, false), task("c", "Read Torts pp. 21-30", 10), task("d", "Read Torts p. 31", 1)];
	const sessions = [session("a", 50), session("b", 50), session("c", 2), session("d", 10)];
	const samples = paceSamples({ tasks, sessions, pagesOf: pages, names });
	assert.equal(samples.length, 1);
	assert.equal(samples[0].pace, 5);
	assert.equal(samples[0].course, "torts");
});

test("sessions for one task are added together and absurd paces are dropped", () => {
	const tasks = [task("a", "Read Torts pp. 1-10", 10), task("z", "Read Torts pp. 1-100", 100)];
	const sessions = [session("a", 20), session("a", 30), session("z", 5)];
	const samples = paceSamples({ tasks, sessions, pagesOf: pages, names });
	assert.deepEqual(samples.map((s) => s.pace), [5]);
});

const sample = (course, pace, at) => ({ course, pace, pages: 10, minutes: pace * 10, at });

test("with no data the default pace is used", () => {
	assert.deepEqual(learnedPace([], "torts"), { pace: 6, source: "default", n: 0, course: "" });
});

test("three readings give an overall pace", () => {
	const r = learnedPace([sample("", 4, 1), sample("", 5, 2), sample("", 6, 3)], "");
	assert.equal(r.source, "overall");
	assert.equal(r.pace, 5);
});

test("a class with one reading is pulled halfway towards the overall pace", () => {
	const all = [sample("torts", 8, 1), sample("crim", 4, 2), sample("crim", 4, 3), sample("crim", 4, 4)];
	const r = learnedPace(all, "torts");
	assert.equal(r.source, "course");
	assert.equal(r.n, 1);
	assert.equal(r.pace, 5.25);
});

test("a class with many readings follows its own pace", () => {
	const all = [sample("", 4, 1), sample("", 4, 2), sample("", 4, 3), ...[8, 8, 8, 8, 8, 8].map((p, i) => sample("property", p, 10 + i))];
	assert.ok(learnedPace(all, "property").pace >= 7);
});

test("only the most recent readings of a class count", () => {
	const old = Array.from({ length: 6 }, (_, i) => sample("torts", 10, i));
	const fresh = Array.from({ length: 8 }, (_, i) => sample("torts", 4, 100 + i));
	assert.ok(learnedPace([...old, ...fresh], "torts").pace <= 4.5);
});

test("a sprint is longer when nothing is booked and shorter before something that is", () => {
	assert.deepEqual(sprintCap({ free: Infinity, remaining: 270 }), { max: 75, mode: "open", free: Infinity });
	assert.equal(sprintCap({ free: 400, remaining: 270 }).mode, "open");
	assert.equal(sprintCap({ free: 100, remaining: 270 }).mode, "normal");
	assert.equal(sprintCap({ free: 100, remaining: 270 }).max, 50);
	const tight = sprintCap({ free: 30, remaining: 270 });
	assert.equal(tight.mode, "tight");
	assert.equal(tight.max, 25);
	assert.ok(sprintCap({ free: 12, remaining: 270 }).max >= 10);
});

test("a short task is not trimmed when it fits before the next thing", () => {
	assert.equal(sprintCap({ free: 40, remaining: 30 }).mode, "normal");
	assert.equal(sprintCap({ free: 40, remaining: 270 }).mode, "tight");
	assert.equal(sprintCap({ free: Infinity, remaining: 40 }).mode, "normal");
});

test("the next commitment is the earliest one that has not started", () => {
	const now = 1000 * 60 * 600;
	const r = nextCommitment(now, [{ start: now - 1000, name: "past" }, { start: now + 90 * 60000, name: "Torts" }, { start: now + 30 * 60000, name: "Seminar" }]);
	assert.equal(r.free, 30);
	assert.equal(r.name, "Seminar");
	assert.equal(nextCommitment(now, []).free, Infinity);
});

const rowsFrom = (plan, doneCount = 0) => plan.map((r, i) => ({ id: "s" + i, text: r.text, done: r.kind === "sprint" && i < doneCount }));

test("a faster reader gets more pages in the remaining sprints", () => {
	const plan = sessionPlan({ minutes: 270, start: 144, end: 188 });
	const subs = rowsFrom(plan, 1);
	/* 8 pages done in 20 minutes: 2.5 min a page against a prior of 6 */
	const r = replanRemaining({ subs, taskId: "t", spentMinutes: 20, priorPace: 6 });
	assert.equal(r.observed, 2.5);
	assert.ok(r.pace < 6 && r.pace > 2.5);
	assert.equal(r.changed, true);
	const sprints = r.subs.filter((s) => /^Sprint/.test(s.text));
	assert.ok(sprints.length < 6, "fewer sprints are needed");
	assert.equal(r.subs.find((s) => s.done).text, plan[0].text);
	assert.match(sprints.find((s) => !s.done).text, /^Sprint 2: pp\. 152/);
	assert.equal(r.subs.at(-1).text.startsWith("Close the book"), true);
});

test("a slower reader gets fewer pages and more sprints", () => {
	const plan = sessionPlan({ minutes: 270, start: 144, end: 188 });
	const r = replanRemaining({ subs: rowsFrom(plan, 1), taskId: "t", spentMinutes: 120, priorPace: 6 });
	assert.ok(r.observed > 6);
	assert.ok(r.subs.filter((s) => /^Sprint/.test(s.text)).length >= 6);
});

test("the last page is always still covered after a re-plan", () => {
	const plan = sessionPlan({ minutes: 270, start: 144, end: 188 });
	const r = replanRemaining({ subs: rowsFrom(plan, 2), taskId: "t", spentMinutes: 60, priorPace: 6 });
	const ends = r.subs.filter((s) => /^Sprint/.test(s.text)).map((s) => +s.text.match(/(?:–|pp?\. )(\d+)\s*\(/)[1]);
	assert.equal(Math.max(...ends), 188);
});

test("nothing is re-planned before a sprint is done, or without page numbers", () => {
	const plan = sessionPlan({ minutes: 270, start: 144, end: 188 });
	assert.equal(replanRemaining({ subs: rowsFrom(plan, 0), taskId: "t", spentMinutes: 0, priorPace: 6 }), null);
	const plain = sessionPlan({ minutes: 120 });
	assert.equal(replanRemaining({ subs: rowsFrom(plain, 1), taskId: "t", spentMinutes: 40, priorPace: 6 }), null);
});

test("re-planning twice with the same pace changes nothing", () => {
	const plan = sessionPlan({ minutes: 270, start: 144, end: 188 });
	const first = replanRemaining({ subs: rowsFrom(plan, 1), taskId: "t", spentMinutes: 45, priorPace: 6, now: 1 });
	const again = replanRemaining({ subs: first.subs, taskId: "t", spentMinutes: 45, priorPace: 6, now: 2 });
	assert.equal(again.changed, false);
});

test("a ticked recall step is not added back", () => {
	const plan = sessionPlan({ minutes: 100, start: 1, end: 20 });
	const subs = plan.map((r) => ({ id: r.text, text: r.text, done: true }));
	const r = replanRemaining({ subs, taskId: "t", spentMinutes: 90, priorPace: 6 });
	assert.equal(r.subs.filter((s) => /^Close the book/.test(s.text)).length, 1);
	assert.equal(r.changed, false);
});

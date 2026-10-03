import test from "node:test";
import assert from "node:assert/strict";
import { sprintCount, sprintMinutes, breakAfter, sessionPlan, oversizedSteps, breakAfterStep } from "./sprints.mjs";

test("a short task is one block and a long one is cut into sprints of at most 50 minutes", () => {
	assert.equal(sprintCount(45), 1);
	assert.equal(sprintCount(55), 1);
	assert.equal(sprintCount(60), 2);
	assert.equal(sprintCount(233), 5);
	assert.equal(sprintMinutes(30), 30);
	assert.equal(sprintMinutes(233), 47);
	assert.ok(sprintMinutes(400) <= 50);
	assert.equal(sprintMinutes(0), 45);
	assert.equal(sprintMinutes(null), 45);
});

test("a short break between sprints and a longer one after every third", () => {
	assert.equal(breakAfter(1, 5), 10);
	assert.equal(breakAfter(2, 5), 10);
	assert.equal(breakAfter(3, 5), 25);
	assert.equal(breakAfter(4, 5), 10);
	assert.equal(breakAfter(5, 5), 0);
});

test("a page range is shared across sprints with no page lost or repeated", () => {
	const plan = sessionPlan({ minutes: 270, start: 144, end: 188 });
	const sprints = plan.filter((r) => r.kind === "sprint");
	assert.equal(sprints.length, 6);
	assert.ok(sprints.every((s) => s.minutes <= 50));
	const pages = sprints.map((s) => s.text.match(/pp?\. (\d+)(?:–(\d+))?/)).map((m) => [+m[1], +(m[2] || m[1])]);
	assert.equal(pages[0][0], 144);
	assert.equal(pages.at(-1)[1], 188);
	pages.slice(1).forEach(([a], i) => assert.equal(a, pages[i][1] + 1));
	assert.equal(plan.at(-1).kind, "recall");
});

test("without pages the plan is plain sprints and has no recall step", () => {
	const plan = sessionPlan({ minutes: 120 });
	assert.deepEqual(plan.map((r) => r.kind), ["sprint", "sprint", "sprint"]);
	assert.ok(plan[0].text.startsWith("Sprint 1 ("));
});

test("sprint minutes add up to the task", () => {
	const plan = sessionPlan({ minutes: 233, start: 1, end: 40 });
	assert.equal(plan.filter((r) => r.kind === "sprint").reduce((n, r) => n + r.minutes, 0), 233);
});

test("old two-hour steps are recognised as too long, sprint steps are not", () => {
	assert.equal(oversizedSteps([{ text: "Read pages 144–166 (138 min)" }, { text: "Read pages 167–188 (132 min)" }]), true);
	assert.equal(oversizedSteps([{ text: "Sprint 1: pp. 1–8 (48 min)" }]), false);
	assert.equal(oversizedSteps([]), false);
	assert.equal(oversizedSteps([{ text: "Read pages 78–88 (66 min)" }, { text: "Read pages 89–98 (60 min)" }]), true);
	assert.equal(oversizedSteps([{ text: "Sprint 1: pp. 1–8 (75 min)" }, { text: "Read the syllabus (40 min)" }]), false);
});

test("a saved sprint step knows which break follows it", () => {
	const subs = ["Sprint 1: a (45 min)", "Sprint 2: b (45 min)", "Sprint 3: c (45 min)", "Sprint 4: d (45 min)", "Close the book (5 min)"].map((text) => ({ text }));
	assert.deepEqual([0, 1, 2, 3, 4].map((i) => breakAfterStep(subs, i)), [10, 10, 25, 0, 0]);
});

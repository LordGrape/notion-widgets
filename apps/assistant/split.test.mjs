import test from "node:test";
import assert from "node:assert/strict";
import { suggestLastPage, planPageSplit, planTimeSplit, defaultRemaining } from "./split.mjs";

test("the suggested page follows time spent and keeps both halves real", () => {
	assert.equal(suggestLastPage({ start: 78, end: 98, plannedMinutes: 126, focusedMinutes: 63 }), 87);
	assert.equal(suggestLastPage({ start: 78, end: 98, plannedMinutes: 126, focusedMinutes: 200 }), 96);
	assert.equal(suggestLastPage({ start: 78, end: 98, plannedMinutes: 126, focusedMinutes: 1 }), 78);
	assert.equal(suggestLastPage({ start: 5, end: 5, plannedMinutes: 6, focusedMinutes: 3 }), 5);
});
test("a page range splits into a finished part and a remainder", () => {
	const plan = planPageSplit({ text: "Read Criminal Law pp. 78-98", plannedMinutes: 126, focusedMinutes: 66, start: 78, end: 98, lastPage: 88 });
	assert.equal(plan.doneText, "Read Criminal Law pp. 78–88");
	assert.equal(plan.restText, "Read Criminal Law pp. 89–98");
	assert.equal(plan.doneMinutes, 66);
	assert.equal(plan.restMinutes, 60);
});
test("a single remaining page reads naturally", () => {
	const plan = planPageSplit({ text: "Read pp. 10-12", plannedMinutes: 18, focusedMinutes: 12, start: 10, end: 12, lastPage: 11 });
	assert.equal(plan.restText, "Read p. 12");
	assert.equal(plan.doneText, "Read pp. 10–11");
});
test("bad page choices are rejected", () => {
	const base = { text: "Read pp. 1-10", plannedMinutes: 60, focusedMinutes: 20, start: 1, end: 10 };
	assert.throws(() => planPageSplit({ ...base, lastPage: 10 }), /Choose a page from 1 to 9/);
	assert.throws(() => planPageSplit({ ...base, lastPage: 0 }), /Choose a page/);
	assert.throws(() => planPageSplit({ ...base, start: null }), /no page range/);
});
test("a time split carries the rest forward without stacking labels", () => {
	const first = planTimeSplit({ text: "Outline torts", plannedMinutes: 90, focusedMinutes: 40 });
	assert.equal(first.restText, "Outline torts (continued)");
	assert.equal(first.restMinutes, 50);
	const second = planTimeSplit({ text: first.restText, plannedMinutes: 50, focusedMinutes: 20, remainingMinutes: 25 });
	assert.equal(second.restText, "Outline torts (continued)");
	assert.equal(second.restMinutes, 25);
	assert.equal(defaultRemaining({ plannedMinutes: 90, focusedMinutes: 40 }), 50);
});

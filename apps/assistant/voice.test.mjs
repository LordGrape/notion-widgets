import test from "node:test";
import assert from "node:assert/strict";
import { syllablePlan, mouthOpen, seeded } from "./voice.mjs";

test("a line becomes a bounded run of syllables", () => {
	const plan = syllablePlan("9.6 hours behind. This is not a drill.", "panic", seeded(3));
	assert.ok(plan.syllables.length >= 5 && plan.syllables.length <= 16);
	assert.ok(plan.duration > 0.8 && plan.duration < 4);
	for (let i = 1; i < plan.syllables.length; i++) assert.ok(plan.syllables[i].at >= plan.syllables[i - 1].at + plan.syllables[i - 1].len);
});
test("mood sets pitch and pace", () => {
	const line = "Right on pace. Hold the line.";
	const stern = syllablePlan(line, "stern", seeded(5)), panic = syllablePlan(line, "panic", seeded(5));
	const avg = (p) => p.syllables.reduce((n, s) => n + s.pitch, 0) / p.syllables.length;
	assert.ok(avg(stern) < avg(panic));
	assert.ok(panic.duration < stern.duration);
});
test("phrases fall in pitch toward the end", () => {
	const plan = syllablePlan("A pause is part of the work and the clock keeps running on the file", "approve", seeded(9));
	assert.ok(plan.syllables.at(-1).pitch < plan.syllables[0].pitch);
});
test("the mouth opens only while a syllable sounds", () => {
	const plan = syllablePlan("Steady billing.", "approve", seeded(2));
	const first = plan.syllables[0];
	assert.equal(mouthOpen(plan, 0), 0);
	assert.ok(mouthOpen(plan, first.at + first.len / 2) > 0.5);
	assert.equal(mouthOpen(plan, plan.duration + 1), 0);
	assert.equal(mouthOpen(null, 0.5), 0);
});

import { describe, expect, it } from "vitest";
import {
	buildPlan,
	dayKey,
	eligibleEvidence,
	latestAssessment,
	observations,
	parseTodos,
	planToTodos,
	practicePack,
	safeUrl,
	shiftDay,
	sourceReady,
	suggestedReview,
	validDay,
} from "./domain";
import {
	assessment,
	attempt,
	fixtureWorkspace,
	practice,
	NOW,
} from "./test-fixtures";
import { snapshotContext } from "./repository";

describe("calendar dates and source safety", () => {
	it("uses Toronto calendar days rather than UTC dates", () => {
		expect(dayKey(new Date("2026-09-30T01:00:00Z"))).toBe("2026-09-29");
	});
	it("shifts calendar days across daylight-saving changes", () => {
		expect(shiftDay("2026-03-07", 2)).toBe("2026-03-09");
		expect(shiftDay("2026-10-31", 2)).toBe("2026-11-02");
	});
	it("rejects impossible dates", () => {
		expect(validDay("2026-02-30")).toBe(false);
		expect(validDay("2024-02-29")).toBe(true);
	});
	it.each([
		"javascript:alert(1)",
		"data:text/plain,example",
		"file:///tmp/example",
		"https://user:secret@example.org",
	])("rejects unsafe source %s", (url) => {
		expect(safeUrl(url)).toBe(false);
	});
	it("requires source detail and practice permission before scheduling", () => {
		expect(sourceReady(practice({ permittedPractice: false }))).toBe(false);
		expect(
			sourceReady(practice({ source: { ...practice().source, pinpoint: "" } })),
		).toBe(false);
	});
});

describe("planning is bounded and does not infer competence", () => {
	it("never overfills the selected session budget", () => {
		const state = fixtureWorkspace();
		state.practices["long"] = practice({
			id: "long",
			minutes: 45,
			priority: "high",
		});
		const plan = buildPlan(state, "2026-09-29");
		expect(plan.minutes).toBe(5);
		expect(plan.budget).toBe(20);
		expect(plan.remaining).toBe(1);
	});
	it("excludes archived, unpermitted, and future practice", () => {
		const state = fixtureWorkspace();
		state.practices["practice-apollo"] = practice({ nextReview: "2026-10-01" });
		state.practices["draft"] = practice({
			id: "draft",
			permittedPractice: false,
		});
		state.practices["archived"] = practice({ id: "archived", archived: true });
		expect(buildPlan(state, "2026-09-29").steps).toEqual([]);
	});
	it("uses adjustable review defaults without changing the practice category", () => {
		const original = practice({ kind: "apply" });
		expect(suggestedReview(assessment(), attempt(), "2026-09-29")).toBe(
			"2026-10-06",
		);
		expect(
			suggestedReview(
				assessment("ai", { assessor: "ai" }),
				attempt(),
				"2026-09-29",
			),
		).toBe("2026-09-30");
		expect(original.kind).toBe("apply");
	});
	it("snapshots source and checklist before later library edits", () => {
		const p = practice(),
			snapshot = snapshotContext(p);
		p.source.pinpoint = "Changed source section";
		p.checklist = "Changed checklist";
		expect(snapshot.source.pinpoint).toBe("Landing timeline");
		expect(snapshot.checklist).toContain("1969");
	});
});

describe("provenance and narrow observations", () => {
	it("excludes AI scores even when their source check is ticked", () => {
		expect(
			eligibleEvidence(
				attempt(),
				assessment("ai", { assessor: "ai", sourceChecked: true }),
			),
		).toBe(false);
	});
	it("excludes open-note, assisted, and unverified-checklist attempts", () => {
		expect(
			eligibleEvidence(attempt("open", { notesMode: "open" }), assessment()),
		).toBe(false);
		expect(
			eligibleEvidence(attempt("help", { assistance: "hint" }), assessment()),
		).toBe(false);
		expect(
			eligibleEvidence(
				attempt("unchecked", {
					context: { ...attempt().context, checklistChecked: false },
				}),
				assessment(),
			),
		).toBe(false);
	});
	it("does not diagnose from sparse or same-day evidence", () => {
		const state = fixtureWorkspace();
		for (let i = 0; i < 3; i++) {
			state.attempts[`a${i}`] = attempt(`a${i}`);
			state.assessments[`s${i}`] = assessment(`s${i}`, { attemptId: `a${i}` });
		}
		expect(observations(state)).toEqual([]);
	});
	it("reports sample, provenance, days, variants, and repeated tags", () => {
		const state = fixtureWorkspace();
		for (let i = 0; i < 3; i++) {
			const time = i === 2 ? "2026-09-30T16:00:00.000Z" : NOW;
			state.attempts[`a${i}`] = attempt(`a${i}`, {
				startedAt: time,
				submittedAt: time,
			});
			state.assessments[`s${i}`] = assessment(`s${i}`, {
				attemptId: `a${i}`,
				gaps: ["rule"],
				recordedAt: time,
			});
		}
		const result = observations(state)[0]!;
		expect(result).toMatchObject({
			sample: 3,
			days: 2,
			variants: 1,
			supported: 3,
			selfAssessed: 3,
		});
		expect(result.gaps).toEqual([{ gap: "rule", occurrences: 3 }]);
		expect(result).not.toHaveProperty("mastery");
	});
	it("uses a correction without deleting the original assessment", () => {
		const state = fixtureWorkspace();
		state.attempts["attempt-a"] = attempt();
		state.assessments["assessment-a"] = assessment();
		state.assessments["correction"] = assessment("correction", {
			verdict: "partial",
			supersedes: "assessment-a",
			recordedAt: "2026-09-30T16:00:00.000Z",
		});
		expect(latestAssessment(state, "attempt-a")?.verdict).toBe("partial");
		expect(Object.keys(state.assessments)).toHaveLength(2);
	});
});
describe("private import and To-do contracts", () => {
	const pack = () => ({
		format: "study-engine-practice",
		version: 1,
		items: [practice()],
	});
	it("resets AI-provided verification and permission claims on import", () => {
		const imported = practicePack(pack())[0]!;
		expect(imported.checklistChecked).toBe(false);
		expect(imported.permittedPractice).toBe(false);
		expect(imported.id).not.toBe("practice-apollo");
	});
	it("rejects missing source pinpoints and unsafe links before import", () => {
		const value = pack();
		value.items[0]!.source.url = "javascript:alert(1)";
		expect(() => practicePack(value)).toThrow();
		value.items[0]!.source = { ...practice().source, pinpoint: "" };
		expect(() => practicePack(value)).toThrow(/pinpoint/);
	});
	it("bounds pack size instead of silently truncating it", () => {
		expect(() =>
			practicePack({
				...pack(),
				items: Array.from({ length: 101 }, () => practice()),
			}),
		).toThrow(/100/);
	});
	it("preserves edited task text, substeps, completion, and unrelated tasks", () => {
		const plan = buildPlan(fixtureWorkspace(), "2026-09-29"),
			first = planToTodos(plan, []).tasks[0]!;
		const edited = {
			...first,
			text: "Edited public test task",
			done: true,
			subs: [{ text: "Synthetic substep", done: true }],
		};
		const unrelated = {
			id: "unrelated-public-test",
			text: "Check a geometry proof",
			done: false,
		};
		const result = planToTodos(plan, [edited, unrelated]);
		expect(result.added).toBe(0);
		expect(result.tasks).toEqual([edited, unrelated]);
	});
	it("uses the actual widget fields and stable occurrence IDs", () => {
		const plan = buildPlan(fixtureWorkspace(), "2026-09-29"),
			first = planToTodos(plan, []).tasks[0]!;
		expect(first).toMatchObject({
			id: "studyengine:2026-09-29:practice-apollo:retrieve",
			pri: "should",
			time: "quick",
			plannedMinutes: 5,
			done: false,
		});
		expect(planToTodos(plan, [first]).added).toBe(0);
	});
	it("rejects damaged To-do data rather than replacing it with an empty list", () => {
		expect(() => parseTodos('{"unrecognized":true}')).toThrow(
			/Nothing was sent/,
		);
	});
	it("does not turn task completion into learning evidence", () => {
		const state = fixtureWorkspace(),
			before = structuredClone(state);
		planToTodos(buildPlan(state, "2026-09-29"), [
			{ id: "external-task", done: true },
		]);
		expect(state).toEqual(before);
	});
});

it("orders assessment evidence by the instant, not the written timezone offset", () => {
	const state = fixtureWorkspace();
	state.assessments.earlier = assessment("earlier", {
		recordedAt: "2026-09-29T16:00:00.000Z",
	});
	state.assessments.later = assessment("later", {
		recordedAt: "2026-09-29T14:00:00-04:00",
	});
	expect(latestAssessment(state, "attempt-a")?.id).toBe("later");
});

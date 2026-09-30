import { describe, expect, it, vi } from "vitest";
import { MANIFEST_KEY, emptyWorkspace } from "./domain";
import {
	EvidenceRepository,
	loadNamespace,
	recordKey,
	remoteContains,
	remoteNamespace,
	snapshotContext,
	unwrapRemote,
} from "./repository";
import {
	assessment,
	attempt,
	MemorySync,
	NOW,
	practice,
} from "./test-fixtures";

function setup() {
	const sync = new MemorySync();
	const repository = new EvidenceRepository(sync);
	return { sync, repository };
}
describe("safe loading and migration", () => {
	it("does not write during load or invent evidence for an empty workspace", () => {
		const { sync, repository } = setup();
		const loaded = repository.load();
		expect(sync.writes).toHaveLength(0);
		expect(loaded.workspace.attempts).toEqual({});
		expect(loaded.workspace.manifest.settings.sessionMinutes).toBe(20);
	});
	it.each([
		{ version: 99 },
		"{broken",
		{ version: 2, settings: { sessionMinutes: -1 } },
	])("blocks unknown or damaged saved state: %s", (raw) => {
		const sync = new MemorySync({ studyengine: { [MANIFEST_KEY]: raw } }),
			repository = new EvidenceRepository(sync);
		expect(repository.load().blocked).not.toBeNull();
		expect(() => repository.commit([practice()])).toThrow();
		expect(sync.get("studyengine", MANIFEST_KEY)).toEqual(raw);
		expect(sync.writes).toHaveLength(0);
	});
	it("blocks unsupported record versions", () => {
		const raw = { ...practice(), schemaVersion: 3 };
		expect(
			loadNamespace({ [recordKey(practice())]: raw }).blocked,
		).not.toBeNull();
		expect(
			loadNamespace({ "evidence.v3.practice.future": raw }).blocked,
		).not.toBeNull();
	});
	it("requires explicit migration of the previous anchor", () => {
		const legacy = {
			version: 1,
			items: {
				old: {
					id: "old",
					course: "Public history",
					topic: "Apollo 11",
					prompt: "What year?",
					answer: "1969",
					reviews: [{ rating: 4 }],
				},
			},
			sessions: [{ completed: 1 }],
		};
		const sync = new MemorySync({ studyengine: { [MANIFEST_KEY]: legacy } }),
			repository = new EvidenceRepository(sync);
		expect(repository.load().legacy).toHaveLength(1);
		expect(sync.writes).toHaveLength(0);
		expect(() => repository.commit([practice()])).toThrow(/migration/);
		const migrated = repository.migrate(),
			loaded = repository.load();
		expect(migrated).toEqual({ imported: 1, excludedRatings: 1 });
		expect(loaded.blocked).toBeNull();
		expect(Object.values(loaded.workspace.backups)[0]?.raw).toEqual(legacy);
		expect(Object.values(loaded.workspace.practices)[0]).toMatchObject({
			permittedPractice: false,
			checklistChecked: false,
		});
		expect(loaded.workspace.attempts).toEqual({});
		expect(loaded.workspace.assessments).toEqual({});
	});
	it("keeps the legacy local fallback read-only until explicit migration", () => {
		const raw = JSON.stringify({
			items: { old: { id: "old", prompt: "What year?", topic: "Apollo 11" } },
		});
		const sync = new MemorySync(),
			repository = new EvidenceRepository(sync, () => raw);
		expect(repository.load().legacy).toHaveLength(1);
		expect(sync.writes).toHaveLength(0);
		repository.migrate();
		expect(repository.load().legacy).toHaveLength(0);
	});
});
describe("append-only evidence and recovery", () => {
	it("keeps an original response immutable", () => {
		const { sync, repository } = setup();
		repository.commit([practice(), attempt()]);
		expect(() =>
			repository.commit([attempt("attempt-a", { answer: "Changed response" })]),
		).toThrow(/cannot be edited/);
		expect(sync.get("studyengine", recordKey(attempt()))).toMatchObject({
			answer: "1969",
		});
	});
	it("adds a correction while preserving prior feedback", () => {
		const { repository } = setup();
		repository.commit([practice(), attempt(), assessment()]);
		const correction = assessment("correction", {
			supersedes: "assessment-a",
			verdict: "partial",
		});
		repository.commit([correction]);
		expect(Object.keys(repository.load().workspace.assessments)).toHaveLength(
			2,
		);
		expect(() =>
			repository.commit([
				assessment("assessment-a", { verdict: "needs-work" }),
			]),
		).toThrow();
	});
	it("rejects dangling and circular correction histories before writes", () => {
		const { sync, repository } = setup();
		repository.commit([practice(), attempt()]);
		const writes = sync.writes.length;
		expect(() =>
			repository.commit([assessment("broken", { supersedes: "missing" })]),
		).toThrow(/history/);
		expect(() =>
			repository.commit([assessment("loop", { supersedes: "loop" })]),
		).toThrow(/circular/);
		expect(sync.writes).toHaveLength(writes);
	});
	it("retains the source snapshot after later practice edits", () => {
		const { repository } = setup();
		repository.commit([practice(), attempt()]);
		repository.commit([practice({ checklist: "Revised checklist" })]);
		expect(
			repository.load().workspace.attempts["attempt-a"]?.context.checklist,
		).toContain("1969");
	});
	it("round-trips a private backup without duplicating records", () => {
		const { repository } = setup();
		repository.commit([practice(), attempt(), assessment()]);
		const backup = repository.backup(),
			target = setup();
		expect(target.repository.restore(backup)).toBe(3);
		expect(target.repository.restore(backup)).toBe(0);
		expect(
			target.repository.load().workspace.attempts["attempt-a"]?.answer,
		).toBe("1969");
	});
	it("refuses conflicting restore records instead of silently overwriting", () => {
		const source = setup();
		source.repository.commit([practice(), attempt()]);
		const target = setup();
		target.repository.commit([
			practice(),
			attempt("attempt-a", { answer: "Different public test response" }),
		]);
		expect(() => target.repository.restore(source.repository.backup())).toThrow(
			/conflicts/,
		);
	});
	it("exports damaged data as a recovery copy, not a reset workspace", () => {
		const sync = new MemorySync({
				studyengine: { [MANIFEST_KEY]: { version: 42 } },
			}),
			repository = new EvidenceRepository(sync);
		expect(JSON.parse(repository.backup())).toMatchObject({
			format: "study-engine-recovery",
			namespace: { [MANIFEST_KEY]: { version: 42 } },
		});
	});
});
describe("honest cloud confirmation", () => {
	it("unwraps the existing timestamp contract and an empty namespace", () => {
		expect(
			unwrapRemote({ value: { sample: { value: practice(), _ts: 1 } } }),
		).toEqual({ sample: practice() });
		expect(unwrapRemote({ value: null })).toEqual({});
	});
	it("requires matching cloud content, not merely a successful flush", () => {
		expect(remoteContains({}, { expected: attempt() })).toBe(false);
		expect(
			remoteContains({ expected: attempt() }, { expected: attempt() }),
		).toBe(true);
		expect(
			remoteContains(
				{ expected: attempt("attempt-a", { answer: "Different" }) },
				{ expected: attempt() },
			),
		).toBe(false);
	});
	it("refuses an old backend before any SDK writes", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response(JSON.stringify({ value: null }))),
		);
		await expect(
			remoteNamespace("studyengine", "synthetic-test-key"),
		).rejects.toThrow(/not deployed/);
		vi.unstubAllGlobals();
	});
});

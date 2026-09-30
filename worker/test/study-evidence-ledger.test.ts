import { describe, expect, it } from "vitest";
import {
	StudyEvidenceLedger,
	evidenceValues,
} from "../src/study-evidence-ledger";
import { handleState } from "../src/routes/state";
import type { Env } from "../src/types";
import {
	assessment,
	attempt,
	practice,
	NOW,
} from "../../studyengine/app/test-fixtures";

function harness() {
	let data = new Map<string, unknown>();
	let serial: Promise<void> = Promise.resolve();
	const list = async <T>(
		source: Map<string, unknown>,
		options?: { prefix?: string },
	): Promise<Map<string, T>> =>
		new Map(
			[...source].filter(
				([key]) => !options?.prefix || key.startsWith(options.prefix),
			),
		) as Map<string, T>;
	const storage = {
		list: <T>(options?: { prefix?: string }) => list<T>(data, options),
		transaction: <T>(
			callback: (transaction: DurableObjectTransaction) => Promise<T>,
		): Promise<T> => {
			const run = serial.then(async () => {
				const draft = new Map(data);
				const transaction = {
					list: <V>(options?: { prefix?: string }) => list<V>(draft, options),
					put: async (values: Record<string, unknown>) => {
						for (const [key, value] of Object.entries(values))
							draft.set(key, value);
					},
				} as unknown as DurableObjectTransaction;
				const value = await callback(transaction);
				data = draft;
				return value;
			});
			serial = run.then(
				() => undefined,
				() => undefined,
			);
			return run;
		},
	};
	const ledger = new StudyEvidenceLedger({
		storage,
	} as unknown as DurableObjectState);
	const namespace = {
		idFromName: () => "test-object",
		get: () => ({
			fetch: (url: string, options?: RequestInit) =>
				ledger.fetch(new Request(url, options)),
		}),
	} as unknown as DurableObjectNamespace;
	const record = (
		id: string,
		type = "attempt",
		extra: Record<string, unknown> = {},
	) => ({
		[`evidence.v2.${type}.${id}`]: {
			value:
				type === "attempt"
					? { ...attempt(id), ...extra }
					: type === "assessment"
						? { ...assessment(id), ...extra }
						: type === "practice"
							? { ...practice({ id }), ...extra }
							: {
									schemaVersion: 2,
									type: "legacy-backup",
									id,
									sourceKey: "state",
									capturedAt: NOW,
									raw: {},
									...extra,
								},
			_ts: 1,
		},
	});
	const post = (values: Record<string, unknown>) =>
		ledger.fetch(
			new Request("https://test.invalid/records", {
				method: "POST",
				body: JSON.stringify(values),
			}),
		);
	const read = async () =>
		(await (
			await ledger.fetch(new Request("https://test.invalid/records"))
		).json()) as { value: Record<string, unknown> };
	return { ledger, namespace, record, post, read };
}

describe("isolated serialized evidence storage", () => {
	it("retains distinct records from simultaneous clients", async () => {
		const h = harness();
		const responses = await Promise.all([
			h.post(h.record("apollo-a")),
			h.post(h.record("apollo-b")),
		]);
		expect(responses.map((r) => r.status)).toEqual([200, 200]);
		expect(Object.keys((await h.read()).value)).toHaveLength(2);
	});
	it("cannot replace an original attempt, even with a newer timestamp", async () => {
		const h = harness();
		await h.post(h.record("apollo-a", "attempt", { answer: "1969" }));
		const changed = h.record("apollo-a", "attempt", {
			answer: "Changed test response",
		});
		changed["evidence.v2.attempt.apollo-a"]!._ts = 100;
		expect((await h.post(changed)).status).toBe(409);
		const record = (await h.read()).value["evidence.v2.attempt.apollo-a"] as {
			value: { answer: string };
		};
		expect(record.value.answer).toBe("1969");
	});
	it("rolls back the whole batch if any immutable record conflicts", async () => {
		const h = harness();
		await h.post(h.record("original", "attempt", { answer: "1969" }));
		expect(
			(
				await h.post({
					...h.record("new"),
					...h.record("original", "attempt", { answer: "Different" }),
				})
			).status,
		).toBe(409);
		expect(Object.keys((await h.read()).value)).toHaveLength(1);
	});
	it("allows attributed corrections while retaining previous assessments", async () => {
		const h = harness();
		await h.post(h.record("apollo-a"));
		await h.post(
			h.record("feedback-a", "assessment", {
				attemptId: "apollo-a",
				supersedes: null,
			}),
		);
		expect(
			(
				await h.post(
					h.record("feedback-b", "assessment", {
						attemptId: "apollo-a",
						supersedes: "feedback-a",
					}),
				)
			).status,
		).toBe(200);
		expect(Object.keys((await h.read()).value)).toHaveLength(3);
	});
	it("rejects dangling assessment references", async () => {
		const h = harness();
		expect(
			(
				await h.post(
					h.record("feedback-a", "assessment", { attemptId: "missing" }),
				)
			).status,
		).toBe(409);
	});
	it("rejects unsupported evidence versions and malformed keys", async () => {
		const h = harness();
		expect(
			(
				await h.post({
					"evidence.v3.attempt.future": {
						value: { schemaVersion: 3, type: "attempt", id: "future" },
						_ts: 1,
					},
				})
			).status,
		).toBe(409);
		expect(
			(
				await h.post({
					"evidence.v2.attempt.wrong": {
						value: { schemaVersion: 2, type: "attempt", id: "different" },
						_ts: 1,
					},
				})
			).status,
		).toBe(409);
	});
	it("does not capture unrelated shared namespace fields", () => {
		expect(
			evidenceValues({ tasks: "[]", xp: 42, state: { old: true } }),
		).toEqual({});
	});
});

describe("existing state API compatibility", () => {
	function environment(h: ReturnType<typeof harness>) {
		const kv = new Map<string, unknown>();
		const env = {
			STUDY_EVIDENCE: h.namespace,
			WIDGET_KV: {
				get: async (key: string) => kv.get(key) ?? null,
				put: async (key: string, value: string) => {
					kv.set(key, JSON.parse(value) as unknown);
				},
			},
		} as unknown as Env;
		return { env, kv };
	}
	it("protects v2 evidence when an old client replaces the legacy namespace", async () => {
		const h = harness(),
			{ env } = environment(h);
		await handleState(
			new Request("https://test.invalid/state/studyengine", {
				method: "PUT",
				body: JSON.stringify({ value: h.record("apollo-a") }),
			}),
			env,
			"studyengine",
		);
		await handleState(
			new Request("https://test.invalid/state/studyengine", {
				method: "PUT",
				body: JSON.stringify({ value: { state: { items: {} } } }),
			}),
			env,
			"studyengine",
		);
		const response = await handleState(
			new Request("https://test.invalid/state/studyengine"),
			env,
			"studyengine",
		);
		const result = (await response.json()) as {
			evidenceLedger: number;
			value: Record<string, unknown>;
		};
		expect(result.evidenceLedger).toBe(2);
		expect(result.value).toHaveProperty("evidence.v2.attempt.apollo-a");
		expect(result.value).toHaveProperty("state");
	});
	it("keeps the To-do state contract unchanged", async () => {
		const h = harness(),
			{ env } = environment(h),
			value = { tasks: { value: "[]", _ts: 123 } };
		await handleState(
			new Request("https://test.invalid/state/todo", {
				method: "PUT",
				body: JSON.stringify({ value }),
			}),
			env,
			"todo",
		);
		const response = await handleState(
			new Request("https://test.invalid/state/todo"),
			env,
			"todo",
		);
		expect(await response.json()).toEqual({ key: "todo", value });
		expect(Object.keys((await h.read()).value)).toHaveLength(0);
	});
	it("refuses v2 writes if the ledger binding is absent, without modifying KV", async () => {
		const h = harness(),
			{ env, kv } = environment(h);
		delete env.STUDY_EVIDENCE;
		const response = await handleState(
			new Request("https://test.invalid/state/studyengine", {
				method: "PUT",
				body: JSON.stringify({ value: h.record("apollo-a") }),
			}),
			env,
			"studyengine",
		);
		expect(response.status).toBe(503);
		expect(kv.has("studyengine")).toBe(false);
	});
});

it("checks original and corrected feedback chronology across timezone offsets", async () => {
	const h = harness();
	await h.post(h.record("apollo-a"));
	expect(
		(
			await h.post(
				h.record("feedback-offset", "assessment", {
					attemptId: "apollo-a",
					recordedAt: "2026-09-29T14:00:00-04:00",
				}),
			)
		).status,
	).toBe(200);
	expect(
		(
			await h.post(
				h.record("feedback-before", "assessment", {
					attemptId: "apollo-a",
					recordedAt: "2026-09-29T17:00:00.000Z",
					supersedes: "feedback-offset",
				}),
			)
		).status,
	).toBe(409);
});

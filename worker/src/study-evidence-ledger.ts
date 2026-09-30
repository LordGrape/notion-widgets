/**
 * Isolated, serialized storage for Study Engine v2.
 * Other widget namespaces and all tutoring/grading routes are unchanged.
 * The public state API still uses the existing { value, _ts } entry contract.
 */
type Entry = { value: unknown; _ts: number };
import {
	validManifest,
	validRecord,
} from "../../packages/study-evidence/protocol";
const PREFIX = "evidence.v2.";
const MANIFEST = "lawSchoolState";

function object(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonical);
	if (object(value))
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((key) => [key, canonical(value[key])]),
		);
	return value;
}

function same(left: unknown, right: unknown): boolean {
	return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
		},
	});
}

export function evidenceValues(
	namespace: Record<string, unknown>,
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(namespace).filter(([key, raw]) => {
			if (key.startsWith("evidence.")) return true;
			const value =
				object(raw) && Object.hasOwn(raw, "value") ? raw.value : raw;
			return key === MANIFEST && object(value) && value.version === 2;
		}),
	);
}

function validateEntry(key: string, raw: unknown): Entry {
	if (
		!object(raw) ||
		!Object.hasOwn(raw, "value") ||
		typeof raw._ts !== "number" ||
		!Number.isFinite(raw._ts) ||
		raw._ts < 0
	) {
		throw new Error(
			"Evidence entries require the shared sync timestamp wrapper.",
		);
	}
	const value = raw.value;
	if (!object(value))
		throw new Error("Evidence entries must contain a supported record.");
	if (key === MANIFEST) {
		if (!validManifest(value))
			throw new Error("Unsupported evidence workspace version.");
	} else {
		if (!key.startsWith(PREFIX) || !validRecord(value))
			throw new Error("Unsupported or invalid evidence record.");
		if (
			typeof value.id !== "string" ||
			!/^[a-zA-Z0-9:._-]{1,160}$/.test(value.id) ||
			["__proto__", "constructor", "prototype"].includes(value.id) ||
			key !== `${PREFIX}${String(value.type)}.${value.id}`
		)
			throw new Error("Evidence record ID does not match its key.");
	}
	return { value, _ts: raw._ts };
}

export class StudyEvidenceLedger {
	constructor(private readonly state: DurableObjectState) {}

	async fetch(request: Request): Promise<Response> {
		if (request.method === "GET") {
			const stored = await this.state.storage.list<Entry>({ prefix: "entry:" });
			return json({
				version: 2,
				value: Object.fromEntries(
					[...stored].map(([key, entry]) => [
						key.slice("entry:".length),
						entry,
					]),
				),
			});
		}
		if (request.method !== "POST")
			return json({ error: "Method not allowed" }, 405);
		try {
			const raw: unknown = await request.json();
			if (!object(raw))
				return json({ error: "Evidence update must be an object." }, 400);
			const incoming = Object.fromEntries(
				Object.entries(raw).map(([key, entry]) => [
					key,
					validateEntry(key, entry),
				]),
			);
			await this.state.storage.transaction(async (transaction) => {
				const stored = await transaction.list<Entry>({ prefix: "entry:" });
				const next: Record<string, Entry> = {};
				for (const [key, entry] of Object.entries(incoming)) {
					const storageKey = `entry:${key}`;
					const previous = stored.get(storageKey);
					const value = entry.value as Record<string, unknown>;
					const immutable = key !== MANIFEST && value.type !== "practice";
					if (previous && immutable && !same(previous.value, entry.value)) {
						throw new Error(
							"Original evidence is immutable. Record an assessment correction instead.",
						);
					}
					if (!previous || (!immutable && entry._ts >= previous._ts))
						next[storageKey] = entry;
				}
				// Assessments cannot point to missing attempts or another attempt's history.
				const combined = new Map(stored);
				for (const [key, entry] of Object.entries(next))
					combined.set(key, entry);
				for (const entry of Object.values(next)) {
					if (!object(entry.value) || entry.value.type !== "assessment")
						continue;
					const assessment = entry.value;
					const attempt = combined.get(
						`entry:${PREFIX}attempt.${String(assessment.attemptId)}`,
					);
					if (
						!attempt ||
						!object(attempt.value) ||
						Date.parse(String(attempt.value.submittedAt)) >
							Date.parse(String(assessment.recordedAt))
					) {
						throw new Error(
							"Assessment is missing its original attempt or predates it.",
						);
					}
					if (
						assessment.supersedes !== null &&
						assessment.supersedes !== undefined
					) {
						const previous = combined.get(
							`entry:${PREFIX}assessment.${String(assessment.supersedes)}`,
						);
						if (
							!previous ||
							!object(previous.value) ||
							previous.value.attemptId !== assessment.attemptId
						) {
							throw new Error(
								"Assessment correction does not match its original attempt.",
							);
						}
						if (
							Date.parse(String(previous.value.recordedAt)) >
							Date.parse(String(assessment.recordedAt))
						)
							throw new Error(
								"Assessment correction predates its original assessment.",
							);
					}
					const seen = new Set([String(assessment.id)]);
					let cursor: Record<string, unknown> | undefined = assessment;
					while (cursor?.supersedes) {
						if (seen.has(String(cursor.supersedes)))
							throw new Error("Assessment correction history is circular.");
						seen.add(String(cursor.supersedes));
						const previous = combined.get(
							`entry:${PREFIX}assessment.${String(cursor.supersedes)}`,
						);
						cursor =
							previous && object(previous.value) ? previous.value : undefined;
					}
				}
				if (Object.keys(next).length) await transaction.put(next);
			});
			return json({ ok: true, version: 2 });
		} catch (error) {
			return json(
				{
					error:
						error instanceof Error
							? error.message
							: "Evidence update was not accepted.",
				},
				409,
			);
		}
	}
}

export async function readEvidence(env: {
	STUDY_EVIDENCE?: DurableObjectNamespace;
}): Promise<Record<string, unknown>> {
	if (!env.STUDY_EVIDENCE)
		throw new Error("Evidence ledger is not configured.");
	const response = await env.STUDY_EVIDENCE.get(
		env.STUDY_EVIDENCE.idFromName("study-engine-v2"),
	).fetch("https://ledger.internal/records");
	if (!response.ok) throw new Error("Evidence ledger is unavailable.");
	const body: unknown = await response.json();
	if (!object(body) || body.version !== 2 || !object(body.value))
		throw new Error("Evidence ledger response is unsupported.");
	return body.value;
}

export async function writeEvidence(
	env: { STUDY_EVIDENCE?: DurableObjectNamespace },
	values: Record<string, unknown>,
): Promise<Response> {
	if (!env.STUDY_EVIDENCE)
		return json(
			{ error: "Evidence ledger is not configured; nothing was saved." },
			503,
		);
	return env.STUDY_EVIDENCE.get(
		env.STUDY_EVIDENCE.idFromName("study-engine-v2"),
	).fetch("https://ledger.internal/records", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(values),
	});
}

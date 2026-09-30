import {
	isObject,
	decode,
	text,
	validId,
	validTimestamp,
	validDay,
	safeUrl,
	validZone,
	validManifest,
	validSource,
	validPractice,
	validAttempt,
	validAssessment,
} from "../../packages/study-evidence/protocol";
export {
	isObject,
	decode,
	text,
	validId,
	validTimestamp,
	validDay,
	safeUrl,
	validZone,
	validManifest,
	validSource,
	validPractice,
	validAttempt,
	validAssessment,
} from "../../packages/study-evidence/protocol";
import {
	PRACTICE_KINDS,
	type Assessment,
	type Attempt,
	type Gap,
	type LegacyCandidate,
	type Manifest,
	type Plan,
	type Practice,
	type PracticeKind,
	type Source,
	type TodoTask,
	type Workspace,
} from "./types";

export const KIND_LABELS: Record<PracticeKind, string> = {
	retrieve: "Retrieve",
	explain: "Explain",
	apply: "Apply",
	distinguish: "Distinguish",
	integrate: "Integrate",
	perform: "Perform",
};
export const GAP_LABELS: Record<Gap, string> = {
	rule: "Rule recall",
	issue: "Issue spotting",
	application: "Fact-to-rule links",
	distinction: "Case distinctions",
	timing: "Time pressure",
	source: "Uncertain source support",
};
export const PREFIX = "evidence.v2.";
export const MANIFEST_KEY = "lawSchoolState";
export const DEFAULT_ZONE = "America/Toronto";

export function dayKey(value = new Date(), timeZone = DEFAULT_ZONE): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(value);
	const part = (type: string) =>
		parts.find((entry) => entry.type === type)?.value ?? "";
	return `${part("year")}-${part("month")}-${part("day")}`;
}

export function shiftDay(day: string, days: number): string {
	if (!validDay(day)) throw new Error("Choose a valid calendar date.");
	const date = new Date(`${day}T12:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

export function newId(prefix: string): string {
	return `${prefix}-${crypto.randomUUID()}`;
}

export function emptyWorkspace(now = new Date().toISOString()): Workspace {
	return {
		manifest: {
			version: 2,
			createdAt: now,
			updatedAt: now,
			settings: { sessionMinutes: 20, timeZone: DEFAULT_ZONE },
		},
		practices: Object.create(null) as Record<string, Practice>,
		attempts: Object.create(null) as Record<string, Attempt>,
		assessments: Object.create(null) as Record<string, Assessment>,
		backups: {},
	};
}

export function sourceReady(practice: Practice): boolean {
	return (
		practice.permittedPractice &&
		safeUrl(practice.source.url) &&
		practice.source.title.trim().length > 0 &&
		practice.source.pinpoint.trim().length > 0 &&
		practice.checklist.trim().length > 0
	);
}

export function latestAssessment(
	workspace: Workspace,
	attemptId: string,
): Assessment | undefined {
	const assessments = Object.values(workspace.assessments).filter(
		(entry) => entry.attemptId === attemptId,
	);
	const superseded = new Set(
		assessments.map((entry) => entry.supersedes).filter(Boolean),
	);
	return assessments
		.filter((entry) => !superseded.has(entry.id))
		.sort(
			(a, b) =>
				Date.parse(b.recordedAt) - Date.parse(a.recordedAt) ||
				b.id.localeCompare(a.id),
		)[0];
}

export function independent(attempt: Attempt): boolean {
	return attempt.notesMode === "closed" && attempt.assistance === "none";
}

export function assessmentLabel(assessment: Assessment | undefined): string {
	if (!assessment) return "Not yet assessed";
	if (assessment.assessor === "ai") return "AI feedback · provisional";
	const origin =
		assessment.assessor === "instructor"
			? "Recorded instructor feedback"
			: "Self-assessment";
	return `${origin} · ${assessment.sourceChecked ? "source checked" : "unverified"}`;
}

export function eligibleEvidence(
	attempt: Attempt,
	assessment: Assessment | undefined,
): boolean {
	return Boolean(
		assessment &&
		assessment.assessor !== "ai" &&
		assessment.sourceChecked &&
		independent(attempt) &&
		safeUrl(attempt.context.source.url) &&
		attempt.context.source.pinpoint.trim() &&
		attempt.context.checklistChecked,
	);
}

export function buildPlan(
	workspace: Workspace,
	today = dayKey(new Date(), workspace.manifest.settings.timeZone),
): Plan {
	const budget = workspace.manifest.settings.sessionMinutes;
	const due = Object.values(workspace.practices).filter(
		(entry) =>
			!entry.archived && sourceReady(entry) && entry.nextReview <= today,
	);
	const priority = { high: 3, medium: 2, low: 1 };
	due.sort(
		(a, b) =>
			priority[b.priority] - priority[a.priority] ||
			a.nextReview.localeCompare(b.nextReview) ||
			Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
			a.id.localeCompare(b.id),
	);
	const steps: Plan["steps"] = [];
	let minutes = 0;
	for (const practice of due) {
		if (minutes + practice.minutes > budget) continue;
		const lastAttempt = Object.values(workspace.attempts)
			.filter((entry) => entry.practiceId === practice.id)
			.sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt))[0];
		const assessment = lastAttempt
			? latestAssessment(workspace, lastAttempt.id)
			: undefined;
		let reason =
			practice.nextReview < today
				? `Review date was ${practice.nextReview}.`
				: "Your review date is today.";
		if (!practice.checklistChecked)
			reason += " Check the answer checklist against its source.";
		if (
			assessment &&
			eligibleEvidence(lastAttempt!, assessment) &&
			assessment.verdict !== "supported"
		) {
			reason += ` Your last source-checked assessment was ${assessment.verdict === "partial" ? "partial" : "needs work"}.`;
		}
		steps.push({ practice, reason });
		minutes += practice.minutes;
	}
	return {
		date: today,
		budget,
		minutes,
		steps,
		remaining: due.length - steps.length,
	};
}

export function suggestedReview(
	assessment: Assessment,
	attempt: Attempt,
	today = dayKey(),
): string {
	const trusted = eligibleEvidence(attempt, assessment);
	const days = !trusted
		? 1
		: { "needs-work": 1, partial: 3, supported: 7 }[assessment.verdict];
	return shiftDay(today, days);
}

export interface Observation {
	course: string;
	topic: string;
	kind: PracticeKind;
	sample: number;
	days: number;
	variants: number;
	supported: number;
	selfAssessed: number;
	instructorAssessed: number;
	gaps: { gap: Gap; occurrences: number }[];
}

export function observations(workspace: Workspace): Observation[] {
	const groups = new Map<
		string,
		{ attempt: Attempt; assessment: Assessment }[]
	>();
	for (const attempt of Object.values(workspace.attempts)) {
		const assessment = latestAssessment(workspace, attempt.id);
		if (!assessment || !eligibleEvidence(attempt, assessment)) continue;
		const key = JSON.stringify([
			attempt.context.course,
			attempt.context.topic,
			attempt.context.kind,
		]);
		const group = groups.get(key) ?? [];
		group.push({ attempt, assessment });
		groups.set(key, group);
	}
	const result: Observation[] = [];
	for (const entries of groups.values()) {
		const days = new Set(
			entries.map(({ attempt }) =>
				dayKey(
					new Date(attempt.submittedAt),
					workspace.manifest.settings.timeZone,
				),
			),
		).size;
		if (entries.length < 3 || days < 2) continue;
		const first = entries[0]!;
		const gapCounts = new Map<Gap, number>();
		for (const { assessment } of entries) {
			for (const gap of new Set(assessment.gaps))
				gapCounts.set(gap, (gapCounts.get(gap) ?? 0) + 1);
		}
		result.push({
			course: first.attempt.context.course,
			topic: first.attempt.context.topic,
			kind: first.attempt.context.kind,
			sample: entries.length,
			days,
			variants: new Set(entries.map(({ attempt }) => attempt.practiceId)).size,
			supported: entries.filter(
				({ assessment }) => assessment.verdict === "supported",
			).length,
			selfAssessed: entries.filter(
				({ assessment }) => assessment.assessor === "self",
			).length,
			instructorAssessed: entries.filter(
				({ assessment }) => assessment.assessor === "instructor",
			).length,
			gaps: [...gapCounts]
				.filter(([, occurrences]) => occurrences >= 2)
				.map(([gap, occurrences]) => ({ gap, occurrences })),
		});
	}
	return result.sort((a, b) => b.sample - a.sample);
}

export function parseTodos(raw: unknown): TodoTask[] {
	const list = decode(raw ?? []);
	if (
		!Array.isArray(list) ||
		!list.every((entry) => isObject(entry) && typeof entry.id === "string")
	) {
		throw new Error(
			"Existing To-do data is not readable. Nothing was sent or replaced.",
		);
	}
	return list as TodoTask[];
}

export function planToTodos(
	plan: Plan,
	existing: TodoTask[],
	now = Date.now(),
): { tasks: TodoTask[]; added: number } {
	const tasks = [...existing];
	const known = new Set(existing.map((entry) => entry.id));
	let added = 0;
	for (const { practice } of plan.steps) {
		const id = `studyengine:${plan.date}:${practice.id}:${practice.kind}`;
		if (known.has(id)) continue;
		tasks.push({
			id,
			text: `${practice.course}: ${KIND_LABELS[practice.kind]} · ${practice.topic}`,
			pri: practice.priority === "high" ? "must" : "should",
			time:
				practice.minutes <= 15
					? "quick"
					: practice.minutes <= 30
						? "m30"
						: practice.minutes <= 60
							? "m60"
							: "deep",
			due: "today",
			dueKey: plan.date,
			setKey: plan.date,
			done: false,
			doneAt: null,
			created: now,
			updatedAt: now,
			order: now + added,
			plannedMinutes: practice.minutes,
			category: "study",
			source: "studyengine",
			studyItemId: practice.id,
			studyPhase: practice.kind,
			notes: `Practice only. Completion is not evidence of learning.\n${practice.prompt}\nSource: ${practice.source.url}\n${practice.source.pinpoint}`,
		});
		known.add(id);
		added += 1;
	}
	return { tasks, added };
}

function legacyText(value: unknown, fallback = "", limit = 30_000): string {
	return typeof value === "string" ? value.slice(0, limit) : fallback;
}

export function legacyCandidate(
	sourceKey: string,
	raw: unknown,
	now = new Date().toISOString(),
): LegacyCandidate | null {
	const value = decode(raw);
	if (!isObject(value) || !isObject(value.items)) return null;
	const practices: Practice[] = [];
	let previousRatings = 0;
	for (const [key, entry] of Object.entries(value.items)) {
		if (!isObject(entry)) continue;
		const prompt = legacyText(
			entry.prompt ?? entry.question ?? entry.front ?? entry.topic,
		);
		if (!prompt.trim()) continue;
		const oldKind = legacyText(entry.phase ?? entry.tier);
		const kind: PracticeKind = PRACTICE_KINDS.includes(oldKind as PracticeKind)
			? (oldKind as PracticeKind)
			: oldKind === "mock"
				? "perform"
				: "retrieve";
		const oldId = validId(entry.id)
			? entry.id
			: validId(key)
				? key
				: newId("legacy");
		const sourceUrl = entry.sourceUrl ?? entry.lectureUrl;
		practices.push({
			schemaVersion: 2,
			type: "practice",
			id: `legacy:${oldId}`.slice(0, 160),
			course:
				legacyText(entry.course, "Imported practice", 300) ||
				"Imported practice",
			topic:
				legacyText(entry.topic, prompt.slice(0, 100), 1000) ||
				prompt.slice(0, 100),
			kind,
			prompt,
			checklist: legacyText(
				entry.checklist ?? entry.answer ?? entry.modelAnswer,
			),
			source: {
				url: safeUrl(sourceUrl) ? sourceUrl : "",
				title: legacyText(entry.sourceTitle, "", 500),
				pinpoint: legacyText(entry.pinpoint, "", 1000),
				kind: "course-notes",
			},
			checklistOrigin: "self",
			checklistChecked: false,
			permittedPractice: false,
			minutes:
				typeof entry.minutes === "number" &&
				entry.minutes >= 1 &&
				entry.minutes <= 120
					? Math.round(entry.minutes)
					: 5,
			priority: ["high", "medium", "low"].includes(String(entry.priority))
				? (entry.priority as Practice["priority"])
				: "medium",
			nextReview: validDay(entry.nextReview)
				? entry.nextReview
				: dayKey(new Date(now)),
			archived: entry.archived === true,
			createdAt: validTimestamp(entry.createdAt) ? entry.createdAt : now,
			updatedAt: now,
		});
		if (Array.isArray(entry.reviews)) previousRatings += entry.reviews.length;
	}
	return { sourceKey, raw: value, practices, previousRatings };
}

export function practicePack(
	raw: unknown,
	now = new Date().toISOString(),
): Practice[] {
	const value = decode(raw);
	if (
		!isObject(value) ||
		value.format !== "study-engine-practice" ||
		value.version !== 1 ||
		!Array.isArray(value.items)
	) {
		throw new Error(
			"Use a Study Engine practice pack, version 1. Your current data is unchanged.",
		);
	}
	if (value.items.length < 1 || value.items.length > 100)
		throw new Error("Import between 1 and 100 practice questions at a time.");
	const items = value.items.map((entry: unknown, index: number) => {
		if (!isObject(entry))
			throw new Error(`Question ${index + 1} is not an object.`);
		const practice: unknown = {
			...entry,
			schemaVersion: 2,
			type: "practice",
			id: newId("practice"),
			checklistOrigin: entry.checklistOrigin ?? "notion-ai",
			checklistChecked: false,
			permittedPractice: false,
			minutes: entry.minutes ?? 5,
			priority: entry.priority ?? "medium",
			nextReview: dayKey(new Date(now)),
			archived: false,
			createdAt: now,
			updatedAt: now,
		};
		if (!validPractice(practice))
			throw new Error(
				`Question ${index + 1} is missing valid course, topic, kind, prompt, checklist, or source fields.`,
			);
		if (
			!safeUrl(practice.source.url) ||
			!practice.source.title.trim() ||
			!practice.source.pinpoint.trim() ||
			!practice.checklist.trim()
		) {
			throw new Error(
				`Question ${index + 1} needs a source link, source title, pinpoint, and answer checklist.`,
			);
		}
		return practice;
	});
	return items;
}

export const AUTHORING_PROMPT = `Create a small source-grounded practice pack for the selected Notion lecture.
Read the actual assigned sources before drafting legal questions or answer checklists. My notes alone may contain errors. If the assigned source is unavailable, stop and identify that gap rather than inventing the law.
Exclude assessed work where AI assistance is prohibited. Do not reproduce a restricted assignment or provide its answer.
Keep my full notes in Notion. Return only focused practice questions, their source-linked checklists, and exact page or paragraph pinpoints. Distinguish judicial holdings, party arguments, paraphrases, and my observations. Do not import related or later cases without identifying them.
Use the practice categories retrieve, explain, apply, distinguish, integrate, or perform as appropriate, not as a compulsory sequence. Prefer a few useful questions to exhaustive card production.
For every substantive checklist point include its exact source pinpoint. Do not claim a generated checklist is verified or a rubric is official. Use checklistOrigin "notion-ai". I will check the source myself.
Output only JSON matching:
{
  "format": "study-engine-practice",
  "version": 1,
  "items": [{
    "course": "Exact course name",
    "topic": "One focused topic",
    "kind": "retrieve",
    "prompt": "A permitted, source-grounded practice question",
    "checklist": "Expected point with exact source pinpoint",
    "source": {
      "url": "https://app.notion.com/p/EXISTING_SOURCE_PAGE",
      "title": "Assigned source title",
      "pinpoint": "Exact page or paragraph",
      "kind": "assigned-source"
    },
    "checklistOrigin": "notion-ai",
    "minutes": 5,
    "priority": "medium"
  }]
}`;

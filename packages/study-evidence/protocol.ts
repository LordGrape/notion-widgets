// Shared only because both the private frontend and protected Worker validate this protocol.
export const PRACTICE_KINDS = [
	"retrieve",
	"explain",
	"apply",
	"distinguish",
	"integrate",
	"perform",
] as const;

export type PracticeKind = (typeof PRACTICE_KINDS)[number];
export type Verdict = "supported" | "partial" | "needs-work";
export type Assessor = "self" | "ai" | "instructor";
export type Assistance = "none" | "hint" | "ai" | "human";
export type Gap =
	"rule" | "issue" | "application" | "distinction" | "timing" | "source";

export interface Source {
	url: string;
	title: string;
	pinpoint: string;
	kind: "assigned-source" | "course-notes" | "rubric" | "other";
}

export interface Practice {
	schemaVersion: 2;
	type: "practice";
	id: string;
	course: string;
	topic: string;
	kind: PracticeKind;
	prompt: string;
	checklist: string;
	source: Source;
	checklistOrigin: "self" | "notion-ai" | "instructor";
	checklistChecked: boolean;
	permittedPractice: boolean;
	minutes: number;
	priority: "high" | "medium" | "low";
	nextReview: string;
	archived: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface Attempt {
	schemaVersion: 2;
	type: "attempt";
	id: string;
	practiceId: string;
	context: Pick<
		Practice,
		| "course"
		| "topic"
		| "kind"
		| "prompt"
		| "checklist"
		| "source"
		| "checklistOrigin"
		| "checklistChecked"
	>;
	answer: string;
	didNotKnow: boolean;
	notesMode: "closed" | "open";
	assistance: Assistance;
	startedAt: string;
	submittedAt: string;
	elapsedSeconds: number;
}

export interface Assessment {
	schemaVersion: 2;
	type: "assessment";
	id: string;
	attemptId: string;
	assessor: Assessor;
	verdict: Verdict;
	sourceChecked: boolean;
	notes: string;
	gaps: Gap[];
	feedbackUrl: string;
	recordedAt: string;
	supersedes: string | null;
}

export interface Manifest {
	version: 2;
	createdAt: string;
	updatedAt: string;
	settings: { sessionMinutes: number; timeZone: string };
}

export interface LegacyBackup {
	schemaVersion: 2;
	type: "legacy-backup";
	id: string;
	sourceKey: string;
	capturedAt: string;
	raw: unknown;
}

export interface Workspace {
	manifest: Manifest;
	practices: Record<string, Practice>;
	attempts: Record<string, Attempt>;
	assessments: Record<string, Assessment>;
	backups: Record<string, LegacyBackup>;
}

export interface LegacyCandidate {
	sourceKey: string;
	raw: unknown;
	practices: Practice[];
	previousRatings: number;
}

export interface LoadResult {
	workspace: Workspace;
	blocked: string | null;
	legacy: LegacyCandidate[];
	needsManifest: boolean;
}

export type RecordValue = Practice | Attempt | Assessment | LegacyBackup;

export interface SyncApi {
	init(options: { worker: string; namespaces: string[] }): Promise<void>;
	get(namespace: string, key: string): unknown;
	getAll(namespace: string): Record<string, unknown>;
	set(namespace: string, key: string, value: unknown): void;
	setMany(namespace: string, values: Record<string, unknown>): void;
	flush(): Promise<unknown>;
	pull(namespace: string): Promise<unknown>;
	subscribe(
		namespace: string,
		key: string | null,
		callback: (
			value: unknown,
			detail?: { key?: string; source?: string },
		) => void,
	): () => void;
	onSyncStatus(callback: (status: string) => void): void;
}

export interface PlanStep {
	practice: Practice;
	reason: string;
}

export interface Plan {
	date: string;
	budget: number;
	minutes: number;
	steps: PlanStep[];
	remaining: number;
}

export interface TodoTask {
	id: string;
	text?: string;
	done?: boolean;
	[key: string]: unknown;
}
const GAP_IDS = [
	"rule",
	"issue",
	"application",
	"distinction",
	"timing",
	"source",
];

export function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function decode(value: unknown): unknown {
	if (typeof value !== "string") return value;
	try {
		return JSON.parse(value) as unknown;
	} catch {
		throw new Error(
			"A saved record is not readable JSON. It has not been replaced.",
		);
	}
}

export function text(value: unknown, limit = 30_000): value is string {
	return typeof value === "string" && value.length <= limit;
}

export function validId(value: unknown): value is string {
	return (
		typeof value === "string" &&
		/^[a-zA-Z0-9:._-]{1,160}$/.test(value) &&
		!["__proto__", "constructor", "prototype"].includes(value)
	);
}

export function validTimestamp(value: unknown): value is string {
	return (
		typeof value === "string" &&
		/^\d{4}-\d\d-\d\dT/.test(value) &&
		Number.isFinite(Date.parse(value))
	);
}

export function validDay(value: unknown): value is string {
	if (typeof value !== "string" || !/^\d{4}-\d\d-\d\d$/.test(value))
		return false;
	const parsed = new Date(`${value}T12:00:00Z`);
	return (
		Number.isFinite(parsed.valueOf()) &&
		parsed.toISOString().slice(0, 10) === value
	);
}

export function safeUrl(value: unknown, allowEmpty = false): value is string {
	if (value === "" && allowEmpty) return true;
	if (!text(value, 2048)) return false;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && !url.username && !url.password;
	} catch {
		return false;
	}
}

export function validZone(value: unknown): value is string {
	if (typeof value !== "string") return false;
	try {
		new Intl.DateTimeFormat("en-CA", { timeZone: value }).format();
		return true;
	} catch {
		return false;
	}
}

export function validManifest(value: unknown): value is Manifest {
	return (
		isObject(value) &&
		value.version === 2 &&
		validTimestamp(value.createdAt) &&
		validTimestamp(value.updatedAt) &&
		isObject(value.settings) &&
		typeof value.settings.sessionMinutes === "number" &&
		Number.isInteger(value.settings.sessionMinutes) &&
		value.settings.sessionMinutes >= 5 &&
		value.settings.sessionMinutes <= 120 &&
		validZone(value.settings.timeZone)
	);
}

export function validSource(value: unknown): value is Source {
	return (
		isObject(value) &&
		safeUrl(value.url, true) &&
		text(value.title, 500) &&
		text(value.pinpoint, 1000) &&
		["assigned-source", "course-notes", "rubric", "other"].includes(
			String(value.kind),
		)
	);
}

export function validPractice(value: unknown): value is Practice {
	return (
		isObject(value) &&
		value.schemaVersion === 2 &&
		value.type === "practice" &&
		validId(value.id) &&
		text(value.course, 300) &&
		value.course.trim().length > 0 &&
		text(value.topic, 1000) &&
		value.topic.trim().length > 0 &&
		PRACTICE_KINDS.includes(value.kind as PracticeKind) &&
		text(value.prompt) &&
		value.prompt.trim().length > 0 &&
		text(value.checklist) &&
		validSource(value.source) &&
		["self", "notion-ai", "instructor"].includes(
			String(value.checklistOrigin),
		) &&
		typeof value.checklistChecked === "boolean" &&
		typeof value.permittedPractice === "boolean" &&
		typeof value.archived === "boolean" &&
		typeof value.minutes === "number" &&
		Number.isInteger(value.minutes) &&
		value.minutes >= 1 &&
		value.minutes <= 120 &&
		["high", "medium", "low"].includes(String(value.priority)) &&
		validDay(value.nextReview) &&
		validTimestamp(value.createdAt) &&
		validTimestamp(value.updatedAt)
	);
}

export function validAttempt(value: unknown): value is Attempt {
	if (!isObject(value) || !isObject(value.context)) return false;
	const context = value.context;
	return (
		value.schemaVersion === 2 &&
		value.type === "attempt" &&
		validId(value.id) &&
		validId(value.practiceId) &&
		text(context.course, 300) &&
		text(context.topic, 1000) &&
		PRACTICE_KINDS.includes(context.kind as PracticeKind) &&
		text(context.prompt) &&
		text(context.checklist) &&
		validSource(context.source) &&
		["self", "notion-ai", "instructor"].includes(
			String(context.checklistOrigin),
		) &&
		typeof context.checklistChecked === "boolean" &&
		text(value.answer, 100_000) &&
		typeof value.didNotKnow === "boolean" &&
		["closed", "open"].includes(String(value.notesMode)) &&
		["none", "hint", "ai", "human"].includes(String(value.assistance)) &&
		validTimestamp(value.startedAt) &&
		validTimestamp(value.submittedAt) &&
		Date.parse(value.submittedAt) >= Date.parse(value.startedAt) &&
		typeof value.elapsedSeconds === "number" &&
		Number.isFinite(value.elapsedSeconds) &&
		value.elapsedSeconds >= 0
	);
}

export function validAssessment(value: unknown): value is Assessment {
	return (
		isObject(value) &&
		value.schemaVersion === 2 &&
		value.type === "assessment" &&
		validId(value.id) &&
		validId(value.attemptId) &&
		["self", "ai", "instructor"].includes(String(value.assessor)) &&
		["supported", "partial", "needs-work"].includes(String(value.verdict)) &&
		typeof value.sourceChecked === "boolean" &&
		text(value.notes) &&
		Array.isArray(value.gaps) &&
		value.gaps.every(
			(gap) => typeof gap === "string" && GAP_IDS.includes(gap),
		) &&
		safeUrl(value.feedbackUrl, true) &&
		(value.assessor === "self" ||
			(typeof value.notes === "string" && value.notes.trim().length > 0)) &&
		(value.assessor !== "instructor" || safeUrl(value.feedbackUrl)) &&
		validTimestamp(value.recordedAt) &&
		(value.supersedes === null || validId(value.supersedes))
	);
}

export function validLegacyBackup(value: unknown): value is LegacyBackup {
	return (
		isObject(value) &&
		value.schemaVersion === 2 &&
		value.type === "legacy-backup" &&
		validId(value.id) &&
		text(value.sourceKey, 500) &&
		validTimestamp(value.capturedAt) &&
		Object.hasOwn(value, "raw")
	);
}
export function validRecord(value: unknown): value is RecordValue {
	return (
		validPractice(value) ||
		validAttempt(value) ||
		validAssessment(value) ||
		validLegacyBackup(value)
	);
}

import { validRecord } from "../../packages/study-evidence/protocol";
import {
	decode,
	emptyWorkspace,
	isObject,
	legacyCandidate,
	MANIFEST_KEY,
	newId,
	PREFIX,
	validAssessment,
	validAttempt,
	validId,
	validManifest,
	validPractice,
	validTimestamp,
} from "./domain";
import type {
	Assessment,
	Attempt,
	LegacyBackup,
	LoadResult,
	Manifest,
	Practice,
	RecordValue,
	SyncApi,
	Workspace,
} from "./types";

export const NAMESPACE = "studyengine";
export const WORKER = "https://widget-sync.lordgrape-widgets.workers.dev";
export const ACCESS_KEY = "_sync_passphrase";
export const OLD_LOCAL_KEY = "studyengine.lawSchoolState.v1";

declare const SyncEngine: SyncApi | undefined;

export function sharedEngine(): SyncApi {
	if (typeof SyncEngine === "undefined")
		throw new Error(
			"The shared widget runtime did not load. Refresh the page to try again.",
		);
	return SyncEngine;
}

export function recordKey(record: RecordValue): string {
	return `${PREFIX}${record.type}.${record.id}`;
}

function allRecords(workspace: Workspace): RecordValue[] {
	return [
		...Object.values(workspace.practices),
		...Object.values(workspace.attempts),
		...Object.values(workspace.assessments),
		...Object.values(workspace.backups),
	];
}

export function loadNamespace(
	namespace: Record<string, unknown>,
	oldLocal: unknown = null,
	now = new Date().toISOString(),
): LoadResult {
	const workspace = emptyWorkspace(now);
	const result: LoadResult = {
		workspace,
		blocked: null,
		legacy: [],
		needsManifest: true,
	};
	try {
		const anchor = decode(namespace[MANIFEST_KEY] ?? null);
		if (anchor !== null) {
			if (validManifest(anchor)) {
				workspace.manifest = anchor;
				result.needsManifest = false;
			} else if (
				isObject(anchor) &&
				(anchor.version === 1 || anchor.version === undefined) &&
				isObject(anchor.items)
			) {
				const candidate = legacyCandidate(MANIFEST_KEY, anchor, now);
				if (candidate) result.legacy.push(candidate);
			} else {
				throw new Error(
					"The saved workspace uses an unknown or damaged schema. Export a recovery copy; it will not be overwritten.",
				);
			}
		}
		for (const [key, raw] of Object.entries(namespace)) {
			if (key.startsWith("evidence.") && !key.startsWith(PREFIX)) {
				throw new Error(
					"A newer evidence schema was found. This version is read-only to protect it.",
				);
			}
			if (!key.startsWith(PREFIX)) continue;
			const record = decode(raw);
			if (!validRecord(record) || recordKey(record) !== key) {
				throw new Error(
					"An evidence record is damaged or unsupported. Export a recovery copy before making changes.",
				);
			}
			if (record.type === "practice") workspace.practices[record.id] = record;
			if (record.type === "attempt") workspace.attempts[record.id] = record;
			if (record.type === "assessment")
				workspace.assessments[record.id] = record;
			if (record.type === "legacy-backup")
				workspace.backups[record.id] = record;
		}
		for (const assessment of Object.values(workspace.assessments)) {
			const original = workspace.attempts[assessment.attemptId];
			if (
				!original ||
				Date.parse(original.submittedAt) > Date.parse(assessment.recordedAt)
			)
				throw new Error(
					"An assessment is missing its original attempt or predates it. Nothing will be overwritten.",
				);
			if (assessment.supersedes) {
				const previous = workspace.assessments[assessment.supersedes];
				if (
					!previous ||
					previous.attemptId !== assessment.attemptId ||
					Date.parse(previous.recordedAt) > Date.parse(assessment.recordedAt)
				) {
					throw new Error(
						"An assessment correction has an invalid history. Nothing will be overwritten.",
					);
				}
			}
			const seen = new Set([assessment.id]);
			let cursor: Assessment | undefined = assessment;
			while (cursor?.supersedes) {
				if (seen.has(cursor.supersedes))
					throw new Error(
						"An assessment correction has a circular history. Nothing will be overwritten.",
					);
				seen.add(cursor.supersedes);
				cursor = workspace.assessments[cursor.supersedes];
			}
		}
		for (const sourceKey of ["state", "appState", OLD_LOCAL_KEY]) {
			const raw = sourceKey === OLD_LOCAL_KEY ? oldLocal : namespace[sourceKey];
			if (raw === null || raw === undefined) continue;
			if (
				Object.values(workspace.backups).some(
					(backup) => backup.sourceKey === sourceKey,
				)
			)
				continue;
			const candidate = legacyCandidate(sourceKey, raw, now);
			if (candidate && candidate.practices.length)
				result.legacy.push(candidate);
		}
	} catch (error) {
		result.blocked =
			error instanceof Error
				? error.message
				: "Saved data could not be read safely.";
	}
	return result;
}

function stable(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stable);
	if (isObject(value))
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((key) => [key, stable(value[key])]),
		);
	return value;
}

export function equalRecord(left: unknown, right: unknown): boolean {
	return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

export class EvidenceRepository {
	constructor(
		private readonly engine: SyncApi,
		private readonly oldLocal: () => unknown = () => null,
	) {}

	load(): LoadResult {
		return loadNamespace(this.engine.getAll(NAMESPACE), this.oldLocal());
	}

	commit(
		records: RecordValue[],
		manifest?: Manifest,
		allowMigration = false,
	): void {
		const loaded = this.load();
		if (loaded.blocked) throw new Error(loaded.blocked);
		if (
			!allowMigration &&
			loaded.legacy.some((entry) => entry.sourceKey === MANIFEST_KEY)
		) {
			throw new Error(
				"Review the previous workspace migration before saving new records.",
			);
		}
		const values: Record<string, unknown> = {};
		for (const record of records) {
			if (!validRecord(record))
				throw new Error(
					"A record did not pass validation. Your current data is unchanged.",
				);
			const key = recordKey(record);
			const existing = this.engine.get(NAMESPACE, key);
			if (
				existing !== null &&
				existing !== undefined &&
				record.type !== "practice" &&
				!equalRecord(decode(existing), record)
			) {
				throw new Error(
					"Original attempts and assessments cannot be edited. Add a correction instead.",
				);
			}
			if (Object.hasOwn(values, key) && !equalRecord(values[key], record)) {
				throw new Error(
					"The update contains conflicting records. Nothing has been saved.",
				);
			}
			values[key] = record;
		}
		const nextManifest = manifest ?? loaded.workspace.manifest;
		if (!validManifest(nextManifest))
			throw new Error("Workspace settings are invalid.");
		if (manifest || loaded.needsManifest) values[MANIFEST_KEY] = nextManifest;
		const preview = { ...this.engine.getAll(NAMESPACE), ...values };
		const checked = loadNamespace(preview);
		if (checked.blocked) throw new Error(checked.blocked);
		if (Object.keys(values).length) this.engine.setMany(NAMESPACE, values);
	}

	migrate(): { imported: number; excludedRatings: number } {
		const loaded = this.load();
		if (loaded.blocked) throw new Error(loaded.blocked);
		const records: RecordValue[] = [];
		const known = new Set(Object.keys(loaded.workspace.practices));
		let imported = 0;
		let excludedRatings = 0;
		for (const candidate of loaded.legacy) {
			records.push({
				schemaVersion: 2,
				type: "legacy-backup",
				id: newId("backup"),
				sourceKey: candidate.sourceKey,
				capturedAt: new Date().toISOString(),
				raw: candidate.raw,
			});
			for (const practice of candidate.practices) {
				if (known.has(practice.id)) continue;
				records.push(practice);
				known.add(practice.id);
				imported += 1;
			}
			excludedRatings += candidate.previousRatings;
		}
		this.commit(records, loaded.workspace.manifest, true);
		return { imported, excludedRatings };
	}

	backup(): string {
		const loaded = this.load();
		if (
			loaded.blocked ||
			loaded.legacy.some((entry) => entry.sourceKey === MANIFEST_KEY)
		) {
			return JSON.stringify(
				{
					format: "study-engine-recovery",
					version: 1,
					exportedAt: new Date().toISOString(),
					namespace: this.engine.getAll(NAMESPACE),
					oldLocal: this.oldLocal(),
				},
				null,
				2,
			);
		}
		return JSON.stringify(
			{
				format: "study-engine-backup",
				version: 2,
				exportedAt: new Date().toISOString(),
				manifest: loaded.workspace.manifest,
				records: allRecords(loaded.workspace),
			},
			null,
			2,
		);
	}

	restorePreview(raw: unknown): {
		records: RecordValue[];
		manifest: Manifest;
		additions: number;
		conflicts: number;
	} {
		const value = decode(raw);
		if (
			!isObject(value) ||
			value.format !== "study-engine-backup" ||
			value.version !== 2 ||
			!validManifest(value.manifest) ||
			!Array.isArray(value.records) ||
			!value.records.every(validRecord)
		)
			throw new Error(
				"This is not a valid version 2 backup. Recovery copies are for manual repair, not automatic replacement.",
			);
		const records = value.records as RecordValue[];
		const checked = loadNamespace(
			Object.fromEntries([
				[MANIFEST_KEY, value.manifest],
				...records.map((record) => [recordKey(record), record]),
			]),
		);
		if (checked.blocked) throw new Error(checked.blocked);
		const seen = new Set<string>();
		let additions = 0;
		let conflicts = 0;
		for (const record of records) {
			const key = recordKey(record);
			if (seen.has(key))
				throw new Error("This backup contains duplicate record IDs.");
			seen.add(key);
			const previous = this.engine.get(NAMESPACE, key);
			if (previous === null || previous === undefined) additions += 1;
			else if (!equalRecord(decode(previous), record)) conflicts += 1;
		}
		return { records, manifest: value.manifest, additions, conflicts };
	}

	restore(raw: unknown): number {
		const preview = this.restorePreview(raw);
		if (preview.conflicts)
			throw new Error(
				"The backup conflicts with current records. Nothing was changed; keep both copies for review.",
			);
		// A restore adds missing records only. Current settings and practice edits win.
		const additions = preview.records.filter(
			(record) => this.engine.get(NAMESPACE, recordKey(record)) == null,
		);
		this.commit(additions);
		return additions.length;
	}
}

export function unwrapRemote(raw: unknown): Record<string, unknown> {
	if (!isObject(raw) || (raw.value !== null && !isObject(raw.value)))
		throw new Error("The sync service returned an unsupported state response.");
	return Object.fromEntries(
		Object.entries(raw.value ?? {}).map(([key, entry]) => [
			key,
			isObject(entry) &&
			Object.hasOwn(entry, "_ts") &&
			Object.hasOwn(entry, "value")
				? entry.value
				: entry,
		]),
	);
}

export async function remoteNamespace(
	namespace: string,
	key: string,
): Promise<Record<string, unknown>> {
	const response = await fetch(
		`${WORKER}/state/${encodeURIComponent(namespace)}`,
		{
			headers: { "X-Widget-Key": key },
			cache: "no-store",
		},
	);
	if (!response.ok)
		throw new Error(
			response.status === 401
				? "That access key was not accepted."
				: "The private sync service is unavailable. Nothing was reset.",
		);
	const raw: unknown = await response.json();
	if (namespace === NAMESPACE && (!isObject(raw) || raw.evidenceLedger !== 2)) {
		throw new Error(
			"The protected evidence backend is not deployed yet. Your previous data is untouched. Try again after deployment.",
		);
	}
	return unwrapRemote(raw);
}

export function pendingValues(
	engine: SyncApi,
	namespace: string,
	keys: string[],
): Record<string, unknown> {
	return Object.fromEntries(
		keys.map((key) => [key, engine.get(namespace, key)]),
	);
}

export function remoteContains(
	remote: Record<string, unknown>,
	expected: Record<string, unknown>,
): boolean {
	return Object.entries(expected).every(
		([key, value]) =>
			Object.hasOwn(remote, key) && equalRecord(decode(remote[key]), value),
	);
}

export function snapshotContext(practice: Practice): Attempt["context"] {
	const {
		course,
		topic,
		kind,
		prompt,
		checklist,
		source,
		checklistOrigin,
		checklistChecked,
	} = practice;
	return structuredClone({
		course,
		topic,
		kind,
		prompt,
		checklist,
		source,
		checklistOrigin,
		checklistChecked,
	});
}

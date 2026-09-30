// Public, synthetic software-test data only. Never seed a live learner workspace.
import type { Assessment, Attempt, Practice, SyncApi } from "./types";
import { emptyWorkspace } from "./domain";
import { snapshotContext } from "./repository";

export const NOW = "2026-09-29T16:00:00.000Z";
export function practice(overrides: Partial<Practice> = {}): Practice {
	return {
		schemaVersion: 2,
		type: "practice",
		id: "practice-apollo",
		course: "Public history",
		topic: "Apollo 11",
		kind: "retrieve",
		prompt: "In what year did Apollo 11 land on the Moon?",
		checklist: "1969. Source: mission overview, landing timeline.",
		source: {
			url: "https://www.nasa.gov/mission/apollo-11/",
			title: "Apollo 11 mission overview",
			pinpoint: "Landing timeline",
			kind: "assigned-source",
		},
		checklistOrigin: "self",
		checklistChecked: true,
		permittedPractice: true,
		minutes: 5,
		priority: "medium",
		nextReview: "2026-09-29",
		archived: false,
		createdAt: NOW,
		updatedAt: NOW,
		...overrides,
	};
}
export function attempt(
	id = "attempt-a",
	overrides: Partial<Attempt> = {},
): Attempt {
	return {
		schemaVersion: 2,
		type: "attempt",
		id,
		practiceId: "practice-apollo",
		context: snapshotContext(practice()),
		answer: "1969",
		didNotKnow: false,
		notesMode: "closed",
		assistance: "none",
		startedAt: NOW,
		submittedAt: NOW,
		elapsedSeconds: 0,
		...overrides,
	};
}
export function assessment(
	id = "assessment-a",
	overrides: Partial<Assessment> = {},
): Assessment {
	return {
		schemaVersion: 2,
		type: "assessment",
		id,
		attemptId: "attempt-a",
		assessor: "self",
		verdict: "supported",
		sourceChecked: true,
		notes: "Compared with the mission timeline.",
		gaps: [],
		feedbackUrl: "",
		recordedAt: NOW,
		supersedes: null,
		...overrides,
	};
}
export function fixtureWorkspace() {
	const state = emptyWorkspace(NOW);
	state.practices["practice-apollo"] = practice();
	return state;
}
export class MemorySync implements SyncApi {
	readonly writes: { namespace: string; values: Record<string, unknown> }[] =
		[];
	private readonly listeners: {
		namespace: string;
		key: string | null;
		callback: (value: unknown) => void;
	}[] = [];
	constructor(
		readonly namespaces: Record<string, Record<string, unknown>> = {},
	) {}
	async init(): Promise<void> {}
	get(ns: string, key: string): unknown {
		return this.namespaces[ns]?.[key] ?? null;
	}
	getAll(ns: string): Record<string, unknown> {
		return { ...this.namespaces[ns] };
	}
	set(ns: string, key: string, value: unknown): void {
		this.setMany(ns, { [key]: value });
	}
	setMany(ns: string, values: Record<string, unknown>): void {
		this.namespaces[ns] = {
			...this.namespaces[ns],
			...structuredClone(values),
		};
		this.writes.push({ namespace: ns, values });
		for (const [key, value] of Object.entries(values)) {
			for (const listener of this.listeners)
				if (
					listener.namespace === ns &&
					(listener.key === null || listener.key === key)
				)
					listener.callback(value);
		}
	}
	async flush(): Promise<void> {}
	async pull(): Promise<void> {}
	subscribe(
		namespace: string,
		key: string | null,
		callback: (value: unknown) => void,
	): () => void {
		const listener = { namespace, key, callback };
		this.listeners.push(listener);
		return () => {
			const i = this.listeners.indexOf(listener);
			if (i >= 0) this.listeners.splice(i, 1);
		};
	}
	onSyncStatus(): void {}
}

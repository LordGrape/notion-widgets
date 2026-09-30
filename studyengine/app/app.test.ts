// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { emptyWorkspace, MANIFEST_KEY } from "./domain";
import { ACCESS_KEY, recordKey } from "./repository";
import { MemorySync, NOW, practice } from "./test-fixtures";
import type { Assessment, Attempt, Practice } from "./types";

let dispose: (() => void) | undefined;
afterEach(() => {
	dispose?.();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	localStorage.clear();
});

it("runs an authenticated, source-linked practice loop without fabricated mastery or automatic tasks", async () => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date(NOW));
	const html = readFileSync("app/index.html", "utf8");
	document.body.innerHTML = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? "";
	Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
		configurable: true,
		value: vi.fn(),
	});
	Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
		configurable: true,
		value: function (this: HTMLDialogElement) {
			this.open = true;
		},
	});
	Object.defineProperty(HTMLDialogElement.prototype, "close", {
		configurable: true,
		value: function (this: HTMLDialogElement) {
			this.open = false;
		},
	});
	const fixture = practice();
	const sync = new MemorySync({
		studyengine: {
			[MANIFEST_KEY]: emptyWorkspace(NOW).manifest,
			[recordKey(fixture)]: fixture,
		},
		todo: {
			tasks: JSON.stringify([
				{
					id: "public-geometry-task",
					text: "Check a geometry proof",
					done: false,
				},
			]),
		},
	});
	vi.stubGlobal("SyncEngine", sync);
	const requests: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, options: RequestInit) => {
			requests.push(url);
			if (
				(options.headers as Record<string, string>)["X-Widget-Key"] !==
				"synthetic-test-key"
			)
				return new Response("{}", { status: 401 });
			const ns = url.split("/").at(-1)!;
			return new Response(
				JSON.stringify({
					value: sync.getAll(ns),
					...(ns === "studyengine" ? { evidenceLedger: 2 } : {}),
				}),
			);
		}),
	);
	const app = await import("./app");
	dispose = app.dispose;
	const byId = <T extends HTMLElement = HTMLElement>(id: string) =>
		document.getElementById(id) as T;
	const click = (id: string) => byId<HTMLButtonElement>(id).click();
	const set = (id: string, value: string) => {
		byId<HTMLInputElement>(id).value = value;
	};
	const change = (id: string) =>
		byId(id).dispatchEvent(new Event("change", { bubbles: true }));
	const submit = (id: string) =>
		byId(id).dispatchEvent(
			new Event("submit", { bubbles: true, cancelable: true }),
		);
	expect(byId("appShell").hidden).toBe(true);
	expect(byId<HTMLInputElement>("rememberKey").checked).toBe(true);
	set("accessKey", "wrong-synthetic-key");
	submit("unlockForm");
	await vi.waitFor(() =>
		expect(byId("unlockStatus").textContent).toContain("not accepted"),
	);
	expect(sync.writes).toHaveLength(0);
	set("accessKey", "synthetic-test-key");
	submit("unlockForm");
	await vi.waitFor(() => expect(byId("appShell").hidden).toBe(false));
	expect(sync.writes).toHaveLength(0);

	document
		.querySelector<HTMLButtonElement>('[data-action="send-plan"]')!
		.click();
	await vi.waitFor(() =>
		expect(sync.writes.filter((w) => w.namespace === "todo")).toHaveLength(1),
	);
	const tasks = JSON.parse(sync.get("todo", "tasks") as string) as Record<
		string,
		unknown
	>[];
	const generated = tasks.find((t) => t.source === "studyengine")!;
	expect(generated).toMatchObject({
		pri: "should",
		time: "quick",
		done: false,
		plannedMinutes: 5,
	});
	generated.text = "Edited synthetic practice";
	generated.done = true;
	generated.subs = [{ text: "Synthetic substep", done: true }];
	sync.namespaces.todo!.tasks = JSON.stringify(tasks);
	document
		.querySelector<HTMLButtonElement>('[data-action="send-plan"]')!
		.click();
	await vi.waitFor(() =>
		expect(byId("toast").textContent).toContain("already in To-do"),
	);
	expect(sync.writes.filter((w) => w.namespace === "todo")).toHaveLength(1);

	document
		.querySelector<HTMLButtonElement>('[data-action="start-plan"]')!
		.click();
	expect(byId("comparison").hidden).toBe(true);
	click("submitAttempt");
	expect(sync.getAll("studyengine")).not.toHaveProperty("mastery");
	expect(
		Object.keys(sync.getAll("studyengine")).filter((k) =>
			k.includes(".attempt."),
		),
	).toHaveLength(0);
	set("practiceAnswer", "1969");
	click("submitAttempt");
	expect(byId("comparison").hidden).toBe(false);
	expect(byId<HTMLTextAreaElement>("practiceAnswer").disabled).toBe(true);
	const attemptKey = Object.keys(sync.getAll("studyengine")).find((k) =>
		k.includes(".attempt."),
	)!;
	const original = sync.get("studyengine", attemptKey) as Attempt;
	expect(original.answer).toBe("1969");
	expect(original.context.source.pinpoint).toBe("Landing timeline");
	set("assessor", "ai");
	change("assessor");
	set("verdict", "supported");
	byId<HTMLInputElement>("sourceChecked").checked = true;
	change("sourceChecked");
	set("assessmentNotes", "Synthetic AI comparison, not a legal judgment.");
	expect(byId<HTMLInputElement>("nextReview").value).toBe("2026-09-30");
	submit("assessmentForm");
	const aiKey = Object.keys(sync.getAll("studyengine")).find((k) =>
		k.includes(".assessment."),
	)!;
	expect((sync.get("studyengine", aiKey) as Assessment).assessor).toBe("ai");
	expect(byId("savedSummary").textContent).toContain("provisional");
	click("finishPractice");
	click("tab-evidence");
	expect(byId("observationList").textContent).toContain(
		"Not enough independent evidence",
	);
	document.querySelector<HTMLButtonElement>('[data-action="assess"]')!.click();
	set("assessor", "self");
	change("assessor");
	set("assessmentNotes", "Compared directly with the public mission timeline.");
	submit("assessmentForm");
	const assessments = Object.entries(sync.getAll("studyengine"))
		.filter(([k]) => k.includes(".assessment."))
		.map(([, v]) => v as Assessment);
	expect(assessments).toHaveLength(2);
	expect(
		assessments.some(
			(a) => a.supersedes === (sync.get("studyengine", aiKey) as Assessment).id,
		),
	).toBe(true);
	expect(sync.get("studyengine", attemptKey)).toEqual(original);
	click("finishPractice");
	click("tab-library");
	document.querySelector<HTMLButtonElement>('[data-action="edit"]')!.click();
	set("pinpointInput", "Revised public source section");
	set("topicInput", "<img src=x onerror=alert(1)> Public test topic");
	submit("practiceForm");
	expect(document.querySelector("#libraryList img")).toBeNull();
	expect(
		(sync.get("studyengine", recordKey(fixture)) as Practice).source.pinpoint,
	).toBe("Revised public source section");
	expect(
		(sync.get("studyengine", attemptKey) as Attempt).context.source.pinpoint,
	).toBe("Landing timeline");
	expect(requests.every((url) => url.includes("/state/"))).toBe(true);
	sync.set("studyengine", MANIFEST_KEY, { version: 99 });
	expect(byId("dataGuard").hidden).toBe(false);
	expect(byId<HTMLButtonElement>("addButton").disabled).toBe(true);
	expect(byId("guardText").textContent).toContain("unknown");
	expect(byId("todayFacts").textContent).toContain("Not loaded");
	expect(byId("planContainer").textContent).toContain("read-only");
	expect(byId("historyCount").textContent).toBe("Not loaded");
	expect(byId("observationList").textContent).toContain("unavailable");
	expect(byId("libraryList").textContent).toContain("unavailable");
});

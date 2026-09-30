import { checklistHtml } from "./presentation";
import {
	assessmentLabel,
	AUTHORING_PROMPT,
	buildPlan,
	dayKey,
	eligibleEvidence,
	GAP_LABELS,
	independent,
	KIND_LABELS,
	latestAssessment,
	MANIFEST_KEY,
	newId,
	observations,
	parseTodos,
	planToTodos,
	practicePack,
	safeUrl,
	sourceReady,
	suggestedReview,
	validDay,
	validPractice,
} from "./domain";
import {
	ACCESS_KEY,
	equalRecord,
	EvidenceRepository,
	NAMESPACE,
	OLD_LOCAL_KEY,
	pendingValues,
	recordKey,
	remoteContains,
	remoteNamespace,
	sharedEngine,
	snapshotContext,
	WORKER,
} from "./repository";
import type {
	Assessment,
	Assessor,
	Assistance,
	Attempt,
	Gap,
	LoadResult,
	Manifest,
	Practice,
	PracticeKind,
	RecordValue,
	Source,
	SyncApi,
	Verdict,
} from "./types";

function el<T extends HTMLElement = HTMLElement>(id: string): T {
	const found = document.getElementById(id);
	if (!found) throw new Error(`Required interface control is missing: ${id}`);
	return found as T;
}
const input = (id: string) => el<HTMLInputElement>(id);
const select = (id: string) => el<HTMLSelectElement>(id);
const area = (id: string) => el<HTMLTextAreaElement>(id);
const button = (id: string) => el<HTMLButtonElement>(id);
const dialog = (id: string) => el<HTMLDialogElement>(id);
const escape = (value: unknown): string =>
	String(value ?? "").replace(
		/[&<>"']/g,
		(c) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;",
			})[c] ?? c,
	);
const verdictLabel = (v: Verdict): string =>
	({
		supported: "Supported",
		partial: "Partially supported",
		"needs-work": "Needs work",
	})[v];
const message = (error: unknown): string =>
	error instanceof Error
		? error.message
		: "This action could not be completed safely.";
let engine: SyncApi | null = null,
	repository: EvidenceRepository | null = null,
	loaded: LoadResult | null = null;
let accessKey = "",
	activeTab = "today",
	queue: string[] = [],
	queueIndex = 0,
	startedAt = "";
let currentPractice: Practice | null = null,
	currentAttempt: Attempt | null = null,
	correctionBase: string | null = null;
let refreshTimer: ReturnType<typeof setInterval> | undefined,
	toastTimer: ReturnType<typeof setTimeout> | undefined;
let confirmationTimer: ReturnType<typeof setTimeout> | undefined,
	confirming = false;
const pending = new Map<string, Map<string, unknown>>();
const unsubscribe: (() => void)[] = [];
const drafts = new Map<
	string,
	{
		practice: Practice;
		answer: string;
		notes: string;
		assistance: string;
		startedAt: string;
	}
>();
let preview:
	| { type: "practice"; items: Practice[] }
	| { type: "backup"; raw: string; additions: number; conflicts: number }
	| null = null;

function workspace() {
	if (!loaded) throw new Error("Open your private workspace first.");
	return loaded.workspace;
}
function repo(): EvidenceRepository {
	if (!repository) throw new Error("Open your private workspace first.");
	return repository;
}
function writable(): boolean {
	return Boolean(
		loaded &&
		!loaded.blocked &&
		!loaded.legacy.some((c) => c.sourceKey === MANIFEST_KEY),
	);
}
function requireWritable(): void {
	if (!writable())
		throw new Error(
			loaded?.blocked ??
				"Review the previous-data migration before making changes.",
		);
}
function status(text: string, tone = ""): void {
	el("saveStatusText").textContent = text;
	el("saveStatus").className = `save-status ${tone}`;
}
function toast(text: string): void {
	el("toast").textContent = text;
	el("toast").hidden = false;
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => {
		el("toast").hidden = true;
	}, 6000);
}
function sourceLink(source: Source): string {
	return safeUrl(source.url)
		? `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.title || "Open source")} ↗</a><span class="source-pinpoint">${escape(source.pinpoint || "Pinpoint missing")}</span>`
		: "Source link not yet confirmed.";
}
function conditionsSummary(): string {
	const notes =
		select("notesMode").value === "closed" ? "Closed notes" : "Open notes";
	const help =
		{ none: "No help", hint: "Hint used", ai: "AI help", human: "Human help" }[
			select("assistance").value as Assistance
		] ?? "Help not specified";
	return `${notes} · ${help}`;
}
function updateConditions(): void {
	el("conditionsSummary").textContent = conditionsSummary();
}
function stage(name: "try" | "compare" | "next"): void {
	el("roundSteps").dataset.stage = name;
	for (const step of el("roundSteps").querySelectorAll<HTMLElement>(
		"[data-step]",
	)) {
		if (step.dataset.step === name) step.setAttribute("aria-current", "step");
		else step.removeAttribute("aria-current");
	}
}
function sessionProgress(): void {
	const length = Math.max(1, queue.length),
		position = Math.min(queueIndex + 1, length);
	const progress = el("sessionProgress");
	progress.hidden = !queue.length;
	progress.setAttribute("aria-valuemax", String(length));
	progress.setAttribute("aria-valuenow", String(position));
	progress.setAttribute("aria-valuetext", `Question ${position} of ${length}`);
	progress.style.setProperty("--progress", `${(position / length) * 100}%`);
}
function formattedDate(timestamp: string): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: workspace().manifest.settings.timeZone,
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(new Date(timestamp));
}
function readOldLocal(): unknown {
	try {
		return localStorage.getItem(OLD_LOCAL_KEY);
	} catch {
		return null;
	}
}
function track(namespace: string, keys: string[]): void {
	if (!engine) return;
	const values = pending.get(namespace) ?? new Map<string, unknown>();
	for (const [key, value] of Object.entries(
		pendingValues(engine, namespace, keys),
	))
		values.set(key, structuredClone(value));
	pending.set(namespace, values);
	status("Saved in this browser · checking cloud copy", "pending");
	clearTimeout(confirmationTimer);
	confirmationTimer = setTimeout(() => {
		void confirmCloud();
	}, 100);
}
async function confirmCloud(): Promise<void> {
	if (!engine || !accessKey || confirming || !pending.size) return;
	confirming = true;
	try {
		await engine.flush();
		for (const [ns, values] of [...pending]) {
			const expected = Object.fromEntries(values),
				remote = await remoteNamespace(ns, accessKey);
			if (!remoteContains(remote, expected)) continue;
			const current = pending.get(ns);
			if (!current) continue;
			for (const [key, value] of Object.entries(expected))
				if (equalRecord(current.get(key), value)) current.delete(key);
			if (!current.size) pending.delete(ns);
		}
		status(
			pending.size
				? "Saved in this browser · cloud not yet confirmed"
				: "Cloud copy confirmed",
			pending.size ? "pending" : "confirmed",
		);
	} catch {
		status("Saved in this browser · cloud not yet confirmed", "pending");
	} finally {
		confirming = false;
	}
}
function save(records: RecordValue[], manifest?: Manifest): void {
	requireWritable();
	const needsManifest = loaded?.needsManifest ?? false;
	repo().commit(records, manifest);
	track(NAMESPACE, [
		...records.map(recordKey),
		...(manifest || needsManifest ? [MANIFEST_KEY] : []),
	]);
	reload();
}
function reload(): void {
	loaded = repo().load();
	render();
}
async function refresh(): Promise<void> {
	if (!engine || !accessKey) return;
	try {
		await remoteNamespace(NAMESPACE, accessKey);
		await Promise.all([engine.pull(NAMESPACE), engine.pull("todo")]);
		reload();
		if (pending.size) await confirmCloud();
		else status("Private workspace refreshed", "confirmed");
	} catch {
		status("Connection unavailable · local records retained", "pending");
	}
}
async function unlock(key: string, remember: boolean): Promise<void> {
	const clean = key.trim();
	if (!clean) throw new Error("Enter your shared widget access key.");
	await remoteNamespace(NAMESPACE, clean);
	try {
		localStorage.setItem(ACCESS_KEY, clean);
	} catch {
		throw new Error(
			"This browser blocks embedded widget storage. Open the standalone Study Engine page, then sign in there.",
		);
	}
	engine = sharedEngine();
	accessKey = clean;
	try {
		await engine.init({ worker: WORKER, namespaces: [NAMESPACE, "todo"] });
	} finally {
		if (!remember)
			try {
				localStorage.removeItem(ACCESS_KEY);
				sessionStorage.setItem(ACCESS_KEY, clean);
			} catch {
				/* Optional after initialization. */
			}
	}
	repository = new EvidenceRepository(engine, readOldLocal);
	loaded = repository.load();
	el("gate").hidden = true;
	el("appShell").hidden = false;
	input("accessKey").value = "";
	status("Private workspace connected", "confirmed");
	unsubscribe.push(engine.subscribe(NAMESPACE, null, () => reload()));
	engine.onSyncStatus((state) => {
		if (state === "error")
			status("Saved locally · connection unavailable", "pending");
	});
	clearInterval(refreshTimer);
	refreshTimer = setInterval(() => {
		if (!document.hidden) void refresh();
	}, 60_000);
	render();
}
function render(): void {
	if (!loaded) return;
	const migrating = loaded.legacy.some((c) => c.sourceKey === MANIFEST_KEY);
	el("dataGuard").hidden = !loaded.blocked && !migrating;
	el("guardText").textContent =
		loaded.blocked ??
		"Previous saved data was found. Preview a safe migration before writing new records.";
	el("guardMigration").hidden = Boolean(loaded.blocked) || !migrating;
	el("legacyNotice").hidden =
		!loaded.legacy.length || migrating || Boolean(loaded.blocked);
	for (const id of ["addButton", "importButton", "sessionMinutes"])
		el<HTMLButtonElement | HTMLSelectElement>(id).disabled = !writable();
	renderToday();
	renderEvidence();
	renderLibrary();
}
function renderToday(): void {
	const state = workspace(),
		plan = buildPlan(state),
		today = dayKey(new Date(), state.manifest.settings.timeZone);
	el("todayDate").textContent = new Intl.DateTimeFormat("en-CA", {
		timeZone: state.manifest.settings.timeZone,
		weekday: "long",
		month: "long",
		day: "numeric",
	}).format(new Date());
	const budget = select("sessionMinutes");
	if (![...budget.options].some((o) => o.value === String(plan.budget)))
		budget.add(new Option(`${plan.budget} min`, String(plan.budget)));
	budget.value = String(plan.budget);
	const practices = Object.values(state.practices),
		attempts = Object.values(state.attempts);
	const draftCount = practices.filter(
		(p) => !p.archived && !sourceReady(p),
	).length;
	const dueCount = practices.filter(
		(p) => !p.archived && sourceReady(p) && p.nextReview <= today,
	).length;
	el("todayFacts").innerHTML = [
		["Recorded attempts", attempts.length],
		[
			"Independent, source-checked",
			attempts.filter((a) => eligibleEvidence(a, latestAssessment(state, a.id)))
				.length,
		],
		[
			"Awaiting assessment",
			attempts.filter((a) => !latestAssessment(state, a.id)).length,
		],
	]
		.map(
			([label, value]) =>
				`<div class="fact"><span>${escape(label)}</span><strong>${loaded?.blocked ? "Not loaded" : value}</strong></div>`,
		)
		.join("");
	const next = plan.steps[0],
		disabled = writable() ? "" : "disabled";
	if (next) {
		const p = next.practice;
		el("planContainer").innerHTML =
			`<article class="focus-card"><div class="round-stat"><span class="eyebrow">Up next</span><span class="tag subtle">${plan.steps.length} ${plan.steps.length === 1 ? "question" : "questions"} · ${plan.minutes} min</span></div><div class="card-meta"><span class="tag">${KIND_LABELS[p.kind]}</span><span class="muted">${escape(p.course)}</span></div><h2>${escape(p.topic)}</h2><p class="detail prompt-preview">${escape(p.prompt)}</p><div class="button-row"><button class="primary" data-action="start-plan" ${disabled}>Let’s practise <span aria-hidden="true">→</span></button><button class="quiet" data-action="send-plan" ${disabled}>Send to To-do</button></div><p class="reason">${escape(next.reason)} Within your ${plan.budget} min budget.</p></article>`;
	} else {
		const title = loaded?.blocked
			? "Your workspace is read-only."
			: !practices.length
				? "Your first round starts here."
				: draftCount
					? "Your drafts need a source check."
					: dueCount
						? "Give this practice enough room."
						: "Nothing scheduled for today.";
		const detail = loaded?.blocked
			? "Export a recovery copy above. Learning records cannot be displayed reliably, and nothing will be overwritten."
			: !practices.length
				? "Bring a small practice pack from Notion AI, or write one question. Try first, then check the source."
				: draftCount
					? `${draftCount} ${draftCount === 1 ? "question needs" : "questions need"} source details or practice permission before starting.`
					: dueCount
						? "A due activity is longer than your budget. Increase the budget or edit its estimate; the engine will not silently overfill your time."
						: "Your review dates are still ahead. You can practise earlier from the library; being caught up is not demonstrated mastery.";
		el("planContainer").innerHTML =
			`<article class="focus-card"><span class="tag">${!practices.length ? "One question at a time" : "Your next step"}</span><h2>${title}</h2><p class="detail">${detail}</p><div class="button-row"><button class="primary" data-action="${!practices.length ? "add" : "library"}" ${disabled}>${!practices.length ? "Add practice" : "Open library"} ↗</button><button class="quiet" data-action="import" ${disabled}>Import from Notion AI</button></div><p class="reason">Your sources stay in Notion. Nothing is automatically graded.</p></article>`;
	}
	el("dueList").innerHTML =
		plan.steps
			.slice(1)
			.map(
				({ practice: p, reason }) =>
					`<article class="due-row"><div class="row-main"><div class="card-meta"><span class="tag subtle">${KIND_LABELS[p.kind]}</span><span class="muted">${escape(p.course)} · ${p.minutes} min</span></div><h3>${escape(p.topic)}</h3><p>${escape(reason)}</p></div><button class="secondary" data-action="start" data-id="${escape(p.id)}" ${disabled}>Practise</button></article>`,
			)
			.join("") +
		(plan.remaining
			? `<p class="fineprint">${plan.remaining} more due ${plan.remaining === 1 ? "activity stays" : "activities stay"} outside this session. Your budget is a boundary, not a streak penalty.</p>`
			: "");
}
function tab(name: string): void {
	activeTab = name;
	el("appShell").dataset.view = name;
	for (const view of ["today", "evidence", "library", "practice"])
		el(`${view}View`).hidden = view !== name;
	document
		.querySelectorAll<HTMLButtonElement>("[data-tab]")
		.forEach((c) =>
			c.setAttribute("aria-pressed", String(c.dataset.tab === name)),
		);
}
function renderEvidence(): void {
	if (loaded?.blocked) {
		el("observationList").innerHTML =
			'<div class="empty-state"><h2>Learning records are unavailable.</h2><p>The saved workspace could not be read safely. Export a recovery copy before making changes; missing data is not a zero score.</p></div>';
		el("historyCount").textContent = "Not loaded";
		el("recordList").innerHTML = "";
		return;
	}
	const state = workspace(),
		patterns = observations(state),
		disabled = writable() ? "" : "disabled";
	el("observationList").innerHTML = patterns.length
		? patterns
				.map(
					(p) =>
						`<article class="observation-card"><span class="tag subtle">${escape(p.course)} · ${KIND_LABELS[p.kind]}</span><h3>${escape(p.topic)}</h3><p>${p.supported} of ${p.sample} responses were recorded as supported against a checked checklist.</p><p class="fineprint">${p.selfAssessed} self-assessments · ${p.instructorAssessed} recorded instructor assessments · ${p.days} days · ${p.variants} ${p.variants === 1 ? "question" : "questions"}. ${p.variants === 1 ? "Same-question repetition is not evidence of transfer." : "Different questions alone do not establish equivalent difficulty or transfer."}</p>${p.gaps.map((g) => `<p class="fineprint">${GAP_LABELS[g.gap]} was tagged on ${g.occurrences} of these attempts.</p>`).join("")}<p class="fineprint">Next-practice proposal: a fresh ${KIND_LABELS[p.kind].toLowerCase()} question${p.gaps.length ? " targeting the recorded gap" : " on this topic"}. This is not a validated optimum or a subject-wide diagnosis.</p><button class="text-button" data-action="variation" data-course="${escape(p.course)}" data-topic="${escape(p.topic)}" data-kind="${p.kind}" ${disabled}>Add a fresh variation ↗</button></article>`,
				)
				.join("")
		: '<div class="empty-state"><h2>Not enough independent evidence yet.</h2><p>Patterns appear only after at least three source-checked, closed-note, unaided attempts on two days. AI-only feedback and unchecked checklists do not qualify. This is a product safeguard, not a mastery threshold.</p></div>';
	const attempts = Object.values(state.attempts).sort(
		(a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt),
	);
	el("historyCount").textContent =
		`${attempts.length} ${attempts.length === 1 ? "attempt" : "attempts"}`;
	el("recordList").innerHTML = attempts.length
		? attempts
				.map((a) => {
					const assessment = latestAssessment(state, a.id);
					const history = Object.values(state.assessments)
						.filter((s) => s.attemptId === a.id)
						.sort(
							(x, y) => Date.parse(x.recordedAt) - Date.parse(y.recordedAt),
						);
					const conditions = `${a.notesMode === "closed" ? "Closed notes" : "Open notes"} · ${a.assistance === "none" ? "no help reported" : `${a.assistance} help reported`} · ${Math.max(1, Math.ceil(a.elapsedSeconds / 60))} min wall time`;
					return `<details class="record"><summary><span class="record-title">${escape(a.context.topic)}</span><span class="tag subtle">${assessment ? verdictLabel(assessment.verdict) : "Awaiting assessment"}</span><p class="record-meta">${escape(a.context.course)} · ${KIND_LABELS[a.context.kind]} · ${formattedDate(a.submittedAt)}</p><p class="record-meta">${escape(assessmentLabel(assessment))}</p></summary><div class="record-content"><p>${escape(a.context.prompt)}</p><p class="fineprint">${escape(conditions)}. Conditions are self-reported; wall time may include interruptions.</p><div class="response-copy">${escape(a.answer || (a.didNotKnow ? "I did not know this yet." : "No response text."))}</div><p class="source-line">${sourceLink(a.context.source)}</p>${history.map((s) => `<div class="assessment-history"><strong>${escape(assessmentLabel(s))}</strong><p>${verdictLabel(s.verdict)} · ${formattedDate(s.recordedAt)}${s.supersedes ? " · correction; earlier assessment retained" : ""}</p>${s.notes ? `<p>${escape(s.notes)}</p>` : ""}${s.feedbackUrl ? `<a href="${escape(s.feedbackUrl)}" target="_blank" rel="noopener noreferrer">Recorded feedback link ↗</a>` : ""}</div>`).join("")}<button class="secondary" data-action="assess" data-id="${escape(a.id)}" ${disabled}>${assessment ? "Add an assessment correction" : "Assess this attempt"}</button></div></details>`;
				})
				.join("")
		: '<div class="empty-state"><p>Your first original response will appear here. No scores are pre-filled.</p></div>';
}
function renderLibrary(): void {
	if (!loaded) return;
	if (loaded.blocked) {
		el("libraryList").innerHTML =
			'<div class="empty-state"><h2>Your saved library is unavailable.</h2><p>The workspace is read-only. Export a recovery copy above; no practice records have been removed.</p></div>';
		return;
	}
	const query = input("librarySearch").value.toLocaleLowerCase("en-CA").trim(),
		kind = select("kindFilter").value,
		archived = input("showArchived").checked;
	const practices = Object.values(workspace().practices).filter(
		(p) =>
			p.archived === archived &&
			(!kind || p.kind === kind) &&
			`${p.course} ${p.topic} ${p.prompt}`
				.toLocaleLowerCase("en-CA")
				.includes(query),
	);
	const courses = [...new Set(practices.map((p) => p.course))].sort(),
		disabled = writable() ? "" : "disabled";
	el("libraryList").innerHTML = courses.length
		? courses
				.map(
					(course) =>
						`<section class="library-group"><h2>${escape(course)}</h2>${practices
							.filter((p) => p.course === course)
							.sort((a, b) => a.topic.localeCompare(b.topic))
							.map(
								(p) =>
									`<article class="library-row"><div class="row-main"><div class="card-meta"><span class="tag subtle">${KIND_LABELS[p.kind]}</span><span class="muted">${p.minutes} min · ${sourceReady(p) ? `Review ${escape(p.nextReview)}` : "Draft: confirm source / permission"}</span></div><h3>${escape(p.topic)}</h3><p class="source-line">${sourceLink(p.source)}</p><p class="fineprint">${p.checklistChecked ? "Checklist source-checked by you" : "Checklist unverified"} · ${p.checklistOrigin === "notion-ai" ? "Notion AI draft" : p.checklistOrigin === "instructor" ? "Recorded instructor checklist" : "Your checklist"}</p></div><div class="row-actions"><button class="secondary" data-action="start" data-id="${escape(p.id)}" ${writable() && sourceReady(p) && !p.archived ? "" : "disabled"}>Practise</button><button class="quiet" data-action="edit" data-id="${escape(p.id)}" ${disabled}>Edit</button><button class="quiet" data-action="archive" data-id="${escape(p.id)}" ${disabled}>${p.archived ? "Restore" : "Archive"}</button></div></article>`,
							)
							.join("")}</section>`,
				)
				.join("")
		: `<div class="empty-state"><h2>${query || kind || archived ? "No matching practice." : "Start small. Keep it grounded."}</h2><p>${query || kind || archived ? "Try another filter. No records have been removed." : "Add one question or import a focused pack from Notion AI. Review the source support before trusting its checklist."}</p></div>`;
}
function startPractice(ids: string[]): void {
	requireWritable();
	queue = ids;
	queueIndex = 0;
	nextQuestion();
}
function nextQuestion(): void {
	currentAttempt = null;
	correctionBase = null;
	const id = queue[queueIndex],
		practice = id ? workspace().practices[id] : undefined;
	if (!practice || !sourceReady(practice) || practice.archived) {
		tab("today");
		currentPractice = null;
		reload();
		return;
	}
	const draft = drafts.get(practice.id);
	currentPractice = structuredClone(draft?.practice ?? practice);
	startedAt = draft?.startedAt ?? new Date().toISOString();
	tab("practice");
	renderQuestion(currentPractice);
	area("practiceAnswer").value = draft?.answer ?? "";
	select("notesMode").value = draft?.notes ?? "closed";
	select("assistance").value = draft?.assistance ?? "none";
	el("sessionPosition").textContent =
		`Question ${queueIndex + 1} of ${queue.length} · ~${practice.minutes} min`;
	updateConditions();
	sessionProgress();
	el("questionText").focus({ preventScroll: true });
	el("practiceView").scrollIntoView({ block: "start" });
}
function renderQuestion(p: Practice): void {
	el("practiceKind").textContent = KIND_LABELS[p.kind];
	el("practiceCourse").textContent = p.course;
	el("practiceTopic").textContent = p.topic;
	el("questionText").textContent = p.prompt;
	el("questionText").classList.toggle("long-question", p.prompt.length > 280);
	el("practiceSource").innerHTML = sourceLink(p.source);
	el("practiceSourceBadge").textContent = p.checklistChecked
		? "Checked by you"
		: "Checklist unverified";
	el<HTMLDetailsElement>("practiceSourceDetails").open = false;
	el<HTMLDetailsElement>("attemptConditions").open = false;
	el("answerStage").hidden = false;
	stage("try");
	area("practiceAnswer").disabled = false;
	select("notesMode").disabled = false;
	select("assistance").disabled = false;
	el("beforeReveal").hidden = false;
	el("comparison").hidden = true;
}
function recordAttempt(didNotKnow: boolean): void {
	if (!currentPractice || currentAttempt) return;
	const answer = area("practiceAnswer").value.trim();
	if (!answer && !didNotKnow) {
		toast("Try a response, or choose “I don’t know yet”.");
		return;
	}
	const submittedAt = new Date().toISOString();
	const attempt: Attempt = {
		schemaVersion: 2,
		type: "attempt",
		id: newId("attempt"),
		practiceId: currentPractice.id,
		context: snapshotContext(currentPractice),
		answer,
		didNotKnow,
		notesMode: select("notesMode").value as Attempt["notesMode"],
		assistance: select("assistance").value as Assistance,
		startedAt,
		submittedAt,
		elapsedSeconds: Math.max(
			0,
			Math.round((Date.parse(submittedAt) - Date.parse(startedAt)) / 1000),
		),
	};
	save([attempt]);
	drafts.delete(currentPractice.id);
	currentAttempt = attempt;
	reveal();
}
function reveal(previous?: Assessment): void {
	if (!currentAttempt) return;
	const a = currentAttempt;
	area("practiceAnswer").value =
		a.answer || (a.didNotKnow ? "I did not know this yet." : "");
	area("practiceAnswer").disabled = true;
	select("notesMode").value = a.notesMode;
	select("assistance").value = a.assistance;
	select("notesMode").disabled = true;
	select("assistance").disabled = true;
	el("beforeReveal").hidden = true;
	el("answerStage").hidden = true;
	el("comparison").hidden = false;
	stage("compare");
	el("answerChecklist").innerHTML = checklistHtml(a.context.checklist);
	el("originalQuestion").textContent = a.context.prompt;
	el("originalResponse").textContent = area("practiceAnswer").value;
	el("recordedConditions").textContent =
		`${conditionsSummary()} · Self-reported at submission.`;
	el("checklistBadge").textContent = a.context.checklistChecked
		? "Checked by you"
		: a.context.checklistOrigin === "notion-ai"
			? "AI draft · Unverified"
			: "Checklist unverified";
	for (const disclosure of el(
		"comparison",
	).querySelectorAll<HTMLDetailsElement>("details"))
		disclosure.open = false;
	el<HTMLDetailsElement>("assessmentDetails").open = Boolean(previous);
	el("assessmentDetails").hidden = false;
	el<HTMLDetailsElement>("feedbackDetails").open = Boolean(
		previous && (previous.assessor !== "self" || previous.notes),
	);
	el("comparisonSource").innerHTML = sourceLink(a.context.source);
	el("checklistProvenance").textContent =
		`${a.context.checklistOrigin === "notion-ai" ? "Notion AI drafted this checklist." : a.context.checklistOrigin === "instructor" ? "Checklist recorded as instructor-provided." : "Self-authored checklist."} ${a.context.checklistChecked ? "You marked it source-checked before this attempt." : "It was unverified when this attempt began; this response is excluded from pattern summaries."}`;
	el<HTMLFormElement>("assessmentForm").reset();
	select("assessor").value = previous?.assessor ?? "self";
	select("verdict").value =
		previous?.verdict ?? (a.didNotKnow ? "needs-work" : "partial");
	input("sourceChecked").checked = previous?.sourceChecked ?? false;
	area("assessmentNotes").value = previous?.notes ?? "";
	input("feedbackUrl").value = previous?.feedbackUrl ?? "";
	for (const control of document.querySelectorAll<HTMLInputElement>(
		'[name="gap"]',
	))
		control.checked = previous?.gaps.includes(control.value as Gap) ?? false;
	el("assessmentError").textContent = "";
	el("assessmentForm").hidden = false;
	el("assessmentSaved").hidden = true;
	button("saveAssessment").textContent = previous
		? "Save correction, keep original"
		: "Save self-check";
	const hasNext = queueIndex + 1 < queue.length;
	button("nextPractice").textContent = hasNext
		? "Next question →"
		: "Finish session →";
	button("nextPractice").hidden = false;

	el("continueNote").textContent =
		"Self-check optional. Your response is already saved.";
	correctionBase = previous?.id ?? null;
	reviewSuggestion();
	el("comparisonHeading").focus({ preventScroll: true });
	el("practiceView").scrollIntoView({ block: "start" });
}
function formAssessment(): Assessment {
	if (!currentAttempt)
		throw new Error("Record the response before assessing it.");
	return {
		schemaVersion: 2,
		type: "assessment",
		id: newId("assessment"),
		attemptId: currentAttempt.id,
		assessor: select("assessor").value as Assessor,
		verdict: select("verdict").value as Verdict,
		sourceChecked: input("sourceChecked").checked,
		notes: area("assessmentNotes").value.trim(),
		gaps: [
			...document.querySelectorAll<HTMLInputElement>('[name="gap"]:checked'),
		].map((c) => c.value as Gap),
		feedbackUrl: input("feedbackUrl").value.trim(),
		recordedAt: new Date().toISOString(),
		supersedes: correctionBase,
	};
}
function reviewSuggestion(): void {
	if (!currentAttempt) return;
	const assessment = formAssessment(),
		instructor = assessment.assessor === "instructor";
	input("nextReview").value = suggestedReview(
		assessment,
		currentAttempt,
		dayKey(new Date(), workspace().manifest.settings.timeZone),
	);
	if (assessment.assessor !== "self")
		el<HTMLDetailsElement>("feedbackDetails").open = true;
	button("saveAssessment").textContent = correctionBase
		? "Save correction, keep original"
		: assessment.assessor === "self"
			? "Save self-check"
			: "Save recorded feedback";
	input("feedbackUrl").required = instructor;
	area("assessmentNotes").required = assessment.assessor !== "self";
	el("feedbackRequirement").textContent = instructor
		? "Required for recorded instructor feedback"
		: "Optional";
	el("assessmentCaution").textContent =
		assessment.assessor === "ai"
			? "AI feedback remains provisional, even if you check the source. It is excluded from pattern summaries. Add your own checked assessment separately."
			: !independent(currentAttempt)
				? "Assisted or open-note practice is excluded from independent-performance patterns."
				: !currentAttempt.context.checklistChecked
					? "The checklist was unverified before this attempt. Verify it in the library, then try again before using it as pattern evidence."
					: "A self-assessment is not an independently graded exam. Keep the observation specific and verify each legal correction.";
}
function saveAssessment(event: Event): void {
	event.preventDefault();
	try {
		if (!currentAttempt) return;
		const assessment = formAssessment();
		if (assessment.assessor !== "self" && !assessment.notes)
			throw new Error("Record the actual feedback, not only its rating.");
		if (
			assessment.assessor === "instructor" &&
			!safeUrl(assessment.feedbackUrl)
		)
			throw new Error(
				"Add a link to the instructor feedback you are recording.",
			);
		if (!validDay(input("nextReview").value))
			throw new Error("Choose a valid next-practice date.");
		const latest = latestAssessment(workspace(), currentAttempt.id);
		if ((latest?.id ?? null) !== correctionBase)
			throw new Error(
				"Another assessment arrived. Reopen this attempt before adding your correction.",
			);
		const existing = workspace().practices[currentAttempt.practiceId],
			records: RecordValue[] = [assessment];
		if (existing)
			records.push({
				...existing,
				nextReview: input("nextReview").value,
				updatedAt: assessment.recordedAt,
			});
		save(records);
		el("assessmentForm").hidden = true;
		el("assessmentDetails").hidden = true;
		el("assessmentSaved").hidden = false;
		stage("next");
		el("savedSummary").textContent =
			`${verdictLabel(assessment.verdict)} · ${assessmentLabel(assessment)}. Next practice: ${input("nextReview").value}. Original response and earlier assessments retained.`;
		el("continueNote").textContent =
			"Comparison saved. Original response kept.";
		toast("Comparison saved with its assessor and source status.");
	} catch (error) {
		el("assessmentError").textContent = message(error);
	}
}
function assessExisting(id: string): void {
	requireWritable();
	const a = workspace().attempts[id],
		practice = a ? workspace().practices[a.practiceId] : undefined;
	if (!a || !practice)
		throw new Error(
			"This attempt is missing its practice record. Export a recovery copy.",
		);
	queue = [];
	queueIndex = 0;
	currentAttempt = a;
	currentPractice = { ...practice, ...structuredClone(a.context) };
	tab("practice");
	renderQuestion(currentPractice);
	el("sessionPosition").textContent =
		`Recorded ${formattedDate(a.submittedAt)}`;
	sessionProgress();
	reveal(latestAssessment(workspace(), id));
	el<HTMLDetailsElement>("assessmentDetails").open = true;
}
function leavePractice(): void {
	if (
		currentPractice &&
		!currentAttempt &&
		area("practiceAnswer").value.trim()
	) {
		drafts.set(currentPractice.id, {
			practice: currentPractice,
			answer: area("practiceAnswer").value,
			notes: select("notesMode").value,
			assistance: select("assistance").value,
			startedAt,
		});
		toast(
			"Unfinished response kept in this tab. It is not recorded as evidence.",
		);
	}
	currentPractice = null;
	currentAttempt = null;
	tab("today");
	reload();
}
function openEditor(
	p?: Practice,
	variation?: { course: string; topic: string; kind: string },
): void {
	requireWritable();
	el<HTMLFormElement>("practiceForm").reset();
	input("editId").value = p?.id ?? "";
	el("practiceDialogHeading").textContent = p
		? "Edit practice"
		: variation
			? "Add a fresh variation"
			: "Add practice";
	const values: Record<string, string> = {
		courseInput: p?.course ?? variation?.course ?? "",
		topicInput: p?.topic ?? variation?.topic ?? "",
		kindInput: p?.kind ?? variation?.kind ?? "retrieve",
		minutesInput: String(p?.minutes ?? 5),
		promptInput: p?.prompt ?? "",
		checklistInput: p?.checklist ?? "",
		sourceUrlInput: p?.source.url ?? "",
		sourceTitleInput: p?.source.title ?? "",
		pinpointInput: p?.source.pinpoint ?? "",
		sourceKindInput: p?.source.kind ?? "assigned-source",
		originInput: p?.checklistOrigin ?? "self",
		priorityInput: p?.priority ?? "medium",
		reviewInput:
			p?.nextReview ??
			dayKey(new Date(), workspace().manifest.settings.timeZone),
	};
	for (const [id, value] of Object.entries(values))
		el<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id).value =
			value;
	input("checklistCheckedInput").checked = p?.checklistChecked ?? false;
	input("permittedInput").checked = p?.permittedPractice ?? false;
	el("practiceFormError").textContent = "";
	dialog("practiceDialog").showModal();
}
function savePractice(event: Event): void {
	event.preventDefault();
	try {
		const id = input("editId").value || newId("practice"),
			existing = workspace().practices[id],
			now = new Date().toISOString();
		const p: Practice = {
			schemaVersion: 2,
			type: "practice",
			id,
			course: input("courseInput").value.trim(),
			topic: input("topicInput").value.trim(),
			kind: select("kindInput").value as PracticeKind,
			prompt: area("promptInput").value.trim(),
			checklist: area("checklistInput").value.trim(),
			source: {
				url: input("sourceUrlInput").value.trim(),
				title: input("sourceTitleInput").value.trim(),
				pinpoint: input("pinpointInput").value.trim(),
				kind: select("sourceKindInput").value as Source["kind"],
			},
			checklistOrigin: select("originInput")
				.value as Practice["checklistOrigin"],
			checklistChecked: input("checklistCheckedInput").checked,
			permittedPractice: input("permittedInput").checked,
			minutes: Number(input("minutesInput").value),
			priority: select("priorityInput").value as Practice["priority"],
			nextReview: input("reviewInput").value,
			archived: existing?.archived ?? false,
			createdAt: existing?.createdAt ?? now,
			updatedAt: now,
		};
		if (!validPractice(p) || !sourceReady(p))
			throw new Error(
				"Add a valid HTTPS source, exact pinpoint, checklist, and practice permission.",
			);
		save([p]);
		dialog("practiceDialog").close();
		tab("library");
		toast("Source-linked practice saved. Your full notes stay in Notion.");
	} catch (error) {
		el("practiceFormError").textContent = message(error);
	}
}
function exportBackup(): void {
	const url = URL.createObjectURL(
			new Blob([repo().backup()], { type: "application/json" }),
		),
		link = document.createElement("a");
	link.href = url;
	link.download = `study-engine-private-${dayKey()}.json`;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
	toast("Private backup downloaded. Keep it out of public repositories.");
}
function clearPreview(): void {
	preview = null;
	el("importPreview").hidden = true;
	el("importPermissionRow").hidden = true;
	input("importPermission").checked = false;
	button("confirmImport").disabled = true;
	el("importError").textContent = "";
}
function openImport(): void {
	requireWritable();
	area("importInput").value = "";
	input("importFile").value = "";
	select("importMode").value = "practice";
	clearPreview();
	dialog("importDialog").showModal();
}
function checkImport(): void {
	try {
		requireWritable();
		clearPreview();
		const raw = area("importInput").value;
		if (raw.length > 10 * 1024 * 1024)
			throw new Error("Use a file smaller than 10 MB for one import.");
		if (select("importMode").value === "practice") {
			const items = practicePack(raw);
			preview = { type: "practice", items };
			el("importPreviewTitle").textContent =
				`${items.length} source-linked practice ${items.length === 1 ? "question" : "questions"}`;
			el("importPreviewText").textContent =
				`${[...new Set(items.map((p) => p.course))].join(", ")}. Checklists remain unverified. Exact duplicates will be skipped; existing evidence will not be replaced.`;
			el("importPermissionRow").hidden = false;
		} else {
			const checked = repo().restorePreview(raw);
			preview = {
				type: "backup",
				raw,
				additions: checked.additions,
				conflicts: checked.conflicts,
			};
			el("importPreviewTitle").textContent =
				`${checked.additions} missing records · ${checked.conflicts} conflicts`;
			el("importPreviewText").textContent = checked.conflicts
				? "Conflicting backups cannot be merged automatically. No data has changed."
				: "Only missing records are added. Current settings, practice edits, and original evidence are kept.";
		}
		el("importPreview").hidden = false;
		updateImportButton();
	} catch (error) {
		el("importError").textContent = message(error);
	}
}
function updateImportButton(): void {
	button("confirmImport").disabled =
		!preview ||
		!writable() ||
		(preview.type === "practice"
			? !input("importPermission").checked
			: preview.conflicts > 0);
}
function fingerprint(p: Practice): string {
	return JSON.stringify([
		p.course,
		p.topic,
		p.kind,
		p.prompt,
		p.checklist,
		p.source.url,
		p.source.title,
		p.source.pinpoint,
		p.source.kind,
	]);
}
function confirmImport(): void {
	try {
		requireWritable();
		if (!preview) return;
		let added = 0;
		if (preview.type === "practice") {
			if (!input("importPermission").checked)
				throw new Error("Confirm that this is permitted practice.");
			const known = new Set(
				Object.values(workspace().practices).map(fingerprint),
			);
			const additions = preview.items
				.filter((p) => {
					const token = fingerprint(p);
					if (known.has(token)) return false;
					known.add(token);
					return true;
				})
				.map((p) => ({ ...p, permittedPractice: true }));
			if (additions.length) save(additions);
			added = additions.length;
		} else {
			const checked = repo().restorePreview(preview.raw);
			added = repo().restore(preview.raw);
			if (added)
				track(NAMESPACE, [...checked.records.map(recordKey), MANIFEST_KEY]);
			reload();
		}
		dialog("importDialog").close();
		tab("library");
		toast(
			`${added} ${added === 1 ? "record added" : "records added"}. Existing records preserved.`,
		);
	} catch (error) {
		el("importError").textContent = message(error);
	}
}
function openMigration(): void {
	if (!loaded || loaded.blocked) return;
	const count = new Set(
		loaded.legacy.flatMap((c) => c.practices.map((p) => p.id)),
	).size;
	const ratings = loaded.legacy.reduce((sum, c) => sum + c.previousRatings, 0);
	el("migrationSummary").innerHTML =
		`<p><strong>${count} ${count === 1 ? "question" : "questions"}</strong> can be brought in as ${count === 1 ? "an unverified draft" : "unverified drafts"}.</p><p><strong>${ratings} previous ${ratings === 1 ? "rating" : "ratings"}</strong> ${ratings === 1 ? "stays" : "stay"} in the recovery copy, not the new evidence model.</p><p><strong>${loaded.legacy.length} saved ${loaded.legacy.length === 1 ? "source" : "sources"}</strong> will be preserved privately.</p>`;
	input("migrationPermission").checked = false;
	button("confirmMigration").disabled = true;
	el("migrationError").textContent = "";
	dialog("migrationDialog").showModal();
}
function migrate(): void {
	try {
		if (!input("migrationPermission").checked) return;
		const result = repo().migrate();
		loaded = repo().load();
		if (engine)
			track(NAMESPACE, [
				MANIFEST_KEY,
				...Object.keys(engine.getAll(NAMESPACE)).filter((k) =>
					k.startsWith("evidence.v2."),
				),
			]);
		dialog("migrationDialog").close();
		render();
		tab("library");
		toast(
			`${result.imported} drafts preserved. Previous ratings remain in the private recovery record.`,
		);
	} catch (error) {
		el("migrationError").textContent = message(error);
	}
}
async function sendPlan(): Promise<void> {
	requireWritable();
	if (!engine) return;
	await remoteNamespace("todo", accessKey);
	await engine.pull("todo");
	const result = planToTodos(
		buildPlan(workspace()),
		parseTodos(engine.get("todo", "tasks")),
	);
	if (!result.added) {
		toast(
			"Those activities are already in To-do. Existing edits and completion were kept.",
		);
		return;
	}
	engine.set("todo", "tasks", JSON.stringify(result.tasks));
	track("todo", ["tasks"]);
	toast(
		`${result.added} activities sent to the To-do widget. This does not create Notion calendar items or record learning.`,
	);
}
function bind(): void {
	el("unlockForm").addEventListener("submit", (event) => {
		event.preventDefault();
		button("unlockButton").disabled = true;
		el("unlockStatus").textContent = "Verifying your private workspace…";
		void unlock(input("accessKey").value, input("rememberKey").checked)
			.catch((error: unknown) => {
				el("unlockStatus").textContent = message(error);
				el("unlockStatus").classList.add("error");
			})
			.finally(() => {
				button("unlockButton").disabled = false;
			});
	});
	document.addEventListener("click", (event) => {
		const target =
			event.target instanceof Element
				? event.target.closest<HTMLElement>(
						"[data-action], [data-tab], [data-go], [data-close]",
					)
				: null;
		if (!target || (target instanceof HTMLButtonElement && target.disabled))
			return;
		try {
			if (target.dataset.close) {
				dialog(target.dataset.close).close();
				return;
			}
			if (target.dataset.tab || target.dataset.go) {
				if (activeTab === "practice") leavePractice();
				tab(target.dataset.tab ?? target.dataset.go ?? "today");
				return;
			}
			const id = target.dataset.id ?? "",
				practice = workspace().practices[id];
			switch (target.dataset.action) {
				case "add":
					openEditor();
					break;
				case "import":
					openImport();
					break;
				case "library":
					tab("library");
					break;
				case "start-plan":
					startPractice(buildPlan(workspace()).steps.map((s) => s.practice.id));
					break;
				case "start":
					startPractice([id]);
					break;
				case "send-plan":
					void sendPlan().catch((error: unknown) => toast(message(error)));
					break;
				case "edit":
					if (practice) openEditor(practice);
					break;
				case "archive":
					if (practice)
						save([
							{
								...practice,
								archived: !practice.archived,
								updatedAt: new Date().toISOString(),
							},
						]);
					break;
				case "assess":
					assessExisting(id);
					break;
				case "variation":
					openEditor(undefined, {
						course: target.dataset.course ?? "",
						topic: target.dataset.topic ?? "",
						kind: target.dataset.kind ?? "retrieve",
					});
					break;
			}
		} catch (error) {
			toast(message(error));
		}
	});
	for (const id of ["aboutButton", "footerAbout"])
		button(id).addEventListener("click", () =>
			dialog("aboutDialog").showModal(),
		);
	button("refreshButton").addEventListener("click", () => {
		void refresh();
	});
	button("lockButton").addEventListener("click", () => {
		dispose();
		accessKey = "";
		try {
			localStorage.removeItem(ACCESS_KEY);
			sessionStorage.removeItem(ACCESS_KEY);
		} catch {
			/* No study records are cleared. */
		}
		try {
			const request = indexedDB.open("widget_sync", 1);
			request.onsuccess = () => {
				if (request.result.objectStoreNames.contains("meta"))
					request.result
						.transaction("meta", "readwrite")
						.objectStore("meta")
						.delete("passphrase");
				request.result.close();
			};
		} catch {
			/* Optional credential store. */
		}
		el("appShell").hidden = true;
		el("gate").hidden = false;
		el("unlockStatus").textContent =
			"Locked. Your practice records were not deleted.";
		location.reload();
	});
	select("sessionMinutes").addEventListener("change", () => {
		try {
			const m = structuredClone(workspace().manifest);
			m.settings.sessionMinutes = Number(select("sessionMinutes").value);
			m.updatedAt = new Date().toISOString();
			save([], m);
		} catch (error) {
			toast(message(error));
		}
	});
	button("addButton").addEventListener("click", () => {
		try {
			openEditor();
		} catch (error) {
			toast(message(error));
		}
	});
	button("importButton").addEventListener("click", () => {
		try {
			openImport();
		} catch (error) {
			toast(message(error));
		}
	});
	el("practiceForm").addEventListener("submit", savePractice);
	for (const id of ["librarySearch", "kindFilter", "showArchived"])
		el(id).addEventListener("input", renderLibrary);
	button("submitAttempt").addEventListener("click", () => {
		try {
			recordAttempt(false);
		} catch (error) {
			toast(message(error));
		}
	});
	button("dontKnow").addEventListener("click", () => {
		try {
			recordAttempt(true);
		} catch (error) {
			toast(message(error));
		}
	});
	el("practiceSource").addEventListener("click", (event) => {
		if (
			!currentAttempt &&
			event.target instanceof Element &&
			event.target.closest("a")
		) {
			select("notesMode").value = "open";
			updateConditions();
			toast("Source opened. This attempt is now marked open-note.");
		}
	});
	for (const id of ["notesMode", "assistance"])
		el(id).addEventListener("change", updateConditions);
	for (const id of ["assessor", "verdict", "sourceChecked"])
		el(id).addEventListener("change", reviewSuggestion);
	el("assessmentForm").addEventListener("submit", saveAssessment);
	button("nextPractice").addEventListener("click", () => {
		if (queueIndex + 1 < queue.length) {
			queueIndex += 1;
			nextQuestion();
		} else leavePractice();
	});
	for (const id of ["exitPractice"])
		button(id).addEventListener("click", leavePractice);
	for (const id of ["exportButton", "guardExport", "migrationExport"])
		button(id).addEventListener("click", () => {
			try {
				exportBackup();
			} catch (error) {
				toast(message(error));
			}
		});
	for (const id of ["reviewLegacy", "guardMigration"])
		button(id).addEventListener("click", openMigration);
	button("confirmMigration").addEventListener("click", migrate);
	input("migrationPermission").addEventListener("change", () => {
		button("confirmMigration").disabled = !input("migrationPermission").checked;
	});
	button("previewImport").addEventListener("click", checkImport);
	button("confirmImport").addEventListener("click", confirmImport);
	input("importPermission").addEventListener("change", updateImportButton);
	for (const id of ["importInput", "importMode"])
		el(id).addEventListener("input", clearPreview);
	input("importFile").addEventListener("change", () => {
		clearPreview();
		const file = input("importFile").files?.[0];
		if (!file) return;
		if (file.size > 10 * 1024 * 1024) {
			el("importError").textContent = "Use a file smaller than 10 MB.";
			return;
		}
		void file
			.text()
			.then((value) => {
				area("importInput").value = value;
			})
			.catch(() => {
				el("importError").textContent =
					"That file could not be read. Nothing was changed.";
			});
	});
	button("copyAuthoringPrompt").addEventListener("click", () => {
		const copy =
			navigator.clipboard?.writeText(AUTHORING_PROMPT) ??
			Promise.reject(new Error("Clipboard unavailable"));
		void copy
			.then(() =>
				toast(
					"Notion AI instructions copied. Use them with the actual assigned sources.",
				),
			)
			.catch(() => {
				clearPreview();
				area("importInput").value = AUTHORING_PROMPT;
				area("importInput").select();
				toast(
					"Instructions placed in the box for copying. Replace them with the JSON pack before importing.",
				);
			});
	});
}
export function dispose(): void {
	clearInterval(refreshTimer);
	clearTimeout(toastTimer);
	clearTimeout(confirmationTimer);
	for (const stop of unsubscribe.splice(0)) stop();
}
export async function boot(): Promise<void> {
	bind();
	let remembered = "";
	try {
		remembered =
			sessionStorage.getItem(ACCESS_KEY) ||
			localStorage.getItem(ACCESS_KEY) ||
			"";
	} catch {
		/* Sign-in remains available. */
	}
	if (!remembered) return;
	el("unlockStatus").textContent = "Restoring your private workspace…";
	try {
		await unlock(remembered, Boolean(localStorage.getItem(ACCESS_KEY)));
	} catch (error) {
		el("unlockStatus").textContent = message(error);
		el("unlockStatus").classList.add("error");
	}
}
void boot();

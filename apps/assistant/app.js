import "../../reading-estimates.js?v=20261002-smart-schedule";
const Reading = globalThis.ReadingEstimates;
import { changeCalendar, undoCalendar } from "./calendar-actions.mjs";
import { ghostEvents, planNudge, timeAtOffset, parseTypeTag, stripTypeTag, withTypeTag } from "./calendar-extras.mjs";
import { reorderIds, insertionIndex, movedTimes, resizedEnd, snap } from "./interactions.mjs";
import { readingCandidates } from "./readings-import.mjs";
import { SPRINT, sprintCount, sprintMinutes, sessionPlan, oversizedSteps, breakAfterStep } from "./sprints.mjs";
import { courseOfTask, paceSamples, learnedPace, sprintCap, nextCommitment, replanRemaining } from "./pace.mjs";
import { conflicts, resolveOverlap } from "./overlap.mjs";
import {
	dailyGoal,
	dateKey,
	isoDate,
	localDate,
	normalizeDateKey,
	minutes,
	timeString,
	duration,
	focusTasks,
	focusPick,
	focusLength,
	blockOf,
	isCalendarReminder,
	todayTasks,
	intervals,
	gaps,
	validateSlot,
	suggestSlot,
	escapeHtml as esc,
} from "./domain.mjs";
import {
	KINDS,
	BILLABLE,
	KIND_LABEL,
	WEEKLY_TARGET,
	isKind,
	classifyText,
	taskKind,
	formatUnits,
	unitsFor,
	minutesFor,
	weekStart,
	weekKeys,
	sessionEntries,
	withCleared,
	classEntries,
	scheduledEntries,
	summarize,
	manualSession,
	appendSession,
	removeSession,
	HEAT_WEEKS,
	STREAK_MIN,
	dayTotals,
	heatCells,
	heatRange,
	streakStats,
	moodFor,
	comparison,
	practiceShare,
	PRACTICE_GOAL,
	isLateNight,
	lateNightHours,
} from "./hours.mjs";
import { canUse3D, loadBroadcast3D, loadCarry3D } from "./broadcast3d.mjs";
import { momentFor, pickLine, pickEventLine, nextStep, milestoneReached, weeklyReview } from "./partner.mjs";
import { syllablePlan, speak, stopVoice } from "./voice.mjs";
import { planDay, isUnscheduled, PLAN_START, PLAN_END } from "./autofit.mjs";
import { suggestLastPage, planPageSplit, planTimeSplit, defaultRemaining } from "./split.mjs";
const WORKER = "https://widget-sync.lordgrape-widgets.workers.dev";
const SESSION_KEY = "command-centre-access-v1",
	THEME_KEY = "command-centre-theme-v1",
	REVISION = "20261004-carry-reactions";
const $ = (s) => document.querySelector(s),
	root = new URL("../../", location.href);
const paths = {
	todo: "todo-smart-shell.html",
	timetable: "timetable-shell.html",
	clock: "clock.html",
};
let accessKey = "",
	view = "today",
	engines = {},
	tasks = [],
	courses = [],
	goal = {},
	target = 1,
	selectedId = null,
	selectedAt = 0,
	weekOffset = 0,
	planDays = 3,
	collapsed = new Set(["could"]),
	signature = "",
	loadingTimer,
	pollTimer,
	lastFocus = null,
	toastTimer,
	lastTaskRaw,
	undoAction = null,
	toastAction = null,
	docketOffset = 0;
let theme = document.documentElement.dataset.theme || "light";
function icon(name) {
	return WidgetIcons.svg(name, {command: true});
}
function decorate(scope = document) {
	scope
		.querySelectorAll("[data-icon]")
		.forEach((n) => (n.innerHTML = icon(n.dataset.icon)));
}
let interfaceAudio = null;
let recentScheduleId = null;
let broadcastAudio = null, broadcastResetTimer = 0;
let broadcastVersion = 0;
let broadcastLine = "My office. Let's see the numbers.", broadcastPose = "", broadcastMood = "approve";
let broadcast3D = null, broadcast3DFailed = false, celebratedWeek = "";
let carry3D = null, carry3DFailed = false, carryCheer = false, carryWave = false;
let carryTyping = false, carryTypingTimer = 0, carryOpenTasks = null;
let partnerCta = null, partnerLine = { key: "", line: null, moment: "", vars: {} }, partnerCheer = false;
const partnerUsed = new Set();
function broadcastVisible() {
	return engines.todo?.SyncEngine.get("user", "commandPartnerVisible") !== false;
}

function carryMarkup() {
	if (!broadcastVisible()) return "";
	return `<button type="button" class="carry-companion" data-action="carry-greet" aria-label="Say hello to Carry, Broadcast's son" title="Carry, Broadcast's son"><img src="./carry.webp?v=${REVISION}" width="88" height="88" alt="" draggable="false"><span class="carry-3d" aria-hidden="true"></span></button>`;
}

function mountCarry3D() {
	carry3D?.detach();
	if (!$(".carry-companion") || carry3DFailed || !canUse3D()) return;
	loadCarry3D(new URL("./carry.glb?v=" + REVISION, import.meta.url).href)
		.then((companion) => {
			carry3D = companion;
			const button = $(".carry-companion");
			if (!button || !broadcastVisible() || !canUse3D()) return;
			companion.attach(button.querySelector(".carry-3d"));
			companion.setTyping(carryTyping);
			button.classList.add("has-3d");
			if (carryCheer) {
				carryCheer = false;
				carryWave = false;
				companion.react("cheer");
			} else if (carryWave) {
				carryWave = false;
				companion.react("wave");
			}
		})
		.catch((error) => {
			carry3DFailed = true;
			$(".carry-companion")?.classList.remove("has-3d");
			console.warn("Carry 3D is unavailable; using his portrait.", error);
		});
}

function celebrateWithCarry() {
	if (!$(".carry-companion") || !canUse3D()) return;
	if (carry3D) carry3D.react("cheer");
	else carryCheer = true;
}

function waveWithCarry() {
	if (!$(".carry-companion") || !canUse3D()) return;
	if (carry3D) carry3D.react("wave");
	else carryWave = true;
}

function setCarryTyping(active) {
	clearTimeout(carryTypingTimer);
	carryTyping = active && !!$(".carry-companion") &&
		!matchMedia("(prefers-reduced-motion: reduce)").matches;
	carry3D?.setTyping(carryTyping);
	if (carryTyping) carryTypingTimer = setTimeout(() => setCarryTyping(false), 1000);
}
function broadcastSoundEnabled() {
	return engines.todo?.SyncEngine.get("user", "commandPartnerSound") !== false;
}
function stopBroadcastAudio() {
	broadcastVersion++;
	stopVoice();
	if (!broadcastAudio) return;
	try { broadcastAudio.stop(); } catch {}
	broadcastAudio = null;
}
function broadcastChatter() {
	if (!broadcastVisible() || !broadcastSoundEnabled()) return;
	stopBroadcastAudio();
	const version = broadcastVersion;
	try {
		const Audio = window.AudioContext || window.webkitAudioContext;
		if (!Audio) return;
		const context = new Audio();
		context.resume().catch(() => {});
		const master = context.createGain();
		master.gain.value = 0.045;
		master.connect(context.destination);
		broadcastAudio = { stop: () => { try { master.disconnect(); context.close(); } catch {} } };
		const start = context.currentTime;
		for (let i = 0; i < 5; i++) {
			const oscillator = context.createOscillator(), filter = context.createBiquadFilter(), gain = context.createGain();
			const at = start + i * 0.105;
			oscillator.type = "sawtooth";
			oscillator.frequency.setValueAtTime(88 + (i % 3) * 28, at);
			oscillator.frequency.linearRampToValueAtTime(125 + (i % 2) * 30, at + 0.07);
			filter.type = "bandpass";
			filter.frequency.setValueAtTime(520 + (i % 3) * 180, at);
			filter.frequency.linearRampToValueAtTime(850 - (i % 2) * 260, at + 0.08);
			filter.Q.value = 3.2;
			gain.gain.setValueAtTime(0.001, at);
			gain.gain.linearRampToValueAtTime(0.48, at + 0.014);
			gain.gain.exponentialRampToValueAtTime(0.001, at + 0.09);
			oscillator.connect(filter); filter.connect(gain); gain.connect(master);
			oscillator.start(at); oscillator.stop(at + 0.1);
			oscillator.onended = () => { oscillator.disconnect(); filter.disconnect(); gain.disconnect(); };
		}
		if (version !== broadcastVersion) { broadcastAudio.stop(); broadcastAudio = null; }
		setTimeout(() => { if (broadcastVersion === version) { broadcastAudio?.stop(); broadcastAudio = null; } }, 850);
	} catch { /* Optional audio never blocks focus controls. */ }
}
function mountBroadcast3D() {
	const card = $("#broadcastCompanion");
	if (!card || card.hidden || broadcast3DFailed || !canUse3D()) return;
	const host = card.querySelector(".broadcast-3d");
	if (!host) return;
	if (broadcast3D) card.classList.add("has-3d");
	loadBroadcast3D(new URL("./broadcast.glb?v=" + REVISION, import.meta.url).href)
		.then((partner) => {
			broadcast3D = partner;
			if (!host.isConnected) return;
			partner.attach(host);
			partner.setMood(broadcastMood);
			card.classList.add("has-3d");
			const week = isoDate(weekStart(new Date()));
			if (partnerCheer || (broadcastMood === "happy" && celebratedWeek !== week)) {
				partnerCheer = false;
				celebratedWeek = week;
				partner.react("cheer");
			}
		})
		.catch((error) => {
			broadcast3DFailed = true;
			card.classList.remove("has-3d");
			console.warn("Broadcast 3D is unavailable; using the 2D partner.", error);
		});
}
/* The speech bubble tunes in with static, then types the line at the pace of
   his voice. Screen readers get the whole line at once. */
let bubbleRun = 0;
function setBubble(text, plan = null) {
	const bubble = $("#broadcastCompanion .broadcast-dialogue");
	const sr = bubble?.querySelector(".bubble-sr"), ghost = bubble?.querySelector(".bubble-ghost"), shown = bubble?.querySelector(".bubble-text");
	if (!bubble || !sr || !ghost || !shown) return;
	const run = ++bubbleRun;
	sr.textContent = ghost.textContent = text;
	bubble.dataset.state = "tuning";
	setTimeout(() => {
		if (run === bubbleRun) bubble.dataset.state = "live";
	}, 420);
	if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
		shown.textContent = text;
		bubble.dataset.state = "live";
		return;
	}
	const total = plan ? Math.max(0.6, plan.duration) * 1000 : 700;
	const start = performance.now() + 200;
	shown.textContent = "";
	bubble.classList.add("typing");
	const step = (now) => {
		if (run !== bubbleRun || !shown.isConnected) return;
		const count = Math.max(0, Math.min(text.length, Math.round(((now - start) / total) * text.length)));
		shown.textContent = text.slice(0, count);
		if (count < text.length) requestAnimationFrame(step);
		else bubble.classList.remove("typing");
	};
	requestAnimationFrame(step);
}
/* He speaks a line: one syllable plan drives his voice, his mouth and the bubble. */
function partnerSpeak(text) {
	if (!broadcastVisible()) return;
	const plan = syllablePlan(text, broadcastMood);
	setBubble(text, plan);
	if (broadcastSoundEnabled()) speak(plan, { volume: 0.22 });
	broadcast3D?.react("talk", plan);
}
function broadcastReact(state) {
	if (state === "finish") broadcast3D?.react("cheer");
	const card = $("#broadcastCompanion");
	if (!card || card.hidden || !broadcastVisible()) return;
	const figure = card.querySelector(".broadcast-figure"), line = card.querySelector(".broadcast-dialogue");
	const copy = {
		start: [pickEventLine("start"), "broadcast-greet"],
		pause: [pickEventLine("pause") + " " + paceTail(), "broadcast-focus"],
		finish: [pickEventLine("finish") + " " + paceTail(), "broadcast-celebrate"],
		break: [pickEventLine("break"), "broadcast-celebrate"],
		flow: [pickEventLine("flow"), "broadcast-greet"],
	}[state] || [pickEventLine("start"), "broadcast-greet"];
	broadcastLine = copy[0];
	broadcastPose = copy[1];
	figure.classList.remove("broadcast-greet", "broadcast-focus", "broadcast-celebrate", "broadcast-talking", "broadcast-glitch");
	void figure.offsetWidth;
	figure.classList.add(...copy[1].split(" "), "broadcast-talking", "broadcast-glitch");
	clearTimeout(broadcastResetTimer);
	broadcastResetTimer = setTimeout(() => {
		broadcastPose = "";
		$("#broadcastCompanion .broadcast-figure")?.classList.remove("broadcast-talking", "broadcast-glitch", "broadcast-greet", "broadcast-celebrate");
	}, 1900);
	if (state === "finish") {
		const plan = syllablePlan(copy[0], "happy");
		setBubble(copy[0], plan);
		if (broadcastSoundEnabled()) speak(plan, { volume: 0.22 });
	} else partnerSpeak(copy[0]);
}
function playCue(kind) {
	if (engines.todo?.SyncEngine.get("user", "commandCentreSounds") === false)
		return;
	try {
		const Audio = window.AudioContext || window.webkitAudioContext;
		if (!Audio) return;
		interfaceAudio ||= new Audio();
		if (interfaceAudio.state === "suspended")
			interfaceAudio.resume().catch(() => {});
		const tones = { pickup: [420, 560], drop: [560, 720], saved: [660, 880] }[
			kind
		] || [440];
		tones.forEach((frequency, index) => {
			const oscillator = interfaceAudio.createOscillator(),
				gain = interfaceAudio.createGain();
			const start = interfaceAudio.currentTime + index * 0.055;
			oscillator.type = "sine";
			oscillator.frequency.value = frequency;
			gain.gain.setValueAtTime(0.001, start);
			gain.gain.linearRampToValueAtTime(0.035, start + 0.008);
			gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1);
			oscillator.connect(gain);
			gain.connect(interfaceAudio.destination);
			oscillator.start(start);
			oscillator.stop(start + 0.11);
		});
	} catch {
		/* Audio support never blocks scheduling. */
	}
}
const dateLabel = (d) =>
	d.toLocaleDateString("en-CA", {
		weekday: "long",
		month: "short",
		day: "numeric",
	});
function task(id) {
	return tasks.find((t) => t.id === id);
}
/* The task Focus is on. A session in progress keeps its task; otherwise the schedule decides
   (see focusPick): the block on now, one running over, the next block, then Must work. */
function saveChoice(id) {
	selectedId = id || null;
	selectedAt = id ? Date.now() : 0;
	engines.clock.SyncEngine.set("clock", "commandTask", { taskId: selectedId, at: selectedAt });
}
/* Seconds focused in the timer's current session (0 when it has not started). */
function sessionSeconds() {
	const w = engines.clock;
	if (!w || w.tmRemaining == null || w.tmDuration == null) return 0;
	const left = w.tmRunning ? w.tmStartRemaining - (Date.now() - w.tmStartTime) / 1000 : w.tmRemaining;
	return Math.max(0, w.tmDuration - left);
}
/* A running session, or a paused one with at least a minute in it, holds its task. */
function sessionHolds() {
	const w = engines.clock;
	return !!w && (w.tmRunning || (w.studyActive && w.studyPhase !== "focus") || sessionSeconds() >= 60);
}
function focusChoice() {
	const available = focusTasks(tasks, courses);
	const held = sessionHolds() && available.find((t) => t.id === selectedId && !t.done);
	if (held) return { task: held, reason: "session", block: blockOf(held) };
	return focusPick(available, { selection: { taskId: selectedId, at: selectedAt } });
}
function activeTask() {
	return focusChoice().task;
}
/* A timer paused within its first minute on a task the schedule has moved past is dropped,
   so a stray click never pins Focus to the wrong task. Nothing under a minute is ever billed. */
function dropStaleTimer() {
	const w = engines.clock;
	if (!w || w.tmRunning || sessionHolds() || (!w.studyActive && w.tmRemaining === w.tmDuration)) return;
	const pick = focusChoice().task;
	if (selectedId && pick && pick.id !== selectedId) resetTimer(true);
}
/* End-of-block check-in. When a booked study block ends with its task still open, a card asks
   how it went: done, more time (extends the block, through the overlap choices), partly (logs
   the real minutes, which replace the automatic entry) or not at all (removes the automatic
   entry and offers a new time). Answers live in clock/block_checkins by docket entry id. */
let checkInStage = "ask",
	checkInKey = "";
function checkIns() {
	let raw = engines.clock?.SyncEngine.get("clock", "block_checkins");
	try {
		if (typeof raw === "string") raw = JSON.parse(raw);
	} catch {
		raw = null;
	}
	return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}
function answerCheckIn(entryId, answer) {
	const all = Object.entries({ ...checkIns(), [entryId]: { answer, at: Date.now() } }).sort((a, b) => a[1].at - b[1].at).slice(-200);
	engines.clock.SyncEngine.set("clock", "block_checkins", JSON.stringify(Object.fromEntries(all)));
	checkInStage = "ask";
}
const entryIdFor = (t, b) => `plan:${t.id}:${isoDate(new Date(b[0]))}`;
function checkInDue(now = Date.now()) {
	if (!engines.clock || !engines.todo) return null;
	const answered = checkIns(), since = autoSince(), today = isoDate(new Date(now));
	return (
		focusTasks(tasks, courses)
			.map((t) => ({ t, b: blockOf(t) }))
			.filter(({ t, b }) => b && !t.done && b[1] <= now && b[0] >= since && isoDate(new Date(b[0])) === today && BILLABLE.has(taskKind(t)))
			.filter(({ t, b }) => !answered[entryIdFor(t, b)] && !(sessionHolds() && t.id === selectedId))
			.sort((x, y) => x.b[1] - y.b[1])[0] || null
	);
}
function renderCheckIn() {
	const due = accessKey ? checkInDue() : null;
	const key = due ? `${due.t.id}|${due.b.join()}|${checkInStage}` : "";
	if (key === checkInKey) return;
	checkInKey = key;
	const card = $("#checkIn");
	if (!due) {
		card.hidden = true;
		card.innerHTML = "";
		checkInStage = "ask";
		return;
	}
	const { t, b } = due, id = esc(t.id), mins = Math.round((b[1] - b[0]) / 60000);
	const body =
		checkInStage === "more"
			? `<p>Extend the block from ${clockTime(Math.max(b[1], Date.now()))} by</p><div class="checkin-actions"><button data-action="checkin-extend" data-id="${id}" data-minutes="15">15 min</button><button data-action="checkin-extend" data-id="${id}" data-minutes="30">30 min</button><button data-action="checkin-extend" data-id="${id}" data-minutes="60">1 h</button><button class="text-button" data-action="checkin-stage" data-stage="ask">Back</button></div>`
			: checkInStage === "partly"
				? `<form class="checkin-partly" data-id="${id}"><label>Minutes you worked<input type="number" name="minutes" min="3" max="${mins}" value="${Math.round(mins / 2)}" required></label><div class="checkin-actions"><button class="primary">Log and keep it open</button><button type="button" class="text-button" data-action="checkin-stage" data-stage="ask">Back</button></div></form>`
				: `<p>How did it go?</p><div class="checkin-actions"><button class="primary" data-action="checkin-done" data-id="${id}">${icon("check")} Done</button><button data-action="checkin-stage" data-stage="more">Need more time</button><button data-action="checkin-stage" data-stage="partly">Partly</button><button class="text-button" data-action="checkin-skip" data-id="${id}">Didn\u2019t get to it</button></div>`;
	card.innerHTML = `<p class="eyebrow">Block ended \u00b7 ${clockTime(b[0])}\u2013${clockTime(b[1])}</p><h3>${esc(t.text)}</h3>${body}`;
	card.hidden = false;
	decorate(card);
	card.querySelector("input")?.focus();
}
async function extendBlock(t, mins) {
	const b = blockOf(t);
	const day = isoDate(new Date(b[0]));
	const from = Math.max(b[1], Math.ceil(Date.now() / 300000) * 300000);
	const endMinute = Math.min(1439, minutes(clockTime(from)) + mins + (isoDate(new Date(from)) === day ? 0 : 1440));
	const end = timeString(endMinute);
	const ev = t.scheduleId && occurrences(localDate(day)).find((e) => e.id === t.scheduleId);
	if (ev) return applyCalendarChange(ev, "edit", { date: day, start: ev.start, end }, `Extended to ${end}.`);
	engines.todo.TodoUIBridge.command.update(t.id, { scheduledEnd: new Date(`${day}T${end}`).toISOString(), plannedMinutes: endMinute - minutes(clockTime(b[0])) });
	notify(`Extended to ${end}.`);
	return true;
}
function engineWindow(type) {
	try {
		let win = $(`#${type}Frame`).contentWindow;
		if (type === "todo")
			win = win.document.querySelector("#shell")?.contentWindow;
		if (type === "timetable")
			win = win.document.querySelector("#schedule")?.contentWindow;
		return type === "timetable"
			? win?.CommandTimetable || win
			: type === "clock"
				? win?.CommandClock || win
				: win;
	} catch {
		return null;
	}
}
function standaloneUrl(type) {
	const u = new URL(paths[type], root);
	u.searchParams.set("v", REVISION);
	u.searchParams.set("theme", theme);
	if (type === "clock") u.searchParams.set("ctx", "command-centre");
	if (type === "timetable") u.searchParams.set("mode", "command");
	u.hash = `key=${encodeURIComponent(accessKey)}`;
	return u.href;
}
function syncStatus(label, offline = false) {
	$("#syncState").classList.toggle("offline", offline);
	$("#syncState span").textContent = label;
}
function notify(text, undo = false, action = null) {
	undoAction = typeof undo === "function" ? undo : null;
	toastAction = action;
	$("#toastAction").hidden = !action;
	if (action) $("#toastAction").textContent = action.label;
	$("#toastText").textContent = text;
	$("#toast").hidden = false;
	$("#undoButton").hidden = !undo;
	$("#announcement").textContent = text;
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => ($("#toast").hidden = true), 6000);
}
function changeTheme() {
	theme = theme === "light" ? "dark" : "light";
	document.documentElement.dataset.theme = theme;
	localStorage.setItem(THEME_KEY, theme);
	$("#themeToggle").innerHTML = icon(theme === "dark" ? "sun" : "moon");
	$("#themeToggle").setAttribute(
		"aria-label",
		`Switch to ${theme === "dark" ? "light" : "dark"} theme`,
	);
	document.querySelector("meta[name=theme-color]").content =
		theme === "dark"
			? "#14111b"
			: "#faf9fd"; /* Engines remain mounted: changing theme never restarts a timer. */
}
async function authorize(value) {
	const key = String(value || "").trim();
	if (!key) throw new Error("unauthorized");
	const response = await fetch(`${WORKER}/state/user`, {
		headers: { "X-Widget-Key": key },
		cache: "no-store",
	});
	if (response.status === 401) throw new Error("unauthorized");
	if (!response.ok) throw new Error("unavailable");
	accessKey = key;
	sessionStorage.setItem(SESSION_KEY, key);
	localStorage.setItem(SESSION_KEY, key);
}
function unlock() {
	$("#lockScreen").hidden = true;
	$("#appShell").setAttribute("aria-hidden", "false");
	document.body.classList.remove("locked");
	const panel = new URLSearchParams(location.search).get("panel");
	view = panel === "clock" ? "focus" : panel === "timetable" ? "plan" : panel === "docket" ? "docket" : "today";
	Object.keys(paths).forEach((type) => {
		$(`#${type}Frame`).src = standaloneUrl(type);
	});
	clearInterval(pollTimer);
	pollTimer = setInterval(refresh, 500);
	clearTimeout(loadingTimer);
	loadingTimer = setTimeout(() => {
		if (!engines.todo || !engines.timetable || !engines.clock) {
			$("#workspace").innerHTML =
				'<div class="loading-state"><h2>A widget could not connect.</h2><p>Your saved data has not been changed.</p><button id="retryWidgets">Retry</button></div>';
			$("#retryWidgets").onclick = unlock;
			syncStatus("Connection unavailable", true);
		}
	}, 25000);
}
function lock() {
	clearInterval(pollTimer);
	pollTimer = null;
	clearTimeout(loadingTimer);
	Object.keys(paths).forEach(
		(type) => ($(`#${type}Frame`).src = "about:blank"),
	);
	engines = {};
	carryOpenTasks = null;
	setCarryTyping(false);
	tasks = [];
	courses = [];
	signature = "";
	selectedId = null;
	accessKey = "";
	sessionStorage.removeItem(SESSION_KEY);
	localStorage.removeItem(SESSION_KEY);
	$("#workspace").innerHTML =
		'<div class="loading-state"><span class="broadcast-run" aria-hidden="true"></span><span>Loading your workspace…</span></div>';
	$("#focusDock").hidden = true;
	$("#lockScreen").hidden = false;
	$("#appShell").setAttribute("aria-hidden", "true");
	document.body.classList.add("locked");
	document.querySelectorAll("dialog[open]").forEach((d) => d.close());
	$("#accessKey").value = "";
	$("#accessKey").focus();
}
function refresh() {
	if (!accessKey) return;
	for (const type of Object.keys(paths)) {
		const win = engineWindow(type);
		if (
			type === "todo" &&
			win?.TodoUIBridge?.command &&
			win?.SyncEngine?.isReady?.()
		)
			engines.todo = win;
		if (
			type === "timetable" &&
			win?.occurrencesForDate &&
			win?.SyncEngine?.isReady?.()
		)
			engines.timetable = win;
		if (
			type === "clock" &&
			win?.updateTMDisplay &&
			win?.SyncEngine?.isReady?.()
		)
			engines.clock = win;
	}
	// Older SyncEngine exposes readiness through onReady, not isReady.
	for (const type of Object.keys(paths)) {
		if (engines[type]) continue;
		const win = engineWindow(type);
		const available =
			type === "todo"
				? win?.TodoUIBridge?.command
				: type === "timetable"
					? win?.occurrencesForDate
					: win?.updateTMDisplay;
		if (available && win?.SyncEngine) {
			if (!win.__commandReadyHook) {
				win.__commandReadyHook = true;
				win.SyncEngine.onReady(() => {
					engines[type] = win;
					refresh();
				});
			}
		}
	}
	if (!engines.todo || !engines.timetable || !engines.clock) return;
	clearTimeout(loadingTimer);
	const taskRaw = engines.todo.SyncEngine.get("todo", "tasks");
	if (taskRaw !== lastTaskRaw) {
		lastTaskRaw = taskRaw;
		engines.todo.TodoUIBridge.refresh();
	}
	tasks = engines.todo.TodoUIBridge.snapshot().tasks;
	const carryCompleted = tasks.some((t) => t.done && carryOpenTasks?.has(t.id));
	carryOpenTasks = new Set(tasks.filter((t) => !t.done).map((t) => t.id));
	Reading.learn?.(tasks, engines.clock.SyncEngine.get("clock", "focus_sessions"));
	courses = engines.timetable.schedule || [];
	const raw = engines.todo.SyncEngine.get("todo", "dailyGoal");
	let setting;
	try {
		setting = typeof raw === "string" ? JSON.parse(raw) : raw;
	} catch {}
	target = setting?.date === dateKey() ? setting.count : 1;
	goal = dailyGoal(focusTasks(tasks, courses), target);
	const context = engines.clock.SyncEngine.get("clock", "commandTask");
	if (context?.taskId && isCalendarReminder(task(context.taskId), courses)) {
		selectedId = null;
		saveChoice(null);
	} else if (!selectedId && context?.taskId && task(context.taskId)) {
		selectedId = context.taskId;
		selectedAt = Number(context.at) || 0;
	}
	dropStaleTimer();
	renderCheckIn();
	const pick = focusChoice();
	const next = JSON.stringify([
		tasks,
		courses,
		raw,
		isoDate(),
		view,
		selectedId,
		pick.task?.id,
		pick.reason,
		weekOffset,
		planDays,
		[...collapsed],
		view === "docket"
			? [docketOffset, engines.clock.SyncEngine.get("clock", "focus_sessions"), engines.clock.SyncEngine.get("clock", "docket_excluded"), String(clearedRaw() || "").length, Math.floor(Date.now() / 60000), weeklyTarget()]
			: null,
	]);
	if (next !== signature) {
		if (dragActive()) renderDeferred = true;
		else {
			signature = next;
			render();
		}
	}
	if (carryCompleted) celebrateWithCarry();
	const online = ["todo", "timetable", "clock"].every((t) =>
		engines[t].SyncEngine.isOnline(),
	);
	syncStatus(online ? "Synced" : "Saved locally", !online);
	updateTimer();
	updateCalendarTime();
}
function occurrences(date) {
	return engines.timetable?.occurrencesForDate(localDate(isoDate(date))) || [];
}
const tagDot = (kind) => `<i class="kind-dot ${kind}" aria-hidden="true"></i>`;
const tagPill = (kind, auto = false, empty = "No tag") => kind ? `<span class="kind-chip ${kind}${auto ? " is-auto" : ""}" data-tag-current>${tagDot(kind)}${KIND_LABEL[kind]}${auto ? '<small>auto</small>' : ""}</span>` : `<span class="kind-chip none" data-tag-current>${empty}</span>`;
function tagPicker({ current, action, id = "", none = false, fallback = null, kinds = KINDS, reset = true }) {
	const chips = kinds.map((k) => `<button type="button" class="kind-chip ${k}" role="radio" aria-checked="${k === current}" data-action="${action}" data-kind="${k}" data-id="${esc(id)}">${tagDot(k)}${KIND_LABEL[k]}</button>`).join("");
	const clear = reset ? `<button type="button" class="kind-chip auto" role="radio" aria-checked="${!current}" data-action="${action}" data-kind="" data-id="${esc(id)}" title="${none ? "Remove the tag" : "Choose from the task wording"}">${none ? "None" : "Auto"}</button>` : "";
	return `<div class="tag-box" data-fallback="${esc(fallback || "")}" data-empty="${none ? "No tag" : "Auto"}"><div class="tag-row"><span class="tag-label">Tag</span>${tagPill(current || fallback, !current && !!fallback, none ? "No tag" : "Auto")}<button type="button" class="tag-plus" data-action="tag-toggle" aria-expanded="false" aria-label="Change tag" title="Change tag"><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M6 1.5v9M1.5 6h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></div><div class="kind-picker tag-options" role="radiogroup" aria-label="Tag" hidden>${chips}${clear}</div></div>`;
}
/* Dialogs share one element, so replace (never stack) the tag listener each time one opens. */
function onTagChange(dialog, fn) {
	if (dialog._tagHandler) dialog.removeEventListener("tagchange", dialog._tagHandler);
	dialog._tagHandler = fn;
	dialog.addEventListener("tagchange", fn);
}
/* Repaint a tag box for a kind without collapsing it (used while a form auto-detects). */
function paintTag(box, kind, fallback = box.dataset.fallback || null) {
	box.querySelectorAll(".tag-options .kind-chip").forEach((c) => c.setAttribute("aria-checked", String(!!c.dataset.kind ? c.dataset.kind === kind : !kind)));
	box.querySelector("[data-tag-current]").outerHTML = tagPill(kind || fallback || null, !kind && !!fallback, box.dataset.empty || "No tag");
}
const taskTagPicker = (t) => tagPicker({ current: isKind(t.kind) ? t.kind : null, action: "set-tag", id: t.id, none: false, fallback: taskKind(t) });
/* Timetable blocks plus tasks that have a time but no block yet. */
function dayEvents(date) {
	const real = occurrences(date);
	return [...real, ...ghostEvents(tasks, isoDate(date), real)];
}
function setView(next) {
	closeCalendarMenu();
	view = next;
	signature = "";
	render();
}
function finishLine(compact = false) {
	return `<div class="finish-line ${compact ? "compact" : ""}"><div class="goal-label"><b>Daily finish line</b><button data-action="goal" title="Adjust today’s Should target">${goal.mustDone || 0} of ${goal.mustTotal || 0} Must${goal.shouldTarget ? ` · ${Math.min(goal.shouldDone || 0, goal.shouldTarget)} of ${goal.shouldTarget} Should` : ""}</button></div><div class="progress-segments" role="progressbar" aria-label="Daily finish line" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${goal.pct || 0}"><div class="progress-track seg-must"><span style="width:${goal.mustTotal ? Math.round((goal.mustDone / goal.mustTotal) * 100) : goal.shouldTarget ? 0 : goal.pct || 0}%"></span></div>${goal.shouldTarget ? `<div class="progress-track seg-should"><span style="width:${Math.round((Math.min(goal.shouldDone, goal.shouldTarget) / goal.shouldTarget) * 100)}%"></span></div>` : ""}</div></div>`;
}
function focusMinutes(id) {
	let raw = engines.clock?.SyncEngine.get("clock", "focus_sessions");
	try {
		if (typeof raw === "string") raw = JSON.parse(raw);
	} catch {
		raw = [];
	}
	if (!Array.isArray(raw)) return 0;
	return Math.round(
		raw
			.filter((r) => r && String(r.taskId) === String(id))
			.reduce((sum, r) => sum + (Number(r.seconds) || 0), 0) / 60,
	);
}
function overdueLabel(t) {
	const key = normalizeDateKey(t.dueKey);
	if (t.done || !key || key >= isoDate()) return "";
	const days = Math.round((localDate(isoDate()) - localDate(key)) / 864e5);
	return days === 1 ? "From yesterday" : `${days} days overdue`;
}
function unfinishedToday() {
	return todayTasks(focusTasks(tasks, courses)).filter((t) => !t.done);
}
function tomorrowKey() {
	const d = new Date();
	d.setDate(d.getDate() + 1);
	return isoDate(d);
}
function gapHints(events, start, end) {
	const now = new Date(),
		nowMinute = now.getHours() * 60 + now.getMinutes();
	const from = Math.max(start, Math.ceil(nowMinute / 15) * 15);
	const open = unfinishedToday()
		.filter((t) => !t.scheduleId && !t.scheduledStart && duration(t))
		.sort((a, b) => ["must", "should", "could"].indexOf(a.pri || "must") - ["must", "should", "could"].indexOf(b.pri || "must"));
	return gaps(events, from, end)
		.filter(([s, e]) => e - s >= 20)
		.map(([s, e]) => {
			const fit = open.find((t) => duration(t) <= e - s);
			return `<div class="gap-hint" data-start="${s}" data-end="${e}" style="top:${((s - start) * 76) / 60}px;height:${((e - s) * 76) / 60}px"><span class="gap-label">${formatMinutes(e - s)} free</span>${fit ? `<button data-action="fill-gap" data-id="${esc(fit.id)}" data-start="${timeString(Math.ceil(s / 15) * 15)}" title="Schedule ${esc(fit.text)}">Fit in “${esc(fit.text.length > 28 ? fit.text.slice(0, 27) + "…" : fit.text)}”</button>` : ""}</div>`;
		})
		.join("");
}
/* The Notion page a task came from: saved on imported readings, or a Notion link pasted into the notes. */
const notionLink = (t) => {
	const url = t?.lectureUrl || String(t?.notes || "").match(/https:\/\/(?:[\w-]+\.)?notion\.(?:so|com)\/\S+/)?.[0] || "";
	return /^https:\/\//.test(url) ? url : "";
};
/* When the class for an imported reading is, and when the reading is due, so unscheduled readings still read in order. */
const shortDay = (key) => localDate(key).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
function readingWhen(t) {
	const cls = t?.lectureDate && normalizeDateKey(t.lectureDate), due = t?.dueKey && normalizeDateKey(t.dueKey);
	if (!cls) return "";
	return `Class ${shortDay(cls)}${due && due !== cls ? ` \u00b7 due ${shortDay(due)}` : ""}`;
}
function taskRow(t, planner = false) {
	const m = duration(t);
	const focusable = !isCalendarReminder(t, courses);
	return `<div class="task-row ${t.done ? "done" : ""}" data-task="${esc(t.id)}" data-ctx="task" ${!planner && !t.done ? `draggable="true" data-drag="${esc(t.id)}"` : ""}>${!t.done ? `<button class="drag-handle icon-button ${planner ? "" : "today-grip"}" title="Drag to schedule; click to choose a time" data-action="schedule" data-id="${esc(t.id)}" draggable="true" data-drag="${esc(t.id)}" aria-label="Drag ${esc(t.text)} to the calendar">${icon("grip")}</button>` : ""}<button class="check-button ${t.done ? "checked" : ""}" data-action="toggle" data-id="${esc(t.id)}" aria-label="${t.done ? "Reopen" : "Complete"} ${esc(t.text)}">${t.done ? icon("check") : ""}</button><button class="task-title ${notionLink(t) ? "has-link" : ""}" data-action="edit" data-id="${esc(t.id)}" ${notionLink(t) ? `title="Ctrl-click to open in Notion" data-notion-url="${esc(notionLink(t))}"` : ""}>${tagDot(taskKind(t))}${esc(t.text)}${notionLink(t) ? `<span class="link-mark" aria-hidden="true">${icon("link")}</span>` : ""}${planner ? `<small class="planner-task-meta"><span class="priority-chip ${t.pri || "must"}">${t.pri === "could" ? "Could" : t.pri === "should" ? "Should" : "Must"}</span>${m ? `${m} min` : "No estimate"}${t.repeatRule ? " · Repeats" : ""}${readingWhen(t) ? `<span class="class-when">${icon("calendar")}${esc(readingWhen(t))}</span>` : ""}</small>` : ""}</button>${!planner && overdueLabel(t) ? `<span class="task-meta overdue-meta">${overdueLabel(t)}</span>` : ""}${!planner && readingWhen(t) ? `<span class="task-meta class-meta" title="${esc(readingWhen(t))}">${icon("calendar")}${esc(readingWhen(t).split(" \u00b7 ")[0].replace("Class ", ""))}</span>` : ""}${!planner && m ? `<span class="task-meta" ${t.done && focusMinutes(t.id) ? `title="Estimated ${m} min, focused ${focusMinutes(t.id)} min"` : ""}>${icon("clock")}${t.done && focusMinutes(t.id) ? `${focusMinutes(t.id)} of ${m} min` : `${m} min`}</span>` : ""}${!planner && t.repeatRule ? `<span class="task-meta repeat-meta">Repeats</span>` : ""}<div class="task-actions">${focusable ? `<button class="icon-button" data-action="select-focus" data-id="${esc(t.id)}" aria-label="Focus on ${esc(t.text)}" title="Focus on this task">${icon("play")}</button>` : ""}<button class="icon-button" data-action="${planner ? "schedule" : "edit"}" data-id="${esc(t.id)}" aria-label="${planner ? "Schedule" : "Edit"} ${esc(t.text)}">${icon(planner ? "calendar" : "more")}</button></div></div>`;
}
/* Drag state lives outside render(): a background sync can re-render mid-drag, and that must neither
   lose the drag nor replace the dragged element, so renders wait until the drag ends. */
let draggingId = null,
	draggingBlock = null,
	grabY = 0,
	renderDeferred = false;
const dragActive = () => !!(draggingId || draggingBlock);
function flushDeferredRender() {
	if (!renderDeferred || dragActive()) return;
	renderDeferred = false;
	signature = "";
	refresh();
}
document.addEventListener("dragend", () => setTimeout(() => { draggingId = null; draggingBlock = null; document.body.classList.remove("is-dragging"); flushDeferredRender(); }, 0));
document.addEventListener("drop", () => setTimeout(() => document.body.classList.remove("is-dragging"), 0), true);
let quickAdd = null;
const PRI_NAME = { must: "Must Do", should: "Should Do", could: "Could Do" };
const groupEntry = (pri, text) => (/\b(must|should|could)\s+do\b/i.test(text) ? text : `${pri} do ${text}`);
function groupPreview(pri, text) {
	if (!text.trim()) return "";
	try {
		return smartSummary(engines.todo.TodoNaturalAdd.plan(groupEntry(pri, text)));
	} catch (error) {
		return error.message;
	}
}
function openGroupAdd(pri, toggle = false) {
	quickAdd = toggle && quickAdd?.pri === pri ? null : { pri, value: "" };
	collapsed.delete(pri);
	signature = "";
	render();
	document.querySelector(".group-quick input")?.focus();
}
function groupQuickForm(pri) {
	const preview = groupPreview(pri, quickAdd.value);
	return `<form class="group-quick" data-priority="${pri}"><div class="group-quick-row"><input name="task" value="${esc(quickAdd.value)}" aria-label="Add a ${PRI_NAME[pri]} task" placeholder="Add a ${PRI_NAME[pri]} task\u2026" autocomplete="off" maxlength="500"><button class="primary" aria-label="Add task">${icon("plus")}</button><button type="button" class="group-cancel" data-action="group-cancel">Cancel</button></div><p class="capture-preview group-preview" role="status" aria-live="polite" ${preview ? "" : "hidden"}>${esc(preview)}</p></form>`;
}
function taskGroups() {
	const list = todayTasks(focusTasks(tasks, courses)).sort(
		(a, b) => (a.order ?? a.created) - (b.order ?? b.created),
	);
	return ["must", "should", "could"]
		.map((pri) => {
			const group = list.filter(
				(t) =>
					(t.pri === "should" || t.pri === "could" ? t.pri : "must") === pri,
			);
			const closed = collapsed.has(pri);
			const adding = !closed && quickAdd?.pri === pri;
			return `<section class="task-group ${pri} ${!closed && !group.length && pri !== "must" && !adding ? "is-empty" : ""}"><div class="group-head" data-ctx="group" data-priority="${pri}"><button class="group-heading" data-action="collapse" data-priority="${pri}" aria-expanded="${!closed}">${icon(closed ? "right" : "chevron")}<i class="priority-dot"></i>${PRI_NAME[pri]}<span class="count">${group.filter((t) => t.done).length} of ${group.length} complete</span></button><button class="group-add" data-action="group-add" data-priority="${pri}" aria-label="Add a ${PRI_NAME[pri]} task" aria-expanded="${adding}" title="Add a ${PRI_NAME[pri]} task">${icon("plus")}</button></div>${closed ? "" : `<div class="task-rows">${group.length ? group.map((t) => taskRow(t)).join("") : adding ? "" : `<p class="group-empty">${pri === "must" ? "No commitments here." : pri === "should" ? "Choose a task worth making progress on." : "Optional tasks, when you have room."}</p>`}${adding ? groupQuickForm(pri) : ""}</div>`}</section>`;
		})
		.join("");
}
function timeRange(events) {
	return {
		start: Math.min(
			540,
			...events.map((e) => Math.floor(minutes(e.start) / 60) * 60),
		),
		end: Math.max(
			1020,
			...events.map((e) => Math.ceil(minutes(e.end) / 60) * 60),
		),
	};
}
function eventMarkup(e, start, hour = 76) {
	const height = Math.max(
			27,
			((minutes(e.end) - minutes(e.start)) * hour) / 60 - 4,
		),
		top = ((minutes(e.start) - start) * hour) / 60;
	if (e.ghost)
		return `<button data-end="${minutes(e.end)}" class="event is-task task-ghost" ${view === "plan" ? `draggable="true" data-move="1" data-unschedule="ghost"` : ""} style="top:${top}px;height:${height}px;--event-color:${e.color}" title="This task has a time but is not on the calendar yet. Click to put it there." ${notionLink(tasks.find((t) => t.id === e.taskId)) ? `data-notion-url="${esc(notionLink(tasks.find((t) => t.id === e.taskId)))}"` : ""} data-action="ghost" data-id="${esc(e.taskId)}" data-date="${esc(e.dateKey)}" data-start="${esc(e.start)}" aria-label="${esc(e.name)} ${esc(e.start)} to ${esc(e.end)}, not yet on the calendar"><b>${tasks.find((t) => t.id === e.taskId) ? tagDot(taskKind(tasks.find((t) => t.id === e.taskId))) : ""}${esc(e.name)}</b><span>${esc(e.start)} – ${esc(e.end)} · Click to add to calendar</span></button>`;
	const done = tasks.some(
		(t) =>
			t.done &&
			t.scheduleId === e.id &&
			normalizeDateKey(t.dueKey) === e.dateKey,
	);
	const linked = tasks.find((t) => t.scheduleId === e.id && normalizeDateKey(t.dueKey) === e.dateKey);
	const open = !done && !!linked && !linked.done;
	const spent = done && linked ? focusMinutes(linked.id) : 0;
	const own = courses.find((b) => b.id === e.id);
	const tint = linked ? taskKind(linked) : parseTypeTag(e.description ?? own?.description, KINDS);
	const reminder = e.eventType === "reminder" || (linked && isCalendarReminder(linked, courses));
	const canMove = view === "plan" && !done && !reminder;
	const movable = canMove && open && linked.source !== "timetable" && own?.startDate && own.startDate === own.endDate;
	return `<button data-end="${minutes(e.end)}" data-open-task="${open ? 1 : 0}" ${canMove ? `draggable="true" data-move="1"` : ""}${movable ? ` data-unschedule="block"` : ""} class="event ${linked ? "is-task" : ""} ${tint ? "tagged" : ""} ${done ? "completed" : ""} ${e.id === recentScheduleId ? "scheduled-reveal" : ""}" style="top:${top}px;height:${height}px;--event-color:${tint ? `var(--kind-${tint})` : /^#[0-9a-f]{3,8}$/i.test(e.color) ? e.color : "#9461e9"}" aria-haspopup="dialog" title="Click for details; right-click for options${linked && notionLink(linked) ? "; Ctrl-click opens Notion" : ""}" ${linked && notionLink(linked) ? `data-notion-url="${esc(notionLink(linked))}"` : ""} data-action="event" data-event-id="${esc(e.id)}" data-source="${esc(e.sourceDate)}" data-date="${esc(e.dateKey)}" aria-label="${esc(e.name)} ${esc(e.start)} to ${esc(e.end)}"><b>${linked ? tagDot(taskKind(linked)) : ""}${esc(e.name)}${linked && notionLink(linked) ? `<span class="link-mark" aria-hidden="true">${icon("link")}</span>` : ""}</b><span>${esc(e.start)} – ${esc(e.end)}${e.location ? " · " + esc(e.location) : ""}${spent ? ` · done in ${spent} min` : ""}</span>${canMove ? '<i class="event-resize" data-resize aria-hidden="true" title="Drag to change the length"></i>' : ""}</button>`;
}
function hourLines(start, end, hour = 76) {
	let s = "";
	for (let m = start; m <= end; m += 60)
		s += `<div class="hour-line" style="top:${((m - start) * hour) / 60}px"><span class="hour-label">${timeString(m)}</span></div>`;
	return s;
}
function nowLine(start, end, hour = 76, date = isoDate()) {
	return `<div class="calendar-time" data-time-date="${date}" data-time-start="${start}" data-time-end="${end}" data-time-hour="${hour}" aria-hidden="true"><div class="elapsed-time"></div><div class="now-line" hidden><i class="now-orb"></i><span class="now-badge"><i></i><b>NOW</b><time></time></span></div></div>`;
}
function updateCalendarTime() {
	const now = new Date(),
		today = isoDate(now);
	const minute =
		now.getHours() * 60 +
		now.getMinutes() +
		now.getSeconds() / 60 +
		now.getMilliseconds() / 60000;
	for (const hint of document.querySelectorAll(".gap-hint")) {
		const left = Number(hint.dataset.end) - Math.max(Number(hint.dataset.start), minute);
		hint.hidden = left < 20;
		hint.querySelector(".gap-label").textContent = `${formatMinutes(Math.floor(left))} free`;
	}
	for (const block of document.querySelectorAll(".event[data-open-task='1']")) {
		const day = block.dataset.date;
		block.classList.toggle(
			"overrun",
			day < today || (day === today && Number(block.dataset.end) < minute),
		);
	}
	for (const layer of document.querySelectorAll(".calendar-time")) {
		const current = layer.dataset.timeDate === today;
		layer.hidden = !current;
		if (!current) continue;
		const start = Number(layer.dataset.timeStart),
			end = Number(layer.dataset.timeEnd),
			hour = Number(layer.dataset.timeHour);
		const position =
			((Math.max(start, Math.min(end, minute)) - start) * hour) / 60;
		layer.style.setProperty("--now-position", `${position}px`);
		const line = layer.querySelector(".now-line");
		line.hidden = minute < start || minute > end;
		const time = line.querySelector("time");
		time.textContent = timeString(Math.floor(minute));
		time.dateTime = now.toISOString();
	}
}
function renderToday() {
	const events = dayEvents(new Date()),
		{ start, end } = timeRange(events);
	return `<div class="today-layout"><section class="surface tasks-surface" data-ctx="area" data-area="today"><div class="today-heading"><div class="today-intro">${carryMarkup()}<div><h2>Today</h2><p class="date-copy">${dateLabel(new Date())}</p></div></div>${finishLine()}</div><form class="composer" id="quickAdd"><input name="task" aria-label="Add a task" placeholder="Add a task… e.g. should do Read pp. 3–9 & 12 tomorrow" autocomplete="off" required><button class="primary" aria-label="Add task">${icon("plus")}</button><button type="button" data-action="add" aria-label="Add task with details">${icon("more")}</button></form><p id="capturePreview" class="capture-preview" role="status" aria-live="polite" hidden></p>${taskGroups()}<div class="tasks-footer"><button class="text-button" data-action="all-tasks">All tasks · ${focusTasks(tasks, courses).filter((t) => !t.done).length} open</button><span class="footer-actions"><button class="text-button" data-action="import-readings">Import readings</button><button class="text-button" data-action="wrap-up">Wrap up day</button><button class="text-button" data-action="standalone" data-type="todo">Open To-Do separately ↗</button></span></div></section><section class="surface agenda-surface"><div class="section-heading"><h2>Your day</h2><div class="heading-actions"><button class="plan-day" data-action="plan-day">${icon("calendar")}Plan my day</button><span>${new Date().toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}</span></div></div><div class="agenda-scroll"><div class="timeline" data-drop-calendar data-date="${isoDate()}" data-start="${start}" data-end="${end}" style="--timeline-height:${((end - start) * 76) / 60}px">${hourLines(start, end)}${gapHints(events, start, end)}${events.map((e) => eventMarkup(e, start)).join("")}${nowLine(start, end)}</div></div><div class="tasks-footer"><button class="text-button" data-action="view" data-view="plan">Open planner ${icon("right")}</button><button class="text-button" data-action="standalone" data-type="timetable">Timetable ↗</button></div></section></div>`;
}
function render() {
	if (!engines.todo) return;
	setCarryTyping(false);
	document.querySelectorAll(".view-tabs button").forEach((b) => {
		if (b.dataset.view === view) b.setAttribute("aria-current", "page");
		else b.removeAttribute("aria-current");
	});
	const priorScroll = $(".agenda-scroll")?.scrollTop;
	$("#workspace").innerHTML =
		view === "today"
			? renderToday()
			: view === "plan"
				? renderPlan()
				: view === "docket"
					? renderDocket()
					: renderFocus();
	$("#focusDock").hidden = view !== "today";
	renderDock();
	decorate();
	bindWorkspace();
	updateTimer();
	updateCalendarTime();
	mountBroadcast3D();
	mountCarry3D();
	const bubble = $("#broadcastCompanion .broadcast-dialogue");
	if (bubble) setTimeout(() => (bubble.dataset.state = "live"), 420);
	const agenda = $(".agenda-scroll");
	if (agenda) {
		if (priorScroll != null) agenda.scrollTop = priorScroll;
		else {
			const line = agenda.querySelector(".now-line:not([hidden])");
			if (line)
				agenda.scrollTop = Math.max(
					0,
					line.getBoundingClientRect().top - agenda.getBoundingClientRect().top + agenda.scrollTop - agenda.clientHeight * 0.35,
				);
		}
	}
}
function dockHours() {
	const week = currentWeek();
	if (!week) return "";
	return `<button class="dock-hours" data-action="view" data-view="docket" aria-label="Open weekly docket"><strong>${formatUnits(week.billable)}</strong> / ${formatUnits(week.target)} h this week</button>`;
}
function renderDock() {
	const current = activeTask(),
		next = occurrences(new Date()).find(
			(e) =>
				minutes(e.start) > new Date().getHours() * 60 + new Date().getMinutes(),
		);
	$("#focusDock").innerHTML =
		`<div class="dock-task"><button class="dock-icon" data-action="view" data-view="focus" aria-label="Open focus workspace">${icon("clock")}</button><div><b>${esc(current?.text || "Ready when you are")}</b><small>${current ? `${focusLength(current)}-minute focus block` : "Choose a task or start a timer"}</small></div></div><span class="dock-time" data-timer>45:00</span><div class="dock-controls"><button class="primary" data-action="timer" data-timer-button>${icon("play")} Start focus</button><button class="icon-button" data-action="reset-timer" aria-label="End session and save time" title="End session and save time">${icon("reset")}</button></div><div class="next-event">${icon("calendar")}<div><span>Next</span><b>${next ? `${esc(next.name)} · ${esc(next.start)}` : "No more scheduled blocks"}</b></div>${dockHours()}</div>`;
}
function bindWorkspace() {
	const calendarScroll=$(".calendar-scroll"), calendarHead=$(".calendar-head");
	if(calendarScroll && calendarHead) {
		calendarScroll.addEventListener("scroll",()=>{calendarHead.scrollLeft=calendarScroll.scrollLeft;});
		calendarHead.addEventListener("scroll",()=>{calendarScroll.scrollLeft=calendarHead.scrollLeft;});
	}
	const form = $("#quickAdd");
	if (form) {
		let pastedText = null;
		const input = form.elements.task, preview = $("#capturePreview");
		const entry = () => pastedText || input.value;
		const showPreview = () => {
			try {
				const parsed = engines.todo.TodoNaturalAdd.plan(entry());
				preview.textContent = smartSummary(parsed);
				const suggestions = parsed.filter((r) => r.suggestedStart && !r.startTime);
				const splittable = parsed.filter((r) => r.splitSuggestions?.length);
				if (suggestions.length) {
					const button = document.createElement("button");
					button.type = "button";
					button.className = "capture-schedule";
					button.textContent = suggestions.length === 1
						? `Schedule at ${suggestions[0].suggestedStart} on ${suggestions[0].suggestedDate}`
						: `Schedule ${suggestions.length} tasks at suggested times`;
					button.onclick = () => {
						try {
							engines.todo.TodoNaturalAdd.capture(entry(), { scheduleSuggestions: true });
							input.value = ""; pastedText = null; signature = ""; refresh();
							preview.textContent = "Added and scheduled at the suggested time.";
						} catch (error) { preview.textContent = error.message; }
					};
					preview.append(" ", button);
				}
				if (splittable.length === 1 && parsed.length === 1) {
					const button = document.createElement("button");
					button.type = "button";
					button.className = "capture-schedule";
					button.textContent = `Create ${splittable[0].splitSuggestions.length} page-based study sessions`;
					button.onclick = () => {
						try {
							engines.todo.TodoNaturalAdd.capture(entry(), { splitReadingSessions: true });
							input.value = ""; pastedText = null; signature = ""; refresh();
							preview.textContent = "Added as separate page-based study sessions.";
						} catch (error) { preview.textContent = error.message; }
					};
					preview.append(" ", button);
				}
			}
			catch (error) { preview.textContent = error.message; }
			preview.hidden = !preview.textContent;
		};
		input.oninput = () => { pastedText = null; showPreview(); setCarryTyping(!!input.value.trim()); };
		input.onblur = () => setCarryTyping(false);
		input.onpaste = e => {
			const text = e.clipboardData?.getData("text/plain");
			if (!text?.includes("\n")) return;
			e.preventDefault(); pastedText = text; input.value = text.replace(/\s+/g, " "); showPreview(); setCarryTyping(!!input.value.trim());
		};
		form.onsubmit = e => {
			e.preventDefault();
			setCarryTyping(false);
			try {
				engines.todo.TodoNaturalAdd.capture(entry());
				input.value = ""; pastedText = null; signature = ""; refresh(); notify("Task added.");
			} catch (error) { preview.textContent = error.message; preview.hidden = false; }
		};
	}
	const clearDrop = () =>
		document.querySelectorAll("[data-drop-calendar]").forEach((el) => {
			el.classList.remove("drop-target");
			el.querySelector(".drop-preview")?.remove();
		});
	document.querySelectorAll("[data-drag]").forEach((el) => {
		el.ondragstart = (e) => {
			e.stopPropagation();
			if (!task(el.dataset.drag) || task(el.dataset.drag).done) {
				e.preventDefault();
				return;
			}
			draggingId = el.dataset.drag;
			document.body.classList.add("is-dragging");
			e.dataTransfer.setData("text/plain", draggingId);
			e.dataTransfer.effectAllowed = "move";
			const row = el.closest(".task-row");
			const chip = document.createElement("div");
			chip.className = "drag-chip";
			chip.innerHTML = `${icon("grip")}<span>${esc(task(draggingId).text)}</span><small>${duration(task(draggingId)) ? `${duration(task(draggingId))} min` : "Task"}</small>`;
			const bounds = row.getBoundingClientRect();
			chip.style.left = `${Math.max(8, Math.min(innerWidth - 238, bounds.left))}px`;
			chip.style.top = `${Math.max(8, bounds.top)}px`;
			document.body.append(chip);
			e.dataTransfer.setDragImage(chip, 24, 22);
			setTimeout(() => chip.remove(), 0);
			row.classList.add("is-dragging");
			playCue("pickup");
		};
		el.ondragend = () => {
			draggingId = null;
			el.closest(".task-row")?.classList.remove("is-dragging");
			clearDrop();
			flushDeferredRender();
		};
	});
	const tray = document.querySelector("[data-unschedule-zone]");
	document.querySelectorAll("[data-move]").forEach((el) => {
		el.ondragstart = (e) => {
			e.stopPropagation();
			draggingBlock = el;
			document.body.classList.add("is-dragging");
			grabY = e.clientY - el.getBoundingClientRect().top;
			e.dataTransfer.setData("text/plain", "move");
			e.dataTransfer.effectAllowed = "move";
			if (el.dataset.unschedule) tray?.classList.add("unschedule-ready");
			playCue("pickup");
		};
		el.ondragend = () => {
			draggingBlock = null;
			tray?.classList.remove("unschedule-ready", "drop-target");
			flushDeferredRender();
		};
	});
	if (tray) {
		tray.ondragover = (e) => {
			if (!draggingBlock?.dataset.unschedule) return;
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
			tray.classList.add("drop-target");
		};
		tray.ondragleave = (e) => {
			if (!tray.contains(e.relatedTarget)) tray.classList.remove("drop-target");
		};
		tray.ondrop = (e) => {
			if (!draggingBlock?.dataset.unschedule) return;
			e.preventDefault();
			const el = draggingBlock;
			draggingBlock = null;
			tray.classList.remove("unschedule-ready", "drop-target");
			playCue("drop");
			unscheduleFromElement(el);
		};
	}
	document.querySelectorAll("[data-drop-calendar]").forEach((el) => {
		const dropMinute = (e) =>
			Math.max(
				Number(el.dataset.start),
				Math.min(
					Number(el.dataset.end) - 15,
					Number(el.dataset.start) +
						Math.floor(
							((e.clientY - el.getBoundingClientRect().top) / 76) * 4,
						) *
							15,
				),
			);
		const topMinute = (e) => Number(el.dataset.start) + ((e.clientY - grabY - el.getBoundingClientRect().top) / 76) * 60;
		el.ondragover = (e) => {
			if (!draggingId && !draggingBlock) return;
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
			el.classList.add("drop-target");
			let preview = el.querySelector(".drop-preview");
			if (!preview) {
				preview = document.createElement("div");
				preview.className = "drop-preview";
				el.append(preview);
			}
			const m = draggingBlock ? Math.max(Number(el.dataset.start), Math.min(Number(el.dataset.end) - 15, snap(topMinute(e)))) : dropMinute(e);
			preview.style.top = `${((m - Number(el.dataset.start)) * 76) / 60}px`;
			preview.textContent = `${draggingBlock ? "Move to" : "Schedule at"} ${timeString(m)}`;
		};
		el.ondragleave = (e) => {
			if (!el.contains(e.relatedTarget)) {
				el.classList.remove("drop-target");
				el.querySelector(".drop-preview")?.remove();
			}
		};
		el.ondrop = (e) => {
			e.preventDefault();
			if (draggingBlock) {
				const moved = draggingBlock;
				draggingBlock = null;
				tray?.classList.remove("unschedule-ready", "drop-target");
				clearDrop();
				playCue("drop");
				moveBlockTo(moved, el.dataset.date, topMinute(e), Number(el.dataset.start), Number(el.dataset.end));
				return;
			}
			const id = e.dataTransfer.getData("text/plain"),
				t = task(id);
			clearDrop();
			if (!t || t.done) return;
			playCue("drop");
			const preferred = dropMinute(e),
				date = el.dataset.date;
			const suggested = suggestSlot(
				occurrences(localDate(date)),
				preferred,
				duration(t) || 45,
				Number(el.dataset.end),
				t.scheduleId,
			);
			openSchedule(
				id,
				date,
				timeString(suggested ?? preferred),
				suggested === preferred
					? "Confirm the time and duration to add this task to your timetable."
					: suggested !== null
						? `The dropped time is busy or too short. The next space that fits starts at ${timeString(suggested)}.`
						: "There is no space that fits after this time in the displayed day. Choose another time or adjust the duration.",
			);
		};
	});
	document.querySelectorAll(".task-group").forEach((group) => {
		const pri = ["must", "should", "could"].find((p) => group.classList.contains(p));
		const rowsOf = () => [...group.querySelectorAll(".task-rows > .task-row:not(.is-dragging)")];
		const place = (e) => {
			const rows = rowsOf();
			const idx = insertionIndex(rows.map((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; }), e.clientY);
			return { rows, idx, before: rows[idx]?.dataset.task ?? null };
		};
		const clearLine = () => {
			group.classList.remove("drop-target");
			group.querySelector(".drop-line")?.remove();
		};
		group.ondragover = (e) => {
			if (!draggingId) return;
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
			group.classList.add("drop-target");
			const { rows, idx } = place(e);
			let line = group.querySelector(".drop-line");
			if (!line) {
				line = document.createElement("div");
				line.className = "drop-line";
			}
			const container = group.querySelector(".task-rows");
			if (container) container.insertBefore(line, rows[idx] || null);
			else group.append(line);
		};
		group.ondragleave = (e) => {
			if (!group.contains(e.relatedTarget)) clearLine();
		};
		group.ondrop = (e) => {
			if (!draggingId) return;
			e.preventDefault();
			const id = draggingId;
			const { rows, before } = place(e);
			clearLine();
			draggingId = null;
			const t = task(id);
			if (!t || t.done) return;
			const next = reorderIds(rows.map((r) => r.dataset.task), id, before);
			const changed = (t.pri || "must") !== pri;
			if (changed) engines.todo.TodoUIBridge.command.update(id, { pri });
			engines.todo.TodoUIBridge.reorder(next);
			playCue("drop");
			signature = "";
			refresh();
			notify(changed ? `Moved to ${PRI_NAME[pri]}.` : "Order saved.");
		};
	});
	const dock = $("#focusDock");
	if (dock) {
		dock.ondragover = (e) => {
			if (!draggingId) return;
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
			dock.classList.add("drop-target");
		};
		dock.ondragleave = (e) => {
			if (!dock.contains(e.relatedTarget)) dock.classList.remove("drop-target");
		};
		dock.ondrop = (e) => {
			if (!draggingId) return;
			e.preventDefault();
			const id = draggingId;
			draggingId = null;
			dock.classList.remove("drop-target");
			clearDrop();
			selectFocus(id);
		};
	}
}
function selectFocus(id) {
	if (!task(id) || task(id).done || isCalendarReminder(task(id), courses)) {
		notify("Choose an open task to focus on.");
		return;
	}
	const w = engines.clock;
	if (w.tmRunning || w.studyActive || w.breakInterval) {
		notify("Finish or reset the current session before switching tasks.");
		return;
	}
	selectedId = id;
	saveChoice(id);
	setView("focus");
}
function timerAction() {
	const w = engines.clock,
		current = activeTask();
	const startingFocus = !w.tmRunning && w.tmRemaining === w.tmDuration &&
		(!w.studyActive || w.studyPhase === "focus");
	if (!w.tmRunning && !w.studyActive && w.tmRemaining === w.tmDuration) {
		w.setMode?.("timer");
		w.setTimerType?.("study", true);
		if (w.stFocusEl) w.stFocusEl.value = sprintFocus(current || {});
		w.studyTaskIds = current ? [current.id] : [];
		selectedId = current?.id || null;
		saveChoice(selectedId);
	}
	w.document.getElementById("tmToggle").click();
	if (startingFocus && w.tmRunning) waveWithCarry();
	updateTimer();
}
function resetTimer(silent = false) {
	const w = engines.clock;
	if (w.studyActive) w.document.getElementById("tmEndSession").click();
	else w.document.getElementById("tmReset").click();
	updateTimer();
	if (!silent) notify("Session ended. Recorded focus time is kept.");
}
function updateTimer() {
	const w = engines.clock;
	if (!w) return;
	autoTickSprints();
	const breaking = w.studyActive && !w.studyPending && w.studyPhase !== "focus";
	const remaining = breaking
		? w.breakRemaining
		: w.tmRunning
			? Math.max(0, w.tmStartRemaining - (Date.now() - w.tmStartTime) / 1000)
			: w.tmRemaining;
	const current = activeTask();
	const fresh =
		!w.studyActive && !w.tmRunning && w.tmRemaining === w.tmDuration;
	const seconds = Math.ceil(fresh ? sprintFocus(current || {}) * 60 : remaining);
	const text = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
	document
		.querySelectorAll("[data-timer]")
		.forEach((n) => (n.textContent = text));
	const running = w.tmRunning || breaking;
	let label = running
		? "Pause"
		: w.studyPending && w.studyPhase !== "focus"
			? "Start break"
			: !fresh
				? "Resume"
				: "Start focus";
	document.querySelectorAll("[data-timer-button]").forEach((n) => {
		n.innerHTML = icon(running ? "pause" : "play") + " " + label;
		n.disabled = breaking;
	});
	document
		.querySelectorAll("[data-phase]")
		.forEach(
			(n) =>
				(n.textContent =
					w.studyPending && w.studyPhase !== "focus"
						? "Break ready"
						: breaking
							? "Taking a break"
							: w.tmRunning
								? "Focusing"
								: fresh
									? "Ready to focus"
									: "Paused"),
		);
	const ring = $("[data-timer-ring]");
	if (ring) {
		const total = breaking
			? w.breakPhaseDuration
			: fresh
				? sprintFocus(current || {}) * 60
				: w.tmDuration;
		ring.style.strokeDashoffset = String(
			691.15 * (1 - Math.max(0, Math.min(1, seconds / total))),
		);
	}
	const finish = $("[data-finish]");
	if (finish) finish.disabled = !current || current.done;
	{
		const away = view === "docket" && w.tmRunning && !breaking;
		const card = document.querySelector("#broadcastCompanion");
		if (card) {
			card.classList.toggle("is-away", away);
			if (away) {
				const week = currentWeek();
				const line = card.querySelector(".broadcast-away");
				const text = week ? "On the clock. " + formatUnits(week.billable) + " of " + formatUnits(week.target) + " billable hours this week." : "On the clock.";
				if (line && line.textContent !== text) line.textContent = text;
			}
		}
	}
	if (view === "focus") {
		const currentKey = `${w.studyActive}:${w.studyPhase}:${w.studyPending}`;
		if (currentKey !== lastFocus) {
			const previous = lastFocus;
			lastFocus = currentKey;
			const actions = $("#breakActions");
			if (actions)
				actions.hidden = !(
					w.studyActive &&
					w.studyPending &&
					w.studyPhase !== "focus"
				);
			if (previous && w.studyActive && w.studyPhase !== "focus") broadcastReact("break");
		}
	}
}
function openDialog(id, html) {
	const d = $(id);
	d.innerHTML = html;
	decorate(d);
	d.showModal();
	return d;
}
const dialogHead = (title, id) =>
	`<div class="dialog-heading"><h2 id="${id}">${title}</h2><button type="button" class="icon-button" data-action="close-dialog" aria-label="Close">${icon("close")}</button></div>`;
function smartSummary(parsed, reading = {}) {
	return parsed.map(r => {
		const estimate = Reading.estimate(r.text, reading);
		const labels = r.labels.map(label => label === r.priority ? `${label[0].toUpperCase()}${label.slice(1)} Do` : label);
		if (estimate?.pages) {
			if (!labels.includes(`${estimate.pages} pages`)) labels.push(`${estimate.pages} pages`);
			if (!r.duration) labels.push(`${estimate.minutes} min estimate`);
		}
		return labels.length ? "Smart · " + labels.join(" · ") : "";
	}).filter(Boolean).join(" | ");
}
function parseNewTask(text) {
	const parsed = engines.todo.TodoNaturalAdd.plan(text);
	if (parsed.length !== 1) throw Error("Use quick add to enter multiple tasks.");
	if (parsed[0].conflict) throw Error(`This time conflicts with ${parsed[0].conflict}. Choose another time.`);
	return parsed[0];
}
function openEditor(id, draft = "") {
	const t = task(id),
		/* An imported "Type: study" line in the notes is the same tag; show it as one. */
		noteKind = t ? (isKind(t.kind) ? t.kind : parseTypeTag(t.notes, KINDS)) : null,
		noteText = stripTypeTag(t?.notes || ""),
		d = openDialog(
			"#editorDialog",
			`${dialogHead(t ? "Edit task" : "New task", "editorTitle")}<form id="taskForm"><div class="form-grid"><label class="field wide task-name">Task<input name="text" value="${esc(t?.text || draft)}" required maxlength="500" placeholder="What would you like to do?"></label><label class="field">Priority<select name="pri">${["must", "should", "could"].map((p) => `<option value="${p}" ${p === (t?.pri || "must") ? "selected" : ""}>${p === "must" ? "Must Do" : p === "should" ? "Should Do" : "Could Do"}</option>`).join("")}</select></label><label class="field">Date<input name="dueKey" type="date" value="${esc(normalizeDateKey(t?.dueKey) || isoDate())}"></label><div class="field wide tag-field">${tagPicker({ current: noteKind, action: "tag-pick", fallback: t ? taskKind({ text: t.text }) : null, kinds: KINDS.filter((k) => k !== "class") })}<input type="hidden" name="kind" value="${esc(noteKind || "")}"></div><label class="field wide duration-field">Time <span>minutes</span><input type="number" name="plannedMinutes" min="1" value="${duration(t || {}) || ""}" placeholder="Optional"></label><div class="wide">${Reading.html(t || {})}</div><details class="task-extra wide" ${noteText || t?.subs?.length ? 'open' : ''}><summary>Notes & session steps</summary>${notionLink(t) ? `<a class="notion-chip" href="${esc(notionLink(t))}" target="_blank" rel="noopener">${icon("link")}<span>${esc(String(t.notes || "").match(/^From Notion: (.+)$/m)?.[1] || "Lecture notes")}</span><small>Open in Notion</small></a>` : ""}<div class="form-grid"><label class="field wide">Notes<textarea name="notes" rows="2" placeholder="Add a note…">${esc(noteText)}</textarea></label><label class="field wide">Session steps<textarea name="steps" rows="2" placeholder="One step per line">${esc((t?.subs || []).map((s) => s.text).join("\n"))}</textarea></label></div></details></div><p class="form-error" id="formError" role="alert"></p><div class="dialog-actions">${t ? `<button type="button" class="delete" data-action="delete" data-id="${esc(id)}">Delete</button><button type="button" data-action="schedule" data-id="${esc(id)}">Schedule</button><button type="button" data-action="split-task" data-id="${esc(id)}">Split</button>` : ""}<button type="submit" class="primary">${t ? "Save" : "Add task"}</button></div></form>`,
		);
	onTagChange(d, (e) => { d.querySelector("[name=kind]").value = e.detail.kind || ""; });
	const readingData = Reading.mount(d, t || {}, { title: d.querySelector("[name=text]"), duration: d.querySelector("[name=plannedMinutes]"), split: steps => { const el=d.querySelector("[name=steps]"); const existing=el.value.split("\n"); el.value=[...existing.filter(Boolean),...steps.filter(s=>!existing.includes(s))].join("\n"); el.closest("details").open=true; } });
	const manualFields = new Set(), fields = d.querySelector("form").elements;
	let automatic = false;
	if (!t) {
		const preview = document.createElement("p"); preview.className = "capture-preview editor-smart-preview";
		preview.setAttribute("role", "status"); preview.setAttribute("aria-live", "polite");
		d.querySelector(".task-name").append(preview);
		const infer = () => {
			try {
				if (!fields.text.value.trim()) { preview.textContent = ""; return; }
				let parsed = parseNewTask(fields.text.value);
				if (parsed.classAnchor && manualFields.size) {
					const source = parsed.durationSource, estimate = Reading.estimate(parsed.text, readingData());
					const parts = [parsed.text, manualFields.has("pri") ? fields.pri.value : parsed.priority, `after ${parsed.classAnchor.name}`, manualFields.has("dueKey") ? fields.dueKey.value : parsed.dateKey];
					const minutes = manualFields.has("plannedMinutes") ? fields.plannedMinutes.value : parsed.duration || estimate?.minutes;
					if (minutes) parts.push(`for ${minutes} min`);
					parsed = parseNewTask(parts.filter(Boolean).join(" "));
					parsed.durationSource = manualFields.has("plannedMinutes") ? "explicit" : source;
				}
				const estimate = Reading.estimate(parsed.text, readingData());
				if (!manualFields.has("pri")) fields.pri.value = parsed.priority || "must";
				if (!manualFields.has("dueKey")) fields.dueKey.value = parsed.dateKey || isoDate();
				if (!manualFields.has("plannedMinutes")) {
					fields.plannedMinutes.value = parsed.durationSource === "explicit" ? parsed.duration : estimate?.minutes || parsed.duration || "";
					if (parsed.durationSource === "explicit") {
						automatic = true; fields.plannedMinutes.dispatchEvent(new Event("input", { bubbles: true })); automatic = false;
					}
				}
				preview.textContent = smartSummary([parsed], readingData());
			} catch (error) { preview.textContent = error.message; }
		};
		for (const name of ["pri", "dueKey", "plannedMinutes"]) fields[name].addEventListener("input", () => { if (!automatic) { manualFields.add(name); infer(); } });
		fields.text.addEventListener("input", infer); infer();
	}
	$("#taskForm").onsubmit = (e) => {
		e.preventDefault();
		try {
		const f = new FormData(e.target),
			key = f.get("dueKey"),
			patch = {
				text: f.get("text").trim(),
				pri: f.get("pri"),
				plannedMinutes: Number(f.get("plannedMinutes")) || null,
				reading: readingData(),
				time: null,
				dueKey: key || null,
				due: key === isoDate() ? "today" : null,
				notes: f.get("notes"),
				kind: isKind(f.get("kind")) ? f.get("kind") : null,
			};
		if (t) {
			patch.subs = String(f.get("steps"))
				.split("\n")
				.map((s) => s.trim())
				.filter(Boolean)
				.map((text) => {
					const old = (t.subs || []).find((s) => s.text === text);
					return old || { id: crypto.randomUUID(), text, done: false };
				});
			engines.todo.TodoUIBridge.command.update(id, patch);
		} else {
			const parsed = parseNewTask(patch.text);
			if (parsed.emptyText) throw Error("Add a task after the priority or date.");
			patch.text = parsed.text;
			patch.reading.manual = manualFields.has("plannedMinutes") || parsed.durationSource === "explicit" || patch.reading.manual && !parsed.durationDefault && parsed.durationSource !== "reading" && !patch.reading.autoMinutes;
			const entry = [parsed.text, patch.pri, parsed.classAnchor ? `after ${parsed.classAnchor.name}` : "", key,
				parsed.classAnchor ? "" : parsed.startTime ? `at ${parsed.startTime}` : parsed.dueTime ? `by ${parsed.dueTime}` : "",
				(parsed.duration || manualFields.has("plannedMinutes")) && patch.plannedMinutes ? `for ${patch.plannedMinutes} min` : "",
				parsed.dependency ? `after ${parsed.dependency.text}` : "",
			].filter(Boolean).join(" ");
			const [newId] = engines.todo.TodoNaturalAdd.capture(entry);
			if (!newId) throw Error("Task could not be added. Your text is kept here.");
			patch.subs = String(f.get("steps")).split("\n").map(s => s.trim()).filter(Boolean).map(text => ({ id: crypto.randomUUID(), text, done: false }));
			engines.todo.TodoUIBridge.command.update(newId, patch);
		}
		d.close();
		signature = "";
		refresh();
		notify(t ? "Task updated." : "Task added.");
		} catch (error) { $("#formError").textContent = error.message; }
	};
}
function planInputs(day) {
	const date = day === "tomorrow" ? tomorrowKey() : isoDate();
	const pool = focusTasks(tasks, courses).filter((t) => {
		if (!isUnscheduled(t)) return false;
		if (day === "tomorrow") return normalizeDateKey(t.dueKey) === date || t.due === "tomorrow";
		return todayTasks([t]).length > 0;
	});
	const now = new Date();
	const events = occurrences(localDate(date));
	return { date, events, plan: planDay({ tasks: pool, events, today: isoDate(), nowMinute: day === "today" ? now.getHours() * 60 + now.getMinutes() : 0 }), pool };
}
async function scheduleBatch(items, date) {
	await engines.timetable.SyncEngine.pull("timetable");
	await engines.todo.SyncEngine.pull("todo");
	engines.todo.TodoUIBridge.refresh();
	let blocks = engines.timetable.SyncEngine.get("timetable", "courses") || [];
	if (typeof blocks === "string") blocks = JSON.parse(blocks);
	engines.timetable.schedule = blocks;
	const fresh = engines.todo.TodoUIBridge.snapshot().tasks;
	const created = [], prior = [], applied = [];
	for (const item of items) {
		const t = fresh.find((x) => x.id === item.id);
		if (!t || !isUnscheduled(t)) continue;
		const end = minutes(item.start) + item.minutes;
		try {
			validateSlot(occurrences(localDate(date)), minutes(item.start), end);
		} catch {
			continue;
		}
		const block = {
			id: crypto.randomUUID(),
			name: t.text,
			description: "One-off timebox",
			location: "",
			color: "#9461e9",
			category: "personal",
			trackCompletion: false,
			startDate: date,
			endDate: date,
			days: [{ day: localDate(date).getDay(), start: item.start, end: timeString(end), location: "" }],
			overrides: [],
		};
		blocks.push(block);
		created.push(block.id);
		prior.push({ id: t.id, patch: { scheduledStart: t.scheduledStart ?? null, scheduledEnd: t.scheduledEnd ?? null, dueKey: t.dueKey ?? null, due: t.due ?? null, scheduleId: t.scheduleId ?? null, timeboxed: t.timeboxed ?? null, plannedMinutes: t.plannedMinutes ?? null } });
		const patch = {
			scheduledStart: new Date(date + "T" + item.start).toISOString(),
			scheduledEnd: new Date(date + "T" + timeString(end)).toISOString(),
			dueKey: date,
			due: date === isoDate() ? "today" : null,
			scheduleId: block.id,
			timeboxed: true,
			plannedMinutes: item.minutes,
		};
		engines.todo.TodoUIBridge.command.update(t.id, patch);
		applied.push({ id: t.id, patch });
	}
	if (!created.length) throw new Error("Those times were taken while you were looking. Try again.");
	engines.timetable.saveBlocks(blocks);
	engines.todo.TodoUIBridge.refresh();
	const saved = engines.todo.TodoUIBridge.snapshot().tasks;
	for (const p of applied) if (!saved.find((x) => x.id === p.id)?.scheduleId) engines.todo.TodoUIBridge.command.update(p.id, p.patch);
	const undo = async () => {
		await engines.timetable.SyncEngine.pull("timetable");
		let current = engines.timetable.SyncEngine.get("timetable", "courses") || [];
		if (typeof current === "string") current = JSON.parse(current);
		engines.timetable.schedule = current.filter((b) => !created.includes(b.id));
		engines.timetable.saveBlocks(engines.timetable.schedule);
		for (const p of prior) engines.todo.TodoUIBridge.command.update(p.id, p.patch);
		signature = "";
		refresh();
		$("#toast").hidden = true;
	};
	return { done: created.length, undo };
}
function openPlanDay(day) {
	const nowMinute = new Date().getHours() * 60 + new Date().getMinutes();
	day = day || (PLAN_END - nowMinute >= 30 ? "today" : "tomorrow");
	const { date, plan, events, pool } = planInputs(day);
	$("#editorDialog").open && $("#editorDialog").close();
	const lo = Math.min(PLAN_START, ...events.map((e) => Math.floor(minutes(e.start) / 60) * 60)), span = PLAN_END - lo;
	const seg = (a, b, cls, label) => '<i class="' + cls + '" style="left:' + ((a - lo) / span) * 100 + "%;width:" + ((b - a) / span) * 100 + '%" title="' + esc(label) + '"></i>';
	const strip = events.map((e) => seg(minutes(e.start), minutes(e.end), "busy", e.name)).join("") + plan.placed.map((p) => seg(minutes(p.start), minutes(p.end), "plan", p.text)).join("");
	const ticks = [];
	for (let m = Math.ceil(lo / 180) * 180; m <= PLAN_END; m += 180) ticks.push('<span style="left:' + ((m - lo) / span) * 100 + '%">' + timeString(m) + "</span>");
	const summary = plan.placed.length
		? plan.placed.length + (plan.placed.length === 1 ? " task fits" : " tasks fit") + " into the open time. Nothing is placed until you confirm."
		: pool.length ? "Nothing fits in the time that is left." : "Nothing is waiting to be scheduled.";
	const rows = plan.placed.map((p) => '<label class="plan-row"><input type="checkbox" name="pick" value="' + esc(p.id) + '" checked><span class="plan-time">' + p.start + " – " + p.end + '</span><span class="plan-title">' + esc(p.text) + '<small><span class="priority-chip ' + p.pri + '">' + (p.pri === "could" ? "Could" : p.pri === "should" ? "Should" : "Must") + "</span>" + p.minutes + " min" + (p.estimated ? " · estimated" : "") + "</small></span></label>").join("");
	const left = plan.unplaced.length ? '<div class="plan-unplaced"><b>Does not fit</b>' + plan.unplaced.map((u) => "<p>" + esc(u.text) + "<small>" + esc(u.reason) + "</small></p>").join("") + "</div>" : "";
	const d = openDialog("#editorDialog", dialogHead("Plan your day", "editorTitle") + '<div class="plan-tabs" role="group" aria-label="Day"><button type="button" data-plan-day="today" aria-pressed="' + (day === "today") + '">Today</button><button type="button" data-plan-day="tomorrow" aria-pressed="' + (day === "tomorrow") + '">Tomorrow</button></div><p class="muted">' + summary + '</p><div class="plan-strip" aria-hidden="true">' + strip + '</div><div class="plan-ticks" aria-hidden="true">' + ticks.join("") + '</div><form id="planForm">' + rows + left + '<p class="form-error" id="planError" role="alert"></p><div class="dialog-actions"><button type="button" data-action="close-dialog">Cancel</button>' + (plan.placed.length ? '<button type="submit" class="primary" id="planConfirm"></button>' : "") + "</div></form>");
	const form = $("#planForm"), confirm = $("#planConfirm");
	const count = () => {
		const n = form.querySelectorAll("input[name=pick]:checked").length;
		if (confirm) {
			confirm.textContent = n === 1 ? "Schedule 1 task" : "Schedule " + n + " tasks";
			confirm.disabled = !n;
		}
	};
	form.addEventListener("change", count);
	count();
	d.querySelectorAll("[data-plan-day]").forEach((b) => (b.onclick = () => openPlanDay(b.dataset.planDay)));
	form.onsubmit = async (e) => {
		e.preventDefault();
		const picked = [...form.querySelectorAll("input[name=pick]:checked")].map((i) => i.value);
		confirm.disabled = true;
		try {
			const result = await scheduleBatch(plan.placed.filter((p) => picked.includes(p.id)), date);
			d.close();
			signature = "";
			refresh();
			notify("Scheduled " + result.done + (result.done === 1 ? " task." : " tasks."), result.undo);
			playCue("saved");
		} catch (error) {
			$("#planError").textContent = error.message;
			confirm.disabled = false;
		}
	};
}
function endSessionFlow() {
	const w = engines.clock;
	const current = activeTask();
	const running = w.tmRunning || w.studyActive || w.tmRemaining !== w.tmDuration;
	if (!running) {
		notify("Start a focus session first.");
		return;
	}
	if (!current) {
		resetTimer();
		return;
	}
	const before = focusMinutes(current.id);
	resetTimer(true);
	setTimeout(() => openSessionWrap({ task: current, recorded: Math.max(0, focusMinutes(current.id) - before) }), 250);
}
/* Finishing or splitting a task while its booking is live: the block ends when you stopped, not when it
   was planned to, so the calendar and the hours match what you did. Returns { end, undo }, or null when
   there is nothing to trim (no block, not live, or it would not get shorter). */
async function trimLiveBlock(t) {
	const block = blockOf(t), now = Date.now();
	if (!block || !t.scheduleId || !(block[0] <= now && now < block[1])) return null;
	const end = Math.max(Math.ceil(now / 300000) * 300000, block[0] + 15 * 60000);
	if (end >= block[1]) return null;
	const dateKey = isoDate(new Date(block[0]));
	const ev = occurrences(localDate(dateKey)).find((e) => e.id === t.scheduleId);
	if (!ev || calendarBusy) return null;
	const stop = new Date(end), endText = timeString(stop.getHours() * 60 + stop.getMinutes());
	calendarBusy = true;
	try {
		const before = await pullCalendarState();
		engines.timetable.schedule = engines.timetable.normaliseBlocks(before.blocks);
		saveCalendarState(changeCalendar(before.blocks, before.tasks, ev, "edit", { date: dateKey, start: ev.start, end: endText }));
		return {
			end: endText,
			/* Put the booking back as it was, whatever else has changed since. */
			undo: async () => {
				const now = await pullCalendarState();
				saveCalendarState(changeCalendar(now.blocks, now.tasks, ev, "edit", { date: dateKey, start: ev.start, end: ev.end }));
			},
		};
	} catch {
		return null;
	} finally {
		calendarBusy = false;
	}
}
function openSessionWrap({ task: t, recorded = 0, mode = "session" }) {
	if (!t) return;
	$("#editorDialog").open && $("#editorDialog").close();
	const bridge = engines.todo.TodoUIBridge;
	const reading = Reading.estimate(t.text, t.reading || {});
	const pageSplit = !!reading && Number.isInteger(reading.start) && Number.isInteger(reading.end) && reading.end > reading.start;
	const focused = focusMinutes(t.id), planned = duration(t) || 0;
	let choice = mode === "split" ? "split" : "open";
	const lead = mode === "split" ? "" : recorded > 0
		? '<div class="wrap-lead"><b>' + formatUnits(recorded / 60) + ' h</b><span>' + recorded + " min recorded on " + esc(t.text) + ". It counts towards your week.</span></div>"
		: '<p class="muted">Nothing was recorded. Sessions under a minute do not count. Use Log time to add it by hand.</p>';
	const cards = [
		["open", "Keep it open", "Come back to this task later."],
		["done", "Mark it complete", "You finished it."],
		["split", "Split off the rest", pageSplit ? "The pages you read are done. The rest becomes a new task." : "What you did is done. The rest becomes a new task."],
	].map(([k, title, sub]) => '<button type="button" role="radio" class="wrap-choice" data-choice="' + k + '"><b>' + title + "</b><small>" + sub + "</small></button>").join("");
	const panel = pageSplit
		? '<label class="field">Last page you read<input name="last" type="number" min="' + reading.start + '" max="' + (reading.end - 1) + '" value="' + (sprintLastPage(t, reading) ?? suggestLastPage({ start: reading.start, end: reading.end, plannedMinutes: planned, focusedMinutes: focused })) + '"></label>'
		: '<label class="field">Time left, in minutes<input name="rest" type="number" min="5" step="5" value="' + defaultRemaining({ plannedMinutes: planned, focusedMinutes: focused }) + '"></label>';
	const d = openDialog("#editorDialog", dialogHead(mode === "split" ? "Split task" : "Session saved", "editorTitle") + lead + '<form id="wrapForm"><div class="wrap-choices" role="radiogroup" aria-label="What happens to the task">' + cards + '</div><div class="split-panel" hidden>' + panel + '<div class="split-preview" aria-live="polite"></div></div><p class="form-error" id="wrapError" role="alert"></p><div class="dialog-actions">' + (mode === "split" ? '<button type="button" data-action="close-dialog">Cancel</button>' : "") + '<button type="submit" class="primary" id="wrapConfirm"></button></div></form>');
	const form = $("#wrapForm"), f = form.elements, panelEl = d.querySelector(".split-panel"), preview = d.querySelector(".split-preview");
	const compute = () => pageSplit
		? planPageSplit({ text: t.text, plannedMinutes: planned, focusedMinutes: focused, start: reading.start, end: reading.end, lastPage: Number(f.last.value) })
		: planTimeSplit({ text: t.text, plannedMinutes: planned, focusedMinutes: focused, remainingMinutes: Number(f.rest.value) });
	const paint = () => {
		d.querySelectorAll("[data-choice]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.choice === choice)));
		panelEl.hidden = choice !== "split";
		$("#wrapConfirm").textContent = choice === "done" ? "Mark complete" : choice === "split" ? "Split task" : "Done";
		$("#wrapError").textContent = "";
		if (choice === "split") {
			try {
				const plan = compute();
				preview.innerHTML = '<div><span>Done</span><b>' + esc(plan.doneText) + "</b><small>" + plan.doneMinutes + ' min</small></div><div><span>Next</span><b>' + esc(plan.restText) + "</b><small>" + plan.restMinutes + " min</small></div>";
			} catch (error) {
				preview.innerHTML = '<p class="muted">' + esc(error.message) + "</p>";
			}
		}
	};
	d.querySelectorAll("[data-choice]").forEach((b) => (b.onclick = () => { choice = b.dataset.choice; paint(); }));
	form.addEventListener("input", paint);
	paint();
	form.onsubmit = async (e) => {
		e.preventDefault();
		try {
			const before = { text: t.text, plannedMinutes: t.plannedMinutes ?? null, reading: t.reading ?? null, done: !!t.done, selected: selectedId };
			let newId = null, trimmed = null, message = "Saved. The task stays open.";
			if (choice === "done") {
				trimmed = await trimLiveBlock(t);
				if (!t.done) bridge.command.toggle(t.id);
				selectedId = null;
				saveChoice(null);
				message = "Task completed." + (trimmed ? ` Its block now ends at ${trimmed.end}.` : "");
			} else if (choice === "split") {
				const plan = compute();
				trimmed = await trimLiveBlock(t);
				bridge.command.update(t.id, { text: plan.doneText, plannedMinutes: plan.doneMinutes, reading: null });
				if (!t.done) bridge.command.toggle(t.id);
				newId = bridge.command.add({ text: plan.restText, pri: t.pri || "must", plannedMinutes: plan.restMinutes, due: t.due ?? "today", dueKey: t.dueKey ?? isoDate(), notes: t.notes || "", reading: null, lectureId: t.lectureId, lectureUrl: t.lectureUrl, lectureDate: t.lectureDate });
				if (newId && isKind(t.kind)) bridge.command.update(newId, { kind: t.kind });
				selectedId = newId || null;
				saveChoice(selectedId);
				message = "Split. The rest is a new task." + (trimmed ? ` Its block now ends at ${trimmed.end}.` : "");
			}
			d.close();
			signature = "";
			refresh();
			if (choice === "open" && mode !== "split") return notify(message);
			notify(message, async () => {
				if (newId) bridge.command.remove(newId);
				bridge.command.update(t.id, { text: before.text, plannedMinutes: before.plannedMinutes, reading: before.reading });
				const now = bridge.snapshot().tasks.find((x) => x.id === t.id);
				if (now && !!now.done !== before.done) bridge.command.toggle(t.id);
				if (trimmed) await trimmed.undo().catch(() => {});
				selectedId = before.selected;
				saveChoice(selectedId);
				signature = "";
				refresh();
				$("#toast").hidden = true;
			});
		} catch (error) {
			$("#wrapError").textContent = error.message;
		}
	};
}
/* Implementation intention: decide when and on what tomorrow starts. */
function openFirstBlock() {
	const date = tomorrowKey();
	const options = focusTasks(tasks, courses).filter((t) => isUnscheduled(t) && (todayTasks([t]).length || normalizeDateKey(t.dueKey) === date));
	$("#editorDialog").open && $("#editorDialog").close();
	if (!options.length) {
		notify("Nothing is waiting to be booked. Add a task for tomorrow first.");
		return;
	}
	const events = occurrences(localDate(date)).slice().sort((a, b) => minutes(a.start) - minutes(b.start));
	const anchors = events.filter((e) => minutes(e.end) >= 8 * 60 && minutes(e.end) <= 20 * 60);
	const first = options[0];
	const suggest = (t, from = 9 * 60) => suggestSlot(events, from, duration(t) || 60, 21 * 60) ?? from;
	const d = openDialog("#editorDialog", dialogHead("Tomorrow's first block", "editorTitle") + '<p class="muted">An if-then plan works best: tie the start to something that already happens tomorrow. Broadcast will remind you of it in the morning.</p><form id="firstForm" class="form-grid"><label class="field wide">Task<select name="task">' + options.map((t) => '<option value="' + esc(t.id) + '">' + esc(t.text) + "</option>").join("") + '</select></label><label class="field wide">When<select name="anchor"><option value="">At a set time</option>' + anchors.map((e, i) => '<option value="' + i + '"' + (i === 0 ? " selected" : "") + ">After " + esc(e.name) + " ends (" + e.end + ")</option>").join("") + '</select></label><label class="field">Start<input type="time" name="start" value="' + timeString(suggest(first)) + '"></label><label class="field">Minutes<input type="number" name="minutes" min="5" step="any" value="' + (duration(first) || 60) + '"></label><p class="plan-sentence wide" id="planSentence"></p><p class="form-error wide" id="firstError" role="alert"></p><div class="dialog-actions wide"><button type="button" data-action="close-dialog">Cancel</button><button type="submit" class="primary">Book it</button></div></form>');
	const f = $("#firstForm").elements;
	const sentence = () => {
		const t = options.find((x) => x.id === f.task.value);
		const anchor = anchors[Number(f.anchor.value)];
		return (f.anchor.value !== "" && anchor ? "after " + anchor.name + " ends at " + anchor.end : "at " + f.start.value) + ", start " + (t?.text || "");
	};
	const sync = (fromAnchor) => {
		const t = options.find((x) => x.id === f.task.value);
		const anchor = anchors[Number(f.anchor.value)];
		if (fromAnchor) f.start.value = timeString(suggest(t, f.anchor.value !== "" && anchor ? minutes(anchor.end) : 9 * 60));
		const text = sentence();
		$("#planSentence").innerHTML = "<b>Your plan:</b> " + esc(text.charAt(0).toUpperCase() + text.slice(1)) + ".";
	};
	f.task.onchange = () => {
		f.minutes.value = duration(options.find((x) => x.id === f.task.value)) || 60;
		sync(true);
	};
	f.anchor.onchange = () => sync(true);
	f.start.oninput = () => sync(false);
	sync(true);
	$("#firstForm").onsubmit = async (e) => {
		e.preventDefault();
		try {
			const result = await scheduleBatch([{ id: f.task.value, start: f.start.value, minutes: Number(f.minutes.value) || 60 }], date);
			engines.todo.SyncEngine.set("user", "partnerPlan", JSON.stringify({ date, taskId: f.task.value, text: sentence() }));
			d.close();
			signature = "";
			refresh();
			notify("Booked. Tomorrow starts at " + f.start.value + ".", result.undo);
		} catch (error) {
			$("#firstError").textContent = error.message;
		}
	};
}
function openWrapUp() {
	const open = unfinishedToday();
	const movable = open.filter((t) => !t.scheduleId);
	const kept = open.length - movable.length;
	const d = openDialog(
		"#settingsDialog",
		`${dialogHead("Wrap up day", "settingsTitle")}${
			open.length
				? `<p class="muted">${open.length} unfinished ${open.length === 1 ? "task" : "tasks"} today. Choose what carries over to tomorrow.</p><div class="wrap-list">${movable.map((t) => `<label class="wrap-item"><input type="checkbox" name="move" value="${esc(t.id)}" checked><span>${esc(t.text)}</span><small class="priority-chip ${t.pri || "must"}">${t.pri === "could" ? "Could" : t.pri === "should" ? "Should" : "Must"}</small></label>`).join("")}</div>${kept ? `<p class="muted">${kept} scheduled ${kept === 1 ? "task stays" : "tasks stay"} on the calendar. Reschedule ${kept === 1 ? "it" : "them"} from Plan.</p>` : ""}<div class="dialog-actions"><button type="button" data-action="close-dialog">Not yet</button><button type="button" data-action="book-first">Book tomorrow’s first block</button>${movable.length ? `<button type="button" class="primary" id="wrapConfirm">Move to tomorrow</button>` : ""}</div>`
				: `<p class="muted">Everything planned for today is complete. Nicely done.</p><div class="dialog-actions"><button type="button" class="primary" data-action="close-dialog">Close</button></div>`
		}`,
	);
	const confirm = $("#wrapConfirm");
	if (confirm)
		confirm.onclick = () => {
			const ids = [...d.querySelectorAll("input[name=move]:checked")].map((i) => i.value);
			for (const id of ids)
				engines.todo.TodoUIBridge.command.update(id, {
					dueKey: tomorrowKey(),
					due: null,
				});
			d.close();
			signature = "";
			refresh();
			notify(`Moved ${ids.length} ${ids.length === 1 ? "task" : "tasks"} to tomorrow.`, true);
		};
}
function openGoal() {
	const d = openDialog(
		"#settingsDialog",
		`${dialogHead("Today’s finish line", "settingsTitle")}<p class="muted">Complete all Must Do tasks and choose how many Should Do tasks count towards today’s finish line.</p><form id="goalForm" class="settings-links"><label class="field">Should Do target<input name="count" type="number" min="0" max="5" value="${target}"></label><button class="primary">Save target</button></form>`,
	);
	$("#goalForm").onsubmit = (e) => {
		e.preventDefault();
		engines.todo.SyncEngine.set(
			"todo",
			"dailyGoal",
			JSON.stringify({
				date: dateKey(),
				count: Number(e.target.elements.count.value),
			}),
		);
		d.close();
		signature = "";
		refresh();
	};
}
function notifyState() {
	const clock = engines.clock;
	if (typeof Notification === "undefined" || !clock?.notifyEnabled) return { supported: false, on: false, text: "This browser cannot show notifications." };
	if (Notification.permission === "denied") return { supported: true, on: false, blocked: true, text: "Notifications are blocked for this site. Allow them in the browser's site settings, then turn this on again." };
	if (!clock.notifyEnabled()) return { supported: true, on: false, text: "Off. Turn on to hear about focus blocks and breaks while you are in another window." };
	return {
		supported: true,
		on: true,
		text: clock.pushSubscribed()
			? "On. You will be told when a focus block ends or a break is due, even if this window is closed."
			: "On while the app is open in the background. Closed-app alerts are not set up on this device yet; use the test to check.",
	};
}
function paintNotify() {
	const box = $("#notifyToggle");
	if (!box) return;
	const state = notifyState();
	box.checked = state.on;
	box.disabled = !state.supported || !!state.blocked;
	$("#keepAwakeToggle").checked = !!engines.clock?.keepAwakeEnabled?.();
	$("#keepAwakeToggle").disabled = !state.on;
	$("#notifyTest").disabled = !state.on;
	$("#notifyStatus").textContent = state.text;
}
function openSettings() {
	const partnerVisible = broadcastVisible(), partnerSound = broadcastSoundEnabled();
	openDialog(
		"#settingsDialog",
		`${dialogHead("Your workspace", "settingsTitle")}<p class="muted">The same widgets and saved data, with a view for each part of your day.</p><div class="settings-links">${Object.keys(
			paths,
		)
			.map(
				(type) =>
					`<a href="${esc(standaloneUrl(type))}" target="_blank" rel="noopener">${type === "todo" ? "To-Do" : type === "clock" ? "Clock" : "Timetable"} <span>Open separately ↗</span></a>`,
			)
			.join(
				"",
			)}</div><fieldset class="partner-settings"><legend>Broadcast</legend><label><input id="partnerVisibleToggle" type="checkbox" ${partnerVisible ? "checked" : ""}> Show Broadcast and Carry</label><label><input id="partnerSoundToggle" type="checkbox" ${partnerSound ? "checked" : ""}> Voice</label><label>Intensity <select id="partnerIntensity"><option value="intense" ${partnerIntensity() === "intense" ? "selected" : ""}>Intense</option><option value="steady" ${partnerIntensity() === "steady" ? "selected" : ""}>Steady</option></select></label></fieldset><fieldset class="partner-settings notify-settings"><legend>Notifications</legend><label><input id="notifyToggle" type="checkbox"> Tell me when a focus block ends or a break is due</label><label><input id="keepAwakeToggle" type="checkbox"> Keep timers accurate while this window is in the background</label><p class="notify-status" id="notifyStatus" role="status" aria-live="polite"></p><div class="notify-actions"><button type="button" id="notifyTest">Send a test notification</button></div></fieldset><button id="soundToggle" aria-pressed="${engines.todo.SyncEngine.get("user", "commandCentreSounds") !== false}">Interface sounds: ${engines.todo.SyncEngine.get("user", "commandCentreSounds") === false ? "Off" : "On"}</button> <button data-action="goal">Adjust daily finish line</button> <button id="lockButton">Lock Command Centre</button>`,
	);
	$("#lockButton").onclick = lock;
	paintNotify();
	$("#notifyToggle").onchange = async (e) => {
		const box = e.currentTarget, clock = engines.clock;
		box.disabled = true;
		try {
			if (box.checked) {
				if (typeof Notification !== "undefined" && Notification.permission === "default") await Notification.requestPermission();
				if (await clock.requestNotifyPermission()) {
					/* Show "On" straight away; the closed-app (push) setup can take a moment or stall offline. */
					box.disabled = false;
					paintNotify();
					await Promise.race([clock.ensurePushSubscription(), new Promise((resolve) => setTimeout(resolve, 10000))]);
				}
			} else {
				clock.disableNotify();
				clock.teardownPushSubscription();
			}
		} catch {}
		box.disabled = false;
		paintNotify();
	};
	$("#keepAwakeToggle").onchange = (e) => {
		engines.clock?.setKeepAwakeEnabled(e.currentTarget.checked);
		paintNotify();
	};
	$("#notifyTest").onclick = async (e) => {
		const button = e.currentTarget, status = $("#notifyStatus");
		button.disabled = true;
		const shown = engines.clock.sendTestNotification();
		if (!shown) {
			status.textContent = "Turn notifications on first.";
			button.disabled = false;
			return;
		}
		status.textContent = "Sent to this device. Checking the closed-app path\u2026";
		const push = await engines.clock.testPush();
		button.disabled = false;
		status.textContent = push.ok
			? `Test sent to ${push.sent} of ${push.devices} ${push.devices === 1 ? "device" : "devices"}, including when the app is closed.`
			: push.error === "no_subscription"
				? "Shown on this device. Closed-app alerts are not set up on it yet: switch notifications off and on again."
				: push.error === "vapid_not_configured"
					? "Shown on this device. The server has no push keys, so closed-app alerts cannot be sent."
					: "Shown on this device. Could not reach the server for the closed-app test.";
	};
	$("#partnerVisibleToggle").onchange = (e) => {
		engines.todo.SyncEngine.set("user", "commandPartnerVisible", e.currentTarget.checked);
		if (!e.currentTarget.checked) stopBroadcastAudio();
		const card = $("#broadcastCompanion");
		if (card) card.hidden = !e.currentTarget.checked;
		render();
	};
	$("#partnerIntensity").onchange = (e) => {
		engines.todo.SyncEngine.set("user", "partnerIntensity", e.currentTarget.value);
		partnerLine.key = "";
		signature = "";
		refresh();
	};
	$("#partnerSoundToggle").onchange = (e) => {
		engines.todo.SyncEngine.set("user", "commandPartnerSound", e.currentTarget.checked);
		if (!e.currentTarget.checked) stopBroadcastAudio();
	};
	$("#soundToggle").onclick = (e) => {
		const enabled =
			engines.todo.SyncEngine.get("user", "commandCentreSounds") === false;
		engines.todo.SyncEngine.set("user", "commandCentreSounds", enabled);
		e.currentTarget.textContent = `Sound effects: ${enabled ? "On" : "Off"}`;
		e.currentTarget.setAttribute("aria-pressed", String(enabled));
		if (enabled) playCue("drop");
	};
}
function openSearch(all = false) {
	const d = openDialog(
		"#searchDialog",
		`<input id="commandInput" class="command-input" aria-label="Search" placeholder="Find a task or type an action…" autocomplete="off"><div class="command-results" id="commandResults"></div><div class="command-help">↑ ↓ to navigate · Enter to choose · Esc to close</div>`,
	);
	const input = $("#commandInput");
	function results() {
		const q = input.value.toLowerCase().trim();
		const matches = tasks
			.filter((t) => !t.done && (!q || t.text.toLowerCase().includes(q)))
			.slice(0, all ? 100 : 8);
		const actions = [
			["today", "Open Today"],
			["plan", "Open planner"],
			["focus", "Open focus workspace"],
			["docket", "Open weekly docket"],
			["add", "Add a task"],
		].filter(([, label]) => !q || label.toLowerCase().includes(q));
		$("#commandResults").innerHTML =
			matches
				.map(
					(t) =>
						`<button class="command-result" data-action="search-task" data-id="${esc(t.id)}">${icon("check")}<span>${esc(t.text)}</span><small>${duration(t) ? `${duration(t)} min` : ""}</small></button>`,
				)
				.join("") +
			actions
				.map(
					([action, label]) =>
						`<button class="command-result" data-action="search-action" data-command="${action}">${icon(action === "add" ? "plus" : "right")}${label}</button>`,
				)
				.join("") +
			(!matches.length && !actions.length
				? '<p class="group-empty">No matches.</p>'
				: "");
	}
	input.oninput = results;
	d.onkeydown = (e) => {
		const buttons = [...d.querySelectorAll(".command-result")],
			index = buttons.indexOf(document.activeElement);
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			buttons[
				(index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
					buttons.length
			]?.focus();
		}
		if (e.key === "Enter" && document.activeElement === input) {
			e.preventDefault();
			buttons[0]?.click();
		}
	};
	results();
}
function openSchedule(id, date = isoDate(), start = "13:00", hint = "") {
	const t = task(id);
	if (!t) return;
	$("#editorDialog").open && $("#editorDialog").close();
	const d = openDialog(
		"#editorDialog",
		`${dialogHead("Schedule task", "editorTitle")}<p class="muted">${esc(t.text)}</p>${hint ? `<p class="schedule-hint">${esc(hint)}</p>` : ""}<form id="scheduleForm"><div class="form-grid" style="margin-top:20px"><label class="field wide">Date<input type="date" name="date" value="${date}" required></label><label class="field">Start<input type="time" name="start" value="${start}" required></label><label class="field">Minutes<input type="number" min="1" max="720" name="duration" value="${duration(t) || 45}" required></label></div><p class="form-error" role="alert" id="scheduleError"></p><div class="dialog-actions"><button type="button" data-action="close-dialog">Cancel</button><button class="primary">Save time block</button></div></form>`,
	);
	$("#scheduleForm").onsubmit = async (e) => {
		e.preventDefault();
		const f = new FormData(e.target),
			date = f.get("date"),
			start = f.get("start"),
			m = Number(f.get("duration")),
			end = minutes(start) + m;
		const button = e.target.querySelector(".primary");
		button.disabled = true;
		try {
			await engines.timetable.SyncEngine.pull("timetable");
			await engines.todo.SyncEngine.pull("todo");
			engines.todo.TodoUIBridge.refresh();
			const fresh = engines.todo.TodoUIBridge.snapshot().tasks.find(
				(x) => x.id === id,
			);
			if (!fresh) throw new Error("This task is no longer available.");
			const choice = await overlapChoice(occurrences(localDate(date)), minutes(start), end, fresh.text, fresh.scheduleId ? { id: fresh.scheduleId } : null);
			if (!choice) return;
			await applyOccurrenceChanges(choice.changes);
			let blocks =
				engines.timetable.SyncEngine.get("timetable", "courses") || [];
			if (typeof blocks === "string") blocks = JSON.parse(blocks);
			engines.timetable.schedule = blocks;
			let block = blocks.find((b) => b.id === fresh.scheduleId);
			/* A block left behind by an earlier save that lost its link to this task:
			   same name, same single day, linked to nobody. Adopt it instead of colliding with it. */
			const orphan = block ? null : blocks.find((b) => b.startDate === date && b.endDate === date && b.name === fresh.text && !engines.todo.TodoUIBridge.snapshot().tasks.some((x) => x.scheduleId === b.id));
			/* Overlaps were settled above. */
			if (orphan) {
				Object.assign(orphan, { days: [{ day: localDate(date).getDay(), start, end: timeString(end), location: "" }], overrides: [] });
				block = orphan;
			} else if (block) {
				const source =
					fresh.sourceDate ||
					block.startDate ||
					normalizeDateKey(fresh.dueKey) ||
					date;
				const override = {
					...(block.overrides || []).find((o) => o.sourceDate === source),
					sourceDate: source,
					date,
					start,
					end: timeString(end),
					skipped: false,
				};
				block.overrides = (block.overrides || [])
					.filter((o) => o.sourceDate !== source)
					.concat(override);
			} else {
				block = {
					id: crypto.randomUUID(),
					name: fresh.text,
					description: "One-off timebox",
					location: "",
					color: "#9461e9",
					category: "personal",
					trackCompletion: false,
					startDate: date,
					endDate: date,
					days: [
						{
							day: localDate(date).getDay(),
							start,
							end: timeString(end),
							location: "",
						},
					],
					overrides: [],
				};
				blocks.push(block);
			}
			engines.timetable.saveBlocks(blocks);
			const link = {
				scheduledStart: new Date(`${date}T${start}`).toISOString(),
				scheduledEnd: new Date(`${date}T${timeString(end)}`).toISOString(),
				dueKey: date,
				due: date === isoDate() ? "today" : null,
				scheduleId: block.id,
				timeboxed: true,
				plannedMinutes: m,
			};
			engines.todo.TodoUIBridge.command.update(id, link);
			engines.todo.TodoUIBridge.refresh();
			if (!engines.todo.TodoUIBridge.snapshot().tasks.find((x) => x.id === id)?.scheduleId) engines.todo.TodoUIBridge.command.update(id, link);
			d.close();
			recentScheduleId = block.id;
			setTimeout(() => {
				recentScheduleId = null;
				document
					.querySelectorAll(".scheduled-reveal")
					.forEach((el) => el.classList.remove("scheduled-reveal"));
			}, 650);
			signature = "";
			refresh();
			notify("Task scheduled.");
			playCue("saved");
		} catch (err) {
			const clash = /overlaps/.test(err.message) && occurrences(localDate(date)).find((e) => minutes(start) < minutes(e.end) && end > minutes(e.start));
			$("#scheduleError").textContent = clash ? `${err.message} It overlaps “${clash.name}” (${clash.start}–${clash.end}).` : err.message;
		} finally {
			button.disabled = false;
		}
	};
}
let calendarMenu = null,
	calendarMenuAnchor = null,
	calendarMenuScroll = null,
	holdTimer = null,
	suppressBlockClick = null;
function closeCalendarMenu(restoreFocus = false) {
	calendarMenu?.remove();
	calendarMenu = null;
	if (restoreFocus && calendarMenuAnchor?.isConnected)
		calendarMenuAnchor.focus({ preventScroll: true });
	calendarMenuAnchor = null;
}
function selectedEvent(element) {
	return occurrences(localDate(element.dataset.date)).find(
		(e) =>
			e.id === element.dataset.eventId &&
			e.sourceDate === element.dataset.source,
	);
}
/* One menu for the whole app. Entries are { label, hint, danger, run }, { sep: true } or
   { label, options: [{ label, short, value, dot, current }], run(value) } for a row of choices. */
function showMenu(anchor, x, y, title, entries) {
	closeCalendarMenu();
	calendarMenuAnchor = anchor;
	const handlers = new Map();
	let n = 0;
	const html = entries
		.map((en) => {
			if (en.sep) return '<hr class="menu-sep">';
			if (en.options)
				return `<div class="menu-row" role="group" aria-label="${esc(en.label)}"><span class="menu-row-label">${esc(en.label)}</span><div class="menu-options">${en.options
					.map((o) => {
						const id = n++;
						handlers.set(String(id), () => en.run(o.value));
						return `<button type="button" role="menuitemradio" aria-checked="${!!o.current}" data-menu="${id}" class="menu-opt" title="${esc(o.label)}" aria-label="${esc(o.label)}">${o.dot ? tagDot(o.dot) : ""}${o.short === "" ? "" : esc(o.short ?? o.label)}</button>`;
					})
					.join("")}</div></div>`;
			const id = n++;
			handlers.set(String(id), en.run);
			return `<button type="button" role="menuitem" data-menu="${id}" class="${en.danger ? "danger" : ""}"><span>${esc(en.label)}</span>${en.hint ? `<small>${esc(en.hint)}</small>` : ""}</button>`;
		})
		.join("");
	const menu = document.createElement("div");
	menu.className = "calendar-context-menu";
	menu.setAttribute("role", "menu");
	menu.setAttribute("aria-label", `Options for ${title}`);
	menu.innerHTML = `<p class="calendar-menu-title">${esc(title)}</p>${html}`;
	menu.onclick = (e) => {
		const item = e.target.closest("[data-menu]");
		if (!item) return;
		const run = handlers.get(item.dataset.menu);
		closeCalendarMenu();
		run?.();
	};
	menu.oncontextmenu = (e) => e.preventDefault();
	menu.onkeydown = (e) => {
		const items = [...menu.querySelectorAll("[data-menu]")],
			index = items.indexOf(document.activeElement);
		if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
			e.preventDefault();
			items[e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
		} else if (e.key === "Escape") {
			e.preventDefault();
			closeCalendarMenu(true);
		} else if (e.key === "Tab") closeCalendarMenu(true);
	};
	document.body.append(menu);
	calendarMenu = menu;
	const bounds = menu.getBoundingClientRect();
	menu.style.left = `${Math.max(8, Math.min(x, innerWidth - bounds.width - 8))}px`;
	menu.style.top = `${Math.max(8, Math.min(y, innerHeight - bounds.height - 8))}px`;
	const scroller = anchor.closest(".calendar-scroll,.agenda-scroll");
	calendarMenuScroll = { x: scrollX, y: scrollY, scroller, top: scroller?.scrollTop, left: scroller?.scrollLeft };
	menu.querySelector("[data-menu]")?.focus({ preventScroll: true });
}
const priorityRow = (t) => ({
	label: "Priority",
	options: ["must", "should", "could"].map((p) => ({ label: PRI_NAME[p], short: PRI_NAME[p].split(" ")[0], value: p, current: (t.pri || "must") === p })),
	run: (p) => {
		engines.todo.TodoUIBridge.command.update(t.id, { pri: p });
		signature = "";
		refresh();
		notify(`Now ${PRI_NAME[p]}.`);
	},
});
const tagRow = (t) => ({
	label: "Tag",
	options: [
		...KINDS.filter((k) => k !== "class").map((k) => ({ label: KIND_LABEL[k], short: "", dot: k, value: k, current: t.kind === k })),
		{ label: "Auto", short: "Auto", value: "", current: !isKind(t.kind) },
	],
	run: (k) => {
		engines.todo.TodoUIBridge.command.update(t.id, { kind: isKind(k) ? k : null });
		signature = "";
		refresh();
		notify(isKind(k) ? `Tagged ${KIND_LABEL[k]}.` : "Tag set to Auto.");
	},
});
function completeTask(id) {
	engines.todo.TodoUIBridge.command.toggle(id);
	signature = "";
	refresh();
	const done = task(id);
	notify(done?.done ? "Task completed." : "Task reopened.", true);
}
function deleteTask(id) {
	engines.todo.TodoUIBridge.command.remove(id);
	signature = "";
	refresh();
	notify("Task deleted.", true);
}
function taskMenu(el, x, y) {
	const t = task(el.dataset.task);
	if (!t) return;
	const reminder = isCalendarReminder(t, courses);
	const scheduled = !!(t.scheduleId || t.scheduledStart);
	const entries = [];
	if (!t.done && !reminder) entries.push({ label: "Start focus", hint: "Open the focus workspace", run: () => selectFocus(t.id) });
	entries.push({ label: "Edit\u2026", run: () => openEditor(t.id) });
	if (!t.done) entries.push({ label: scheduled ? "Reschedule\u2026" : "Schedule\u2026", run: () => openSchedule(t.id) });
	if (!t.done) {
		entries.push({ sep: true }, priorityRow(t), tagRow(t));
		if (!scheduled)
			entries.push({
				label: "Move to tomorrow",
				run: () => {
					const prev = { dueKey: t.dueKey ?? null, due: t.due ?? null };
					engines.todo.TodoUIBridge.command.update(t.id, { dueKey: tomorrowKey(), due: null });
					signature = "";
					refresh();
					notify("Moved to tomorrow.", () => {
						engines.todo.TodoUIBridge.command.update(t.id, prev);
						signature = "";
						refresh();
					});
				},
			});
		entries.push({ label: "Log time\u2026", run: () => openLogTime(t.id) });
	}
	entries.push({ sep: true }, { label: t.done ? "Reopen" : "Mark complete", run: () => completeTask(t.id) }, { label: "Delete", danger: true, run: () => deleteTask(t.id) });
	showMenu(el, x, y, t.text, entries);
}
function groupMenu(el, x, y) {
	const pri = el.dataset.priority;
	const closed = collapsed.has(pri);
	showMenu(el, x, y, PRI_NAME[pri], [
		{ label: `Add a ${PRI_NAME[pri]} task`, hint: "Type it right in the list", run: () => openGroupAdd(pri) },
		{
			label: closed ? "Expand" : "Collapse",
			run: () => {
				closed ? collapsed.delete(pri) : collapsed.add(pri);
				render();
			},
		},
	]);
}
function docketMenu(el, x, y) {
	const t = el.dataset.taskId ? task(el.dataset.taskId) : null;
	const entries = [];
	if (t) {
		entries.push({ label: "Open task", run: () => openEditor(t.id) });
		if (!t.done && !isCalendarReminder(t, courses)) entries.push({ label: "Focus on it again", run: () => selectFocus(t.id) });
	}
	entries.push({ label: "Log time\u2026", run: () => openLogTime(t?.id || "") });
	if (el.dataset.auto === "1") entries.push({ label: "Log the actual time instead…", hint: "Replaces the automatic entry for that day", run: () => openLogTime(t?.id || "") });
	if ((el.dataset.manual === "1" || el.dataset.auto === "1") && el.querySelector(".docket-remove")) entries.push({ sep: true }, { label: "Remove this entry", danger: true, run: () => el.querySelector(".docket-remove")?.click() });
	showMenu(el, x, y, el.querySelector(".docket-desc")?.firstChild?.textContent?.trim() || "Docket entry", entries);
}
function areaMenu(el, x, y) {
	const entries = [{ label: "New task\u2026", run: () => openEditor() }, { label: "Plan my day", hint: "Preview before anything is scheduled", run: () => openPlanDay() }, { label: "Import readings from Notion\u2026", hint: "Preview before anything is added", run: () => openReadingsImport() }];
	if (el.dataset.area === "today") entries.push({ label: "Wrap up day", run: () => openWrapUp() });
	showMenu(el, x, y, el.dataset.area === "tray" ? "Unscheduled" : "Today", entries);
}
function partnerMenu(el, x, y) {
	const sound = broadcastSoundEnabled();
	showMenu(el, x, y, "Broadcast", [
		{ label: "Next line", run: () => advancePartnerLine() },
		{
			label: "Intensity",
			options: [{ label: "Intense", value: "intense", current: partnerIntensity() === "intense" }, { label: "Steady", value: "steady", current: partnerIntensity() === "steady" }],
			run: (v) => {
				engines.todo.SyncEngine.set("user", "partnerIntensity", v);
				partnerLine.key = "";
				signature = "";
				refresh();
			},
		},
		{
			label: sound ? "Mute voice" : "Unmute voice",
			run: () => {
				engines.todo.SyncEngine.set("user", "commandPartnerSound", !sound);
				if (sound) stopBroadcastAudio();
			},
		},
		{ sep: true },
		{
			label: "Hide Broadcast",
			hint: "Turn him back on in Settings",
			run: () => {
				engines.todo.SyncEngine.set("user", "commandPartnerVisible", false);
				stopBroadcastAudio();
				const card = $("#broadcastCompanion");
				if (card) card.hidden = true;
			},
		},
	]);
}
function appMenu(el, x, y) {
	showMenu(el, x, y, "Command Centre", [
		{ label: theme === "dark" ? "Switch to light" : "Switch to dark", run: () => changeTheme() },
		{ label: "Settings\u2026", run: () => openSettings() },
		{ sep: true },
		{ label: "Lock Command Centre", run: () => lock() },
	]);
}
function openContextMenu(el, x, y) {
	({ task: taskMenu, group: groupMenu, docket: docketMenu, area: areaMenu, partner: partnerMenu, app: appMenu })[el.dataset.ctx]?.(el, x, y);
}
function showCalendarMenu(element, x, y) {
	const event = selectedEvent(element);
	if (!event) return;
	const block = courses.find((b) => b.id === event.id);
	const oneOff = block?.startDate && block.startDate === block.endDate;
	const linked = tasks.find((t) => t.scheduleId === event.id && normalizeDateKey(t.dueKey) === event.dateKey);
	const open = linked && !linked.done;
	const entries = [{ label: "View details", run: () => openEvent(event.id, event.sourceDate, event.dateKey) }];
	if (open && !isCalendarReminder(linked, courses)) entries.push({ label: "Start focus", run: () => selectFocus(linked.id) });
	if (open) entries.push({ label: "Mark complete", run: () => completeTask(linked.id) }, tagRow(linked));
	entries.push({ sep: true }, { label: "Edit time", hint: "This occurrence only", run: () => openCalendarEditor(event) });
	if (element.dataset.unschedule) entries.push({ label: "Move back to Unscheduled", hint: "Keeps the task", run: () => unscheduleFromElement(element) });
	if (!oneOff) entries.push({ label: "Remove this week only", hint: dateLabel(localDate(event.dateKey)), run: () => applyCalendarChange(event, "skip") });
	entries.push({ label: "Remove from schedule", hint: oneOff ? "Keep the linked task" : "All occurrences of this block", danger: true, run: () => applyCalendarChange(event, "remove") });
	showMenu(element, x, y, event.name, entries);
}
document.addEventListener("contextmenu", (e) => {
	/* Text fields, dialogs and the menu itself keep the browser's own menu. */
	if (e.target.closest("input, textarea, select, dialog, .calendar-context-menu")) return;
	const hit = calendarGrid(e);
	if (hit) {
		e.preventDefault();
		openCalendarCreate(hit.column, hit.y);
		return;
	}
	const element = e.target.closest(".event[data-event-id], [data-ctx]");
	if (!element) return;
	e.preventDefault();
	clearTimeout(holdTimer);
	const bounds = element.getBoundingClientRect();
	const x = e.clientX || bounds.left, y = e.clientY || bounds.top;
	if (element.matches(".event")) showCalendarMenu(element, x, y);
	else openContextMenu(element, x, y);
});
document.addEventListener("input", (e) => {
	if (!quickAdd || !e.target.matches(".group-quick input")) return;
	quickAdd.value = e.target.value;
	const preview = e.target.closest(".group-quick").querySelector(".group-preview");
	const text = groupPreview(quickAdd.pri, e.target.value);
	preview.textContent = text;
	preview.hidden = !text;
});
document.addEventListener("keydown", (e) => {
	if (e.key === "Escape" && quickAdd && e.target.matches(".group-quick input")) {
		quickAdd = null;
		signature = "";
		render();
	}
});
document.addEventListener("submit", (e) => {
	const partly = e.target.closest(".checkin-partly");
	if (partly) {
		e.preventDefault();
		const due = checkInDue();
		if (!due || due.t.id !== partly.dataset.id) return;
		try {
			const mins = Number(new FormData(partly).get("minutes"));
			saveSessions(appendSession(focusSessionsRaw(), manualSession({ taskId: due.t.id, minutes: mins, kind: taskKind(due.t), endAt: due.b[1] })));
			answerCheckIn(entryIdFor(due.t, due.b), "partly");
			notify(`Logged ${formatUnits(unitsFor(mins))} h. The task stays open.`);
		} catch (error) {
			notify(error.message);
		}
		return;
	}
	const form = e.target.closest(".group-quick");
	if (!form) return;
	e.preventDefault();
	const text = form.elements.task.value.trim();
	if (!text) return;
	const pri = form.dataset.priority;
	try {
		engines.todo.TodoNaturalAdd.capture(groupEntry(pri, text));
		quickAdd = { pri, value: "" };
		signature = "";
		refresh();
		document.querySelector(".group-quick input")?.focus();
		notify("Task added.");
	} catch (error) {
		notify(error.message);
	}
});
function moveBlockTo(el, date, topMinute, dayStart, dayEnd) {
	if (el.dataset.unschedule === "ghost") {
		const start = movedTimes(el.dataset.start, el.dataset.start, topMinute, dayStart, dayEnd).start;
		openSchedule(el.dataset.id, date, start, "This task has a time but is not on the calendar yet. Saving makes it a real block.");
		return;
	}
	const ev = selectedEvent(el);
	if (!ev) return;
	const next = movedTimes(ev.start, ev.end, topMinute, 0, 1439);
	if (date === ev.dateKey && next.start === ev.start) return;
	applyCalendarChange(ev, "edit", { date, start: next.start, end: next.end }, `Moved to ${dateLabel(localDate(date))} at ${next.start}.`).then((ok) => { if (!ok) { signature = ""; render(); } });
}
/* Drag the bottom edge of a block to change its length. */
document.addEventListener("pointerdown", (e) => {
	const handle = e.target.closest?.("[data-resize]");
	if (!handle || e.button > 0) return;
	const el = handle.closest(".event[data-event-id]");
	const ev = el && selectedEvent(el);
	const column = el?.closest("[data-drop-calendar]");
	if (!ev || !column) return;
	e.preventDefault();
	e.stopPropagation();
	const dayStart = Number(column.dataset.start);
	const originalHeight = el.style.height;
	let end = ev.end;
	el.draggable = false;
	handle.setPointerCapture?.(e.pointerId);
	el.classList.add("is-resizing");
	const paint = (clientY) => {
		const raw = dayStart + ((clientY - column.getBoundingClientRect().top) / 76) * 60;
		end = resizedEnd(ev.start, raw);
		el.style.height = `${Math.max(27, ((minutes(end) - minutes(ev.start)) * 76) / 60 - 4)}px`;
		const label = el.querySelector("span");
		if (label) label.textContent = `${ev.start} \u2013 ${end}`;
	};
	const finish = (commit) => {
		handle.removeEventListener("pointermove", onMove);
		handle.removeEventListener("pointerup", onUp);
		handle.removeEventListener("pointercancel", onCancel);
		document.removeEventListener("keydown", onKey, true);
		el.classList.remove("is-resizing");
		el.draggable = true;
		suppressBlockClick = el;
		if (commit && end !== ev.end) applyCalendarChange(ev, "edit", { date: ev.dateKey, start: ev.start, end }, `Now ends at ${end}.`).then((ok) => { if (!ok) { signature = ""; render(); } });
		else {
			el.style.height = originalHeight;
			signature = "";
			render();
		}
	};
	const onMove = (m) => paint(m.clientY);
	const onUp = () => finish(true);
	const onCancel = () => finish(false);
	const onKey = (k) => {
		if (k.key === "Escape") {
			k.stopPropagation();
			end = ev.end;
			finish(false);
		}
	};
	handle.addEventListener("pointermove", onMove);
	handle.addEventListener("pointerup", onUp);
	handle.addEventListener("pointercancel", onCancel);
	document.addEventListener("keydown", onKey, true);
}, true);
function saveBlockTag(id, kind) {
	(async () => {
		try {
			await engines.timetable.SyncEngine.pull("timetable");
			let blocks = engines.timetable.SyncEngine.get("timetable", "courses") || [];
			/* Clone first: the sync layer only pushes when the saved value actually differs. */
			blocks = JSON.parse(typeof blocks === "string" ? blocks : JSON.stringify(blocks));
			const target = blocks.find((x) => x.id === id);
			if (!target) throw Error("This block is no longer on the schedule.");
			target.description = withTypeTag(target.description, kind);
			engines.timetable.schedule = blocks;
			engines.timetable.saveBlocks(blocks);
			signature = "";
			refresh();
			notify(kind ? `Tagged ${KIND_LABEL[kind]}.` : "Tag removed.");
		} catch (error) {
			notify(error.message);
		}
	})();
}
/* Import readings from Notion: reads this week's class notes, shows what it found, and only adds tasks
   for the rows you leave ticked. Nothing is written to Notion. */
async function openReadingsImport() {
	const today = isoDate();
	const plus = (key, n) => {
		const d = localDate(key);
		d.setDate(d.getDate() + n);
		return isoDate(d);
	};
	const day = (key) => localDate(key).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
	const head = dialogHead("Import readings from Notion", "editorTitle");
	let days = 7,
		dueMode = "before",
		edition = String(engines.todo?.SyncEngine.get("user", "readingEdition") || ""),
		data = null,
		showPast = false;
	const picked = new Map();
	const d = openDialog("#editorDialog", head + '<p class="muted">Reading your class notes\u2026</p>');
	const fail = (text) => { d.innerHTML = head + `<p class="muted">${esc(text)}</p><div class="dialog-actions"><button type="button" data-action="close-dialog">Close</button></div>`; };
	const load = async () => {
		let res;
		try {
			res = await engines.todo.SyncEngine.callWorker(`/notion/readings?from=${plus(today, -3)}&to=${plus(today, days)}`);
		} catch {
			return fail("Could not reach your workspace. Check your connection and try again.");
		}
		const body = await res.json().catch(() => ({}));
		if (res.status === 501) return fail("Notion is not connected to Command Centre yet.");
		if (!res.ok) return fail("Notion could not be read right now." + (body.detail ? ` (${String(body.detail).slice(0, 120)})` : ""));
		data = body;
		paint();
		backfillClassDates();
	};
	/* Readings imported before the class date was saved pick it up the next time the notes are read. */
	const backfillClassDates = () => {
		const { items: seen } = readingCandidates({ lectures: data.lectures || [], courses: data.courses || {}, tasks: [], today, dueMode, edition });
		const byLecture = new Map(seen.map((i) => [i.lectureId, i.classDate]));
		let changed = false;
		for (const t of tasks) {
			const date = t.lectureId && !t.lectureDate && byLecture.get(t.lectureId);
			if (date) {
				engines.todo.TodoUIBridge.command.update(t.id, { lectureDate: date });
				changed = true;
			}
		}
		if (changed) {
			signature = "";
			refresh();
		}
	};
	const paint = () => {
		const { items: found, unclear, editions } = readingCandidates({ lectures: data.lectures || [], courses: data.courses || {}, tasks: withCleared(tasks, clearedTasks()), today, dueMode, edition, estimate: (t) => { const p = paceFor({ text: t }); return Reading.estimate(t, p.source === "default" ? {} : { pace: p.pace }); } });
		const items = found.filter((i) => showPast || i.classDate >= today),
			missed = found.filter((i) => i.classDate < today).length;
		const isOn = (i) => (picked.has(i.key) ? picked.get(i.key) : !i.exists && i.classDate >= today);
		const sorted = items.slice().sort((a, b) => a.classDate.localeCompare(b.classDate) || a.text.localeCompare(b.text));
		const away = (key) => Math.round((localDate(key) - localDate(today)) / 864e5);
		const awayLabel = (n) => (n === 0 ? "Today" : n === 1 ? "Tomorrow" : n === -1 ? "Yesterday" : n < 0 ? `${-n} days ago` : `In ${n} days`);
		const rowOf = (i) => {
			const flags = [i.exists ? (i.alreadyDone ? "Already done" : "Already on your list") : "", i.alreadyRead ? `pp. ${i.alreadyRead} already covered` : "", i.moved ? `Class moved from ${day(i.moved.from)}` : "", i.classDate < today ? "Class has passed" : "", i.edition ? `${i.edition} edition` : ""].filter(Boolean);
			const link = i.url ? `<a class="import-link" href="${esc(i.url)}" target="_blank" rel="noopener" title="Open the lecture in Notion" aria-label="Open ${esc(i.lectureTitle)} in Notion">${icon("link")}</a>` : "";
			return `<label class="import-row ${i.exists ? "is-exists" : ""}"><input type="checkbox" name="pick" value="${esc(i.key)}" ${isOn(i) && !i.exists ? "checked" : ""} ${i.exists ? "disabled" : ""}><span class="import-main"><b>${esc(i.text)}</b><small>${esc(i.lectureTitle)}</small><small>${i.pages} pages${i.minutes ? ` \u00b7 about ${formatMinutes(i.minutes)}` : ""}</small><span class="import-flags"><i class="import-due ${i.dueKey <= today ? "is-soon" : ""}">${i.dueKey === today ? "Due today" : `Due ${day(i.dueKey)}`}</i>${flags.map((f) => `<i>${esc(f)}</i>`).join("")}</span></span>${link}</label>`;
		};
		const groups = [];
		for (const i of sorted) {
			const last = groups[groups.length - 1];
			if (last && last.key === i.classDate) last.items.push(i);
			else groups.push({ key: i.classDate, items: [i] });
		}
		const rows = groups
			.map((g) => {
				const n = away(g.key), minutes = g.items.reduce((sum, i) => sum + (i.minutes || 0), 0), date = localDate(g.key);
				return `<section class="import-day ${n < 0 ? "is-past" : ""}"><header class="import-date"><small>${esc(date.toLocaleDateString("en-CA", { weekday: "short" }))}</small><b>${esc(date.toLocaleDateString("en-CA", { month: "short", day: "numeric" }))}</b><i>${awayLabel(n)}</i>${minutes ? `<span>${formatMinutes(minutes)}</span>` : ""}</header><div class="import-items">${g.items.map(rowOf).join("")}</div></section>`;
			})
			.join("");
		/* Asked only when a reading in the notes gives pages for more than one edition. */
		const chosen = edition && editions.includes(edition) ? edition : found.find((i) => i.edition)?.edition || editions[0];
		const editionBar = editions.length > 1 ? `<div class="import-edition"><span>Some readings list two editions. Which is yours?</span><div class="import-seg" role="group" aria-label="Edition">${editions.map((e) => `<button type="button" data-edition="${esc(e)}" aria-pressed="${e === chosen}">${esc(e)}</button>`).join("")}</div></div>` : "";
		const check = unclear.length ? `<details class="import-unclear"><summary>${unclear.length} ${unclear.length === 1 ? "class needs" : "classes need"} a look in Notion</summary><ul>${unclear.map((u) => `<li><a href="${esc(u.url)}" target="_blank" rel="noopener">${esc(u.title)}</a> <small>${day(u.classDate)} \u00b7 ${esc(u.reason)}</small></li>`).join("")}</ul></details>` : "";
		d.innerHTML = head + `<div class="import-controls"><label>Look ahead<select id="impDays"><option value="7" ${days === 7 ? "selected" : ""}>7 days</option><option value="14" ${days === 14 ? "selected" : ""}>14 days</option></select></label><label>Due<select id="impDue"><option value="before" ${dueMode === "before" ? "selected" : ""}>Day before class</option><option value="class" ${dueMode === "class" ? "selected" : ""}>Day of class</option></select></label></div>${missed ? `<label class="import-past"><input type="checkbox" id="impPast" ${showPast ? "checked" : ""}> Show missed classes (${missed})</label>` : ""}<form id="importForm">${editionBar}${rows ? `<div class="import-list">${rows}</div>` : `<p class="muted">No readings with page numbers in the next ${days} days.</p>`}${check}<p class="muted import-note">Nothing is added until you confirm. Classes whose notes have no page numbers are listed above, not guessed.</p><p class="form-error" id="importError" role="alert"></p><div class="dialog-actions"><button type="button" data-action="close-dialog">Cancel</button>${rows ? '<button type="submit" class="primary" id="importConfirm"></button>' : ""}</div></form>`;
		const form = $("#importForm"), confirm = $("#importConfirm");
		const count = () => {
			const n = form.querySelectorAll("input[name=pick]:checked").length;
			if (confirm) {
				confirm.textContent = n === 1 ? "Add 1 reading" : `Add ${n} readings`;
				confirm.disabled = !n;
			}
		};
		form.addEventListener("change", (e) => {
			if (e.target.name === "pick") picked.set(e.target.value, e.target.checked);
			count();
		});
		count();
		$("#impDays").onchange = (e) => { days = Number(e.target.value); d.innerHTML = head + '<p class="muted">Reading your class notes\u2026</p>'; load(); };
		$("#impDue").onchange = (e) => { dueMode = e.target.value; paint(); };
		if ($("#impPast")) $("#impPast").onchange = (e) => { showPast = e.target.checked; paint(); };
			form.querySelectorAll("[data-edition]").forEach((b) => (b.onclick = () => {
				edition = b.dataset.edition;
				engines.todo?.SyncEngine.set("user", "readingEdition", edition);
				paint();
			}));
		form.onsubmit = (e) => {
			e.preventDefault();
			try {
				const chosen = new Set([...form.querySelectorAll("input[name=pick]:checked")].map((i) => i.value));
				const added = [];
				for (const i of items.filter((x) => chosen.has(x.key) && !x.exists)) {
					const id = engines.todo.TodoUIBridge.command.add({
						text: i.text,
						pri: i.pri,
						plannedMinutes: i.minutes,
						due: i.dueKey === today ? "today" : null,
						dueKey: i.dueKey,
						notes: `From Notion: ${i.lectureTitle}\n${i.url}`,
						reading: i.minutes ? { autoMinutes: i.minutes } : null,
						lectureId: i.lectureId,
						lectureUrl: i.url,
						lectureDate: i.classDate,
					});
					if (id) added.push(id);
				}
				if (!added.length) throw Error("Nothing was added. Tick at least one reading.");
				d.close();
				signature = "";
				refresh();
				notify(`Added ${added.length} ${added.length === 1 ? "reading" : "readings"} from Notion.`, () => {
					added.forEach((id) => engines.todo.TodoUIBridge.command.remove(id));
					signature = "";
					refresh();
				});
			} catch (error) {
				$("#importError").textContent = error.message;
			}
		};
	};
	load();
}
function openCalendarCreate(column, y) {
	const date = column.dataset.date,
		start = timeAtOffset(y, Number(column.dataset.start), Number(column.dataset.end));
	$("#editorDialog").open && $("#editorDialog").close();
	const d = openDialog(
		"#editorDialog",
		`${dialogHead("New task on calendar", "editorTitle")}<p class="muted">${esc(dateLabel(localDate(date)))}</p><form id="calendarCreateForm"><div class="form-grid" style="margin-top:20px"><label class="field wide task-name">Task<input name="text" required maxlength="500" placeholder="What are you doing?" autocomplete="off"></label><label class="field">Start<input type="time" name="start" value="${start}" required></label><label class="field">Minutes<input type="number" min="5" max="720" name="duration" value="60" required></label><label class="field wide">Priority<select name="pri"><option value="must">Must Do</option><option value="should">Should Do</option><option value="could">Could Do</option></select></label></div><p class="form-error" role="alert" id="calendarCreateError"></p><div class="dialog-actions"><button type="button" data-action="close-dialog">Cancel</button><button class="primary">Add to calendar</button></div></form>`,
	);
	d.querySelector("[name=text]").focus();
	$("#calendarCreateForm").onsubmit = async (e) => {
		e.preventDefault();
		const f = new FormData(e.target),
			text = String(f.get("text")).trim(),
			m = Number(f.get("duration")),
			at = f.get("start");
		const button = e.target.querySelector(".primary");
		button.disabled = true;
		try {
			if (!text) throw Error("Add a task name.");
			const end = minutes(at) + m;
			const choice = await overlapChoice(occurrences(localDate(date)), minutes(at), end, text);
			if (!choice) return;
			await applyOccurrenceChanges(choice.changes);
			await engines.timetable.SyncEngine.pull("timetable");
			await engines.todo.SyncEngine.pull("todo");
			engines.todo.TodoUIBridge.refresh();
			let blocks = engines.timetable.SyncEngine.get("timetable", "courses") || [];
			if (typeof blocks === "string") blocks = JSON.parse(blocks);
			engines.timetable.schedule = blocks;
			const id = engines.todo.TodoUIBridge.command.add({ text, pri: f.get("pri"), plannedMinutes: m, due: date === isoDate() ? "today" : null, dueKey: date });
			if (!id) throw Error("Task could not be added.");
			const block = {
				id: crypto.randomUUID(),
				name: text,
				description: "One-off timebox",
				location: "",
				color: "#9461e9",
				category: "personal",
				trackCompletion: false,
				startDate: date,
				endDate: date,
				days: [{ day: localDate(date).getDay(), start: at, end: timeString(end), location: "" }],
				overrides: [],
			};
			blocks.push(block);
			engines.timetable.saveBlocks(blocks);
			const link = {
				scheduledStart: new Date(`${date}T${at}`).toISOString(),
				scheduledEnd: new Date(`${date}T${timeString(end)}`).toISOString(),
				scheduleId: block.id,
				timeboxed: true,
			};
			engines.todo.TodoUIBridge.command.update(id, link);
			engines.todo.TodoUIBridge.refresh();
			if (!engines.todo.TodoUIBridge.snapshot().tasks.find((x) => x.id === id)?.scheduleId) engines.todo.TodoUIBridge.command.update(id, link);
			d.close();
			recentScheduleId = block.id;
			signature = "";
			refresh();
			notify("Task added to the calendar.");
			playCue("saved");
		} catch (err) {
			$("#calendarCreateError").textContent = err.message;
		} finally {
			button.disabled = false;
		}
	};
}
const calendarGrid = (e) => {
	if (e.target.closest(".event, .gap-hint, button, a")) return null;
	const column = e.target.closest("[data-drop-calendar]");
	if (!column || !column.dataset.date) return null;
	return { column, y: e.clientY - column.getBoundingClientRect().top };
};
function zoomPlanDay(date) {
	if (planDays === 1) planDays = 3;
	else {
		planDays = 1;
		weekOffset = Math.round((localDate(date) - localDate(isoDate())) / 864e5);
	}
	signature = "";
	render();
}
document.addEventListener("dblclick", (e) => {
	if (e.target.closest("dialog, input, textarea, select, .calendar-context-menu")) return;
	const hit = calendarGrid(e);
	if (hit) return openCalendarCreate(hit.column, hit.y);
	if (e.target.closest("button, a, .task-actions, .event")) return;
	const row = e.target.closest(".task-row[data-task]");
	if (row) {
		const t = task(row.dataset.task);
		if (t && !t.done) selectFocus(t.id);
		return;
	}
	const day = e.target.closest(".calendar-date[data-date]");
	if (day) return zoomPlanDay(day.dataset.date);
	const entry = e.target.closest(".docket-row");
	if (entry) {
		if (entry.dataset.taskId && task(entry.dataset.taskId)) openEditor(entry.dataset.taskId);
		return;
	}
	if (e.target.closest(".docket-layout") && !e.target.closest(".broadcast-card")) openLogTime();
});
document.addEventListener("keydown", (e) => {
	if (e.key !== "ContextMenu" && !(e.shiftKey && e.key === "F10")) return;
	const element = e.target.closest(".event[data-event-id], [data-ctx]");
	if (!element || e.target.closest("input, textarea, select")) return;
	e.preventDefault();
	const bounds = element.getBoundingClientRect();
	if (element.matches(".event")) showCalendarMenu(element, bounds.left, bounds.top);
	else openContextMenu(element, bounds.left + 12, bounds.top + 12);
});
document.addEventListener("pointerdown", (e) => {
	if (calendarMenu && !calendarMenu.contains(e.target)) closeCalendarMenu();
	clearTimeout(holdTimer);
	const element = e.target.closest(".event[data-event-id], [data-ctx]");
	if (!element || e.pointerType !== "touch" || e.target.closest("input, textarea, select, button.group-add")) return;
	const x = e.clientX,
		y = e.clientY;
	holdTimer = setTimeout(() => {
		suppressBlockClick = element;
		if (element.matches(".event")) showCalendarMenu(element, x, y);
		else openContextMenu(element, x, y);
	}, 500);
	const cancelOnMove = (move) => {
		if (Math.abs(move.clientX - x) + Math.abs(move.clientY - y) > 10)
			clearTimeout(holdTimer);
	};
	document.addEventListener("pointermove", cancelOnMove);
	document.addEventListener(
		"pointerup",
		() => {
			clearTimeout(holdTimer);
			document.removeEventListener("pointermove", cancelOnMove);
		},
		{ once: true },
	);
});
document.addEventListener("pointercancel", () => clearTimeout(holdTimer));
document.addEventListener(
	"click",
	(e) => {
		if (
			suppressBlockClick &&
			e.target.closest(".event") === suppressBlockClick
		) {
			e.preventDefault();
			e.stopImmediatePropagation();
		}
		suppressBlockClick = null;
	},
	true,
);
window.addEventListener("resize", () => {
	if (!calendarMenu) return;
	const bounds = calendarMenu.getBoundingClientRect();
	calendarMenu.style.left = `${Math.max(8, Math.min(bounds.left, innerWidth - bounds.width - 8))}px`;
	calendarMenu.style.top = `${Math.max(8, Math.min(bounds.top, innerHeight - bounds.height - 8))}px`;
});
document.addEventListener("scroll", () => {
	const state = calendarMenuScroll;
	if (calendarMenu && state && (scrollX !== state.x || scrollY !== state.y || state.scroller?.scrollTop !== state.top || state.scroller?.scrollLeft !== state.left)) closeCalendarMenu();
}, true);
function calendarState() {
	const read = (engine, namespace, key) => {
		const value = engine.SyncEngine.get(namespace, key);
		const parsed = value == null ? [] : typeof value === "string" ? JSON.parse(value) : value;
		if (!Array.isArray(parsed))
			throw Error("Calendar data is unavailable. Reload to retry.");
		return JSON.parse(JSON.stringify(parsed));
	};
	return {
		blocks: engines.timetable.normaliseBlocks(
			read(engines.timetable, "timetable", "courses"),
		),
		tasks: read(engines.timetable, "todo", "tasks"),
	};
}
async function pullCalendarState() {
	await Promise.all([
		engines.timetable.SyncEngine.pull("timetable"),
		engines.timetable.SyncEngine.pull("todo"),
	]);
	return calendarState();
}
function saveCalendarState(state) {
	// Write both namespaces through one existing engine so task links are current
	// when its completion bridge processes the calendar update.
	engines.timetable.SyncEngine.set("todo", "tasks", JSON.stringify(state.tasks));
	engines.timetable.saveBlocks(state.blocks);
	engines.timetable.render();
	signature = "";
	refresh();
}
function unscheduleFromElement(el) {
	if (el.dataset.unschedule === "ghost") return unscheduleTimedTask(el.dataset.id);
	const ev = selectedEvent(el);
	const linked = ev && tasks.find((t) => t.scheduleId === ev.id && normalizeDateKey(t.dueKey) === ev.dateKey);
	applyCalendarChange(ev, "remove", {}, "Moved back to Unscheduled.").then((ok) => {
		if (!ok || !linked) return;
		/* The task write can be overwritten by a sync already in flight; re-clear until it sticks. */
		const settle = () => {
			engines.todo.TodoUIBridge.refresh();
			const t = engines.todo.TodoUIBridge.snapshot().tasks.find((x) => x.id === linked.id);
			if (t && !t.done && (t.scheduledStart || t.scheduleId)) {
				engines.todo.TodoUIBridge.command.update(linked.id, { scheduledStart: null, scheduledEnd: null, scheduleId: null, timeboxed: false });
				signature = "";
				refresh();
			}
		};
		settle();
		setTimeout(settle, 400);
		setTimeout(settle, 1500);
	});
}
function unscheduleTimedTask(id) {
	const t = task(id);
	if (!t) return;
	const prior = { scheduledStart: t.scheduledStart ?? null, scheduledEnd: t.scheduledEnd ?? null, scheduleId: t.scheduleId ?? null, timeboxed: t.timeboxed ?? null };
	engines.todo.TodoUIBridge.command.update(id, { scheduledStart: null, scheduledEnd: null, scheduleId: null, timeboxed: false });
	signature = "";
	refresh();
	notify("Moved back to Unscheduled.", () => {
		engines.todo.TodoUIBridge.command.update(id, prior);
		signature = "";
		refresh();
	});
}
let calendarBusy = false;
/* A time that runs into other blocks asks what to do instead of refusing: push the rest later,
   shorten what it covers, or overlap. Resolves to { changes, note }, or null when cancelled. */
function overlapChoice(events, start, end, name, self = null) {
	const hits = conflicts(events, start, end, self);
	if (!hits.length) return Promise.resolve({ changes: [], note: "" });
	const span = (a, b) => `${a}–${b}`;
	const option = (mode, label) => {
		const r = resolveOverlap(events, start, end, mode, self);
		const detail = r.blocked ? esc(r.blocked) : r.changes.map((c) => `<span>${esc(c.event.name)}: ${span(c.from.start, c.from.end)} → <b>${span(c.start, c.end)}</b></span>`).join("");
		return { mode, r, html: `<button type="button" class="overlap-option" data-mode="${mode}" ${r.blocked ? "disabled" : ""}><b>${label}</b><small>${detail}</small></button>` };
	};
	const options = [option("push", "Push the rest later"), option("shorten", "Shorten what it covers"), { mode: "overlap", r: { changes: [] }, html: `<button type="button" class="overlap-option" data-mode="overlap"><b>Overlap anyway</b><small>Everything else stays where it is.</small></button>` }];
	const d = openDialog(
		"#choiceDialog",
		`${dialogHead("That runs into your schedule", "choiceTitle")}<p class="muted"><b>${esc(name || "This block")}</b> ${span(timeString(start), timeString(end))} overlaps ${hits.map((e) => `${esc(e.name)} (${span(e.start, e.end)})`).join(", ")}.</p><div class="overlap-options">${options.map((o) => o.html).join("")}</div><div class="dialog-actions"><button type="button" data-action="close-dialog">Cancel</button></div>`,
	);
	return new Promise((resolve) => {
		let answer = null;
		d.querySelectorAll(".overlap-option").forEach((b) =>
			b.addEventListener("click", () => {
				const o = options.find((x) => x.mode === b.dataset.mode);
				const n = o.r.changes.length;
				answer = { changes: o.r.changes, note: o.mode === "overlap" ? " Overlapping." : ` ${o.mode === "push" ? "Pushed" : "Shortened"} ${n} other block${n === 1 ? "" : "s"}.` };
				d.close();
			}),
		);
		d.addEventListener("close", () => resolve(answer), { once: true });
		d.querySelector(".overlap-option:not([disabled])")?.focus();
	});
}
/* Other occurrences changed by an overlap choice made inside another dialog. */
async function applyOccurrenceChanges(changes) {
	if (!changes.length) return;
	let state = await pullCalendarState();
	for (const c of changes) state = changeCalendar(state.blocks, state.tasks, c.event, "edit", { date: c.event.dateKey, start: c.start, end: c.end });
	saveCalendarState(state);
}
async function applyCalendarChange(event, action, patch = {}, doneMessage = "", options = {}) {
	if (action === "edit" && event && !options.resolved) {
		const choice = await overlapChoice(occurrences(localDate(patch.date)), minutes(patch.start), minutes(patch.end), event.name, event);
		if (!choice) return false;
		return applyCalendarChange(event, action, patch, (doneMessage || "Time updated for this occurrence.") + choice.note, { resolved: true, extra: choice.changes });
	}
	/* A change made right after another (move then resize) waits for the first to finish saving. */
	for (let waited = 0; calendarBusy && waited < 4000; waited += 50) await new Promise((resolve) => setTimeout(resolve, 50));
	if (calendarBusy) return false;
	if (!event) {
		notify("This occurrence is no longer available.");
		return false;
	}
	calendarBusy = true;
	try {
		const before = await pullCalendarState();
		if (action === "edit") {
			engines.timetable.schedule = engines.timetable.normaliseBlocks(
				before.blocks,
			);
		}
		let after = changeCalendar(
			before.blocks,
			before.tasks,
			event,
			action,
			patch,
		);
		for (const c of options.extra || []) after = changeCalendar(after.blocks, after.tasks, c.event, "edit", { date: c.event.dateKey, start: c.start, end: c.end });
		saveCalendarState(after);
		after = calendarState();
		if ($("#editorDialog").open) $("#editorDialog").close();
		notify(
			doneMessage ||
			(action === "edit"
				? "Time updated for this occurrence."
				: action === "skip"
					? "Occurrence removed for this week."
					: "Block removed from schedule."),
			async () => {
				if (calendarBusy) return;
				calendarBusy = true;
				try {
					saveCalendarState(
						undoCalendar(before, after, await pullCalendarState()),
					);
					notify("Calendar change undone.");
				} catch (error) {
					notify(error.message);
				} finally {
					calendarBusy = false;
				}
			},
		);
		return true;
	} catch (error) {
		const message = $("#calendarError");
		if (message && $("#editorDialog").open) message.textContent = error.message;
		else notify(error.message);
		return false;
	} finally {
		calendarBusy = false;
	}
}
function openCalendarEditor(event) {
	if (!event) {
		notify("This occurrence is no longer available.");
		return;
	}
	if ($("#editorDialog").open) $("#editorDialog").close();
	const d = openDialog(
		"#editorDialog",
		`${dialogHead("Edit time", "editorTitle")}<p class="muted">${esc(event.name)} · This occurrence only</p><form id="calendarForm"><div class="form-grid"><label class="field wide">Date<input type="date" name="date" value="${esc(event.dateKey)}" required></label><label class="field">Start<input type="time" name="start" value="${esc(event.start)}" required></label><label class="field">End<input type="time" name="end" value="${esc(event.end)}" required></label></div><p class="form-error" id="calendarError" role="alert"></p><div class="dialog-actions"><button type="button" data-action="close-dialog">Cancel</button><button class="primary" type="submit">Save time</button></div></form>`,
	);
	d.querySelector("form").onsubmit = async (e) => {
		e.preventDefault();
		const button = e.target.querySelector('[type="submit"]');
		button.disabled = true;
		try {
			await applyCalendarChange(
				event,
				"edit",
				Object.fromEntries(new FormData(e.target)),
			);
		} finally {
			button.disabled = false;
		}
	};
}
async function openRepeatRange(id) {
	await engines.timetable.SyncEngine.pull("timetable");
	let blocks = engines.timetable.SyncEngine.get("timetable", "courses") || [];
	if (typeof blocks === "string") blocks = JSON.parse(blocks);
	const block = blocks.find((b) => b.id === id);
	if (!block) return;
	const before = { startDate: block.startDate, endDate: block.endDate };
	let mode = block.endDate ? "custom" : "ongoing", start = block.startDate || "", end = block.endDate || "";
	const add = (key, n) => { const d = localDate(key); d.setDate(d.getDate() + n); return isoDate(d); };
	const label = (key) => localDate(key).toLocaleDateString("en-CA", { month: "short", day: "numeric", ...(localDate(key).getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
	const days = [...new Set((block.days || []).map((x) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][x.day]))].join(", ");
	$("#editorDialog").open && $("#editorDialog").close();
	const d = openDialog("#editorDialog", dialogHead("Repeat range", "editorTitle") + '<p class="muted">' + esc(block.name) + '</p><div class="range-picker" role="radiogroup" aria-label="How long this repeats"></div><div class="form-grid"><label class="field">Starts<input type="date" name="start"></label><label class="field">Ends<input type="date" name="end"></label></div><p class="range-summary" role="status"></p><p class="form-error" id="rangeError" role="alert"></p><div class="dialog-actions"><button type="button" data-action="close-dialog">Cancel</button><button type="button" class="primary" id="rangeSave">Save range</button></div>');
	const picker = d.querySelector(".range-picker"), startInput = d.querySelector("[name=start]"), endInput = d.querySelector("[name=end]"), summary = d.querySelector(".range-summary");
	const draw = () => {
		picker.innerHTML = [["ongoing", "Ongoing"], ["w4", "4 weeks"], ["w8", "8 weeks"], ["w12", "12 weeks"], ["custom", "Pick dates"]].map(([m, text]) => '<button type="button" role="radio" aria-checked="' + (mode === m) + '" data-run="' + m + '">' + text + "</button>").join("");
		picker.querySelectorAll("[data-run]").forEach((x) => (x.onclick = () => {
			const m = x.dataset.run;
			if (m !== "ongoing" && !start) start = isoDate();
			mode = m;
			if (m === "ongoing") end = "";
			else if (m[0] === "w") end = add(start, Number(m.slice(1)) * 7 - 1);
			else if (!end) end = add(start, 55);
			draw();
		}));
		startInput.value = start;
		endInput.value = end;
		endInput.disabled = mode === "ongoing";
		const weeks = start && end ? Math.max(1, Math.ceil((Math.round((localDate(end) - localDate(start)) / 864e5) + 1) / 7)) : 0;
		summary.textContent = !end ? "Repeats every " + days + (start ? " from " + label(start) : "") + ", with no end date." : "Repeats every " + days + (start ? " from " + label(start) + " to " : " until ") + label(end) + (weeks ? " · " + weeks + (weeks === 1 ? " week" : " weeks") : "") + ".";
	};
	startInput.onchange = () => { start = startInput.value; if (mode[0] === "w" && start) end = add(start, Number(mode.slice(1)) * 7 - 1); draw(); };
	endInput.onchange = () => { end = endInput.value; mode = end ? "custom" : "ongoing"; draw(); };
	draw();
	$("#rangeSave").onclick = async () => {
		if (start && end && end < start) { $("#rangeError").textContent = "The end date must come after the start date."; return; }
		await engines.timetable.SyncEngine.pull("timetable");
		let current = engines.timetable.SyncEngine.get("timetable", "courses") || [];
		if (typeof current === "string") current = JSON.parse(current);
		const target = current.find((b) => b.id === id);
		if (!target) return;
		const apply = (range) => {
			target.startDate = range.startDate || "";
			target.endDate = range.endDate || "";
			engines.timetable.schedule = current;
			engines.timetable.saveBlocks(current);
			signature = "";
			refresh();
		};
		apply({ startDate: start || undefined, endDate: end || undefined });
		d.close();
		notify("Repeat range saved.", () => { apply(before); $("#toast").hidden = true; });
	};
}
function syncTagRow(chip, kind, fallback = null) {
	const box = chip.closest(".tag-box");
	if (!box) return;
	paintTag(box, kind, fallback ?? box.dataset.fallback ?? null);
	box.querySelector(".tag-options").hidden = true;
	const plus = box.querySelector(".tag-plus");
	plus.setAttribute("aria-expanded", "false");
	plus.focus({ preventScroll: true });
}
function eventTag(block, event, date) {
	const linked = tasks.find((t) => t.scheduleId === block.id && normalizeDateKey(t.dueKey) === date && !t.done);
	if (linked) return taskTagPicker(linked);
	if (String(block.category || "").toLowerCase() === "class") return `<div class="tag-row"><span class="tag-label">Tag</span><span class="kind-chip class">${tagDot("class")}Class</span></div>`;
	if (block.eventType === "reminder") return "";
	return tagPicker({ current: parseTypeTag(block.description, KINDS), action: "set-block-tag", id: block.id, none: true });
}
function openEvent(id, source, date) {
	const block = courses.find((b) => b.id === id),
		event = occurrences(localDate(date)).find(
			(e) => e.id === id && e.sourceDate === source,
		);
	if (!block || !event) return;
	const d = openDialog(
		"#editorDialog",
		`${dialogHead("Scheduled block", "editorTitle")}<h3>${esc(event.name)}</h3><p class="muted" style="margin-top:7px">${dateLabel(localDate(date))} · ${esc(event.start)} – ${esc(event.end)}</p>${event.location ? `<p class="muted">${esc(event.location)}</p>` : ""}${event.outcomeGoal ? `<p style="margin-top:18px">${esc(event.outcomeGoal)}</p>` : ""}<p style="margin-top:18px;white-space:pre-wrap">${esc(stripTypeTag(event.description || ""))}</p>${eventTag(block, event, date)}<div class="dialog-actions"><button data-action="event-edit" data-event-id="${esc(id)}" data-source="${esc(source)}" data-date="${esc(date)}">Edit time</button>${block.startDate && block.startDate === block.endDate ? "" : `<button data-action="event-skip" data-event-id="${esc(id)}" data-source="${esc(source)}" data-date="${esc(date)}">Remove this week only</button>`}${block.startDate && block.startDate === block.endDate ? "" : `<button data-action="event-range" data-event-id="${esc(id)}">Repeat range</button>`}<button class="delete" data-action="event-remove" data-event-id="${esc(id)}" data-source="${esc(source)}" data-date="${esc(date)}">Remove from schedule</button><button class="primary" data-action="close-dialog">Done</button></div>`,
	);
}
/* Ctrl-click (Cmd-click on Mac) on anything that carries a Notion page opens that page instead of its usual action. */
document.addEventListener(
	"click",
	(e) => {
		if (!(e.ctrlKey || e.metaKey)) return;
		const url = e.target.closest("[data-notion-url]")?.dataset.notionUrl;
		if (!url || !/^https:\/\//.test(url)) return;
		e.preventDefault();
		e.stopImmediatePropagation();
		window.open(url, "_blank", "noopener");
	},
	true,
);
document.addEventListener("click", (e) => {
	const b = e.target.closest("[data-action]");
	if (!b) return;
	const id = b.dataset.id;
	if (b.dataset.action === "timer") {
		broadcastReact(/pause/i.test(b.textContent) ? "pause" : "start");
	} else if (b.dataset.action === "finish") broadcastReact("finish");
	else if (b.dataset.action === "flow") broadcastReact("flow");
	switch (b.dataset.action) {
		case "carry-greet":
			waveWithCarry();
			notify("Meet Carry, Broadcast's son. He's here to keep you company.");
			break;
		case "toggle":
			engines.todo.TodoUIBridge.command.toggle(id);
			signature = "";
			refresh();
			{
				const done = task(id);
				const untimed = done?.done && !isCalendarReminder(done, courses) && taskKind(done) !== "admin" && !focusMinutes(id);
				notify(done?.done ? "Task completed." : "Task reopened.", true, untimed ? { label: "Log time", run: () => openLogTime(id) } : null);
			}
			break;
		case "collapse":
			collapsed.has(b.dataset.priority)
				? collapsed.delete(b.dataset.priority)
				: collapsed.add(b.dataset.priority);
			render();
			break;
		case "edit":
			openEditor(id);
			break;
		case "add":
			openEditor(undefined, $("#quickAdd input")?.value || "");
			break;
		case "delete":
			engines.todo.TodoUIBridge.command.remove(id);
			$("#editorDialog").close();
			signature = "";
			refresh();
			notify("Task deleted.", true);
			break;
		case "goal":
			if ($("#settingsDialog").open) $("#settingsDialog").close();
			openGoal();
			break;
		case "plan-day":
			openPlanDay();
			break;
		case "import-readings":
			openReadingsImport();
			break;
		case "partner-cta":
			if (b.dataset.kind === "focus") selectFocus(b.dataset.id);
			else if (b.dataset.kind === "plan") openPlanDay();
			else if (b.dataset.kind === "book") openFirstBlock();
			else openLogTime();
			break;
		case "book-first":
			b.closest("dialog")?.close();
			openFirstBlock();
			break;
		case "partner-tap":
			advancePartnerLine();
			partnerSpeak(broadcastLine);
			break;
		case "review-dismiss":
			engines.todo.SyncEngine.set("user", "partnerReview", b.dataset.week);
			signature = "";
			refresh();
			break;
		case "docket-week":
			docketOffset = b.dataset.step === "0" ? 0 : docketOffset + Number(b.dataset.step);
			signature = "";
			refresh();
			break;
		case "docket-log":
			openLogTime();
			break;
		case "docket-target":
			openTarget();
			break;
		case "checkin-stage":
			checkInStage = b.dataset.stage;
			renderCheckIn();
			break;
		case "checkin-done": {
			const due = checkInDue();
			if (!due || due.t.id !== id) break;
			answerCheckIn(entryIdFor(due.t, due.b), "done");
			engines.todo.TodoUIBridge.command.toggle(id);
			signature = "";
			refresh();
			notify("Done. The block is on the docket.");
			break;
		}
		case "checkin-extend": {
			const due = checkInDue();
			if (!due || due.t.id !== id) break;
			checkInStage = "ask";
			extendBlock(due.t, Number(b.dataset.minutes)).then(() => { signature = ""; refresh(); });
			break;
		}
		case "checkin-skip": {
			const due = checkInDue();
			if (!due || due.t.id !== id) break;
			const entry = entryIdFor(due.t, due.b);
			answerCheckIn(entry, "skipped");
			engines.clock.SyncEngine.set("clock", "docket_excluded", JSON.stringify([...new Set([...docketExcluded(), entry])].slice(-400)));
			signature = "";
			refresh();
			const from = suggestSlot(occurrences(new Date()), Math.ceil((new Date().getHours() * 60 + new Date().getMinutes()) / 15) * 15, Math.round((due.b[1] - due.b[0]) / 60000));
			notify("Taken off the docket.", false, { label: "Find a new time", run: () => openSchedule(id, isoDate(), from == null ? "13:00" : timeString(from)) });
			break;
		}
		case "docket-dismiss": {
			const before = engines.clock.SyncEngine.get("clock", "docket_excluded");
			engines.clock.SyncEngine.set("clock", "docket_excluded", JSON.stringify([...new Set([...docketExcluded(), id])].slice(-400)));
			signature = "";
			refresh();
			notify("Removed. That block no longer bills.", () => { engines.clock.SyncEngine.set("clock", "docket_excluded", before ?? "[]"); signature = ""; refresh(); $("#toast").hidden = true; });
			break;
		}
		case "docket-remove": {
			const before = focusSessionsRaw();
			saveSessions(removeSession(before, id));
			notify("Entry removed.", () => { saveSessions(before); $("#toast").hidden = true; });
			break;
		}
		case "wrap-up":
			openWrapUp();
			break;
		case "fill-gap":
			openSchedule(id, isoDate(), b.dataset.start);
			break;
		case "all-tasks":
			openSearch(true);
			break;
		case "view":
			setView(b.dataset.view);
			break;
		case "select-focus":
			selectFocus(id);
			break;
		case "timer":
			timerAction();
			break;
		case "reset-timer":
			endSessionFlow();
			break;
		case "split-task":
			$("#editorDialog").close();
			openSessionWrap({ task: task(id), mode: "split" });
			break;
		case "schedule":
			openSchedule(id);
			break;
		case "set-tag": {
			const kind = isKind(b.dataset.kind) ? b.dataset.kind : null;
			engines.todo.TodoUIBridge.command.update(id, { kind });
			const t = task(id);
			syncTagRow(b, kind, t ? taskKind(t) : null);
			signature = "";
			refresh();
			notify(kind ? `Tagged ${KIND_LABEL[kind]}.` : "Tag set to Auto.");
			break;
		}
		case "group-cancel":
			quickAdd = null;
			signature = "";
			render();
			break;
		case "group-add":
			openGroupAdd(b.dataset.priority, true);
			break;
		case "tag-pick": {
			const kind = isKind(b.dataset.kind) ? b.dataset.kind : null;
			const box = b.closest(".tag-box");
			syncTagRow(b, kind);
			box?.dispatchEvent(new CustomEvent("tagchange", { bubbles: true, detail: { kind } }));
			break;
		}
		case "tag-toggle": {
			const options = b.closest(".tag-box")?.querySelector(".tag-options");
			if (!options) break;
			options.hidden = !options.hidden;
			b.setAttribute("aria-expanded", String(!options.hidden));
			break;
		}
		case "set-block-tag": {
			const kind = isKind(b.dataset.kind) ? b.dataset.kind : null;
			syncTagRow(b, kind);
			saveBlockTag(id, kind);
			break;
		}
		case "ghost":
			openSchedule(id, b.dataset.date, b.dataset.start, "This task has a time but is not on the calendar yet. Saving makes it a real block.");
			break;
		case "nudge-plan":
			openPlanDay(b.dataset.date === tomorrowKey() ? "tomorrow" : "today");
			break;
		case "nudge-dismiss":
			engines.todo.SyncEngine.set("user", "planNudge", b.dataset.date);
			signature = "";
			refresh();
			break;
		case "event-edit":
			openCalendarEditor(selectedEvent(b)); break;
		case "event-range":
			openRepeatRange(b.dataset.eventId);
			break;
		case "event-skip":
			applyCalendarChange(selectedEvent(b), "skip"); break;
		case "event-remove":
			applyCalendarChange(selectedEvent(b), "remove"); break;
		case "event":
			openEvent(b.dataset.eventId, b.dataset.source, b.dataset.date);
			break;
		case "close-dialog":
			b.closest("dialog").close();
			break;
		case "standalone":
			window.open(standaloneUrl(b.dataset.type), "_blank", "noopener");
			break;
		case "search-task":
			$("#searchDialog").close();
			openEditor(id);
			break;
		case "search-action":
			$("#searchDialog").close();
			b.dataset.command === "add" ? openEditor() : setView(b.dataset.command);
			break;
		case "plan-range":
			planDays = [1,3,7].includes(Number(b.dataset.days)) ? Number(b.dataset.days) : 3;
			signature = ""; render(); break;
		case "week-prev":
			weekOffset -= planDays;
			signature = "";
			render();
			break;
		case "week-next":
			weekOffset += planDays;
			signature = "";
			render();
			break;
		case "week-today":
			weekOffset = 0;
			signature = "";
			render();
			break;
		case "finish":
			resetTimer();
			if (activeTask() && !activeTask().done)
				engines.todo.TodoUIBridge.command.toggle(activeTask().id);
			selectedId = null;
			saveChoice(null);
			signature = "";
			refresh();
			notify("Task completed.", true);
			break;
		case "subtask": {
			const tid = selectedId || activeTask()?.id;
			engines.todo.TodoUIBridge.command.subtask(tid, b.dataset.subId);
			signature = "";
			refresh();
			replanTask(tid);
			break;
		}
		case "adopt-pace": {
			const t = activeTask();
			if (!t) break;
			const base = planBase(t);
			engines.todo.TodoUIBridge.command.update(t.id, { plannedMinutes: base.total, reading: { ...(t.reading || {}), pace: base.learned.pace, autoMinutes: base.total } });
			signature = "";
			refresh();
			break;
		}
		case "adopt-plan": {
			const t = activeTask();
			if (!t) break;
			const subs = planFor(t).plan.map((r, i) => ({ id: `${t.id}_sprint_${Date.now()}_${i}`, text: r.text, done: false }));
			engines.todo.TodoUIBridge.command.update(t.id, { subs });
			signature = "";
			refresh();
			break;
		}
		case "flow":
			engines.clock.document.getElementById("tmContinueFlow").click();
			updateTimer();
			break;
	}
});
document
	.querySelectorAll(".view-tabs button")
	.forEach((b) => (b.onclick = () => setView(b.dataset.view)));
$("#themeToggle").onclick = changeTheme;
$("#searchButton").onclick = () => openSearch();
$("#settingsButton").onclick = openSettings;
$("#toastClose").onclick = () => ($("#toast").hidden = true);
$("#toastAction").onclick = () => {
	const action = toastAction;
	$("#toast").hidden = true;
	toastAction = null;
	action?.run();
};
$("#undoButton").onclick = () => {
	if (undoAction) { const undo = undoAction; undoAction = null; undo(); return; }
	engines.todo.TodoUIBridge.command.undo();
	signature = "";
	refresh();
	$("#toast").hidden = true;
};
document.querySelectorAll("dialog").forEach((d) =>
	d.addEventListener("click", (e) => {
		const r = d.getBoundingClientRect();
		if (
			e.target === d &&
			(e.clientX < r.left ||
				e.clientX > r.right ||
				e.clientY < r.top ||
				e.clientY > r.bottom)
		)
			d.close();
	}),
);
document.addEventListener("keydown", (e) => {
	if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && accessKey) {
		e.preventDefault();
		if (!$("#searchDialog").open) openSearch();
	}
	if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "l") {
		e.preventDefault();
		changeTheme();
	}
});
document.addEventListener("visibilitychange", () => {
	if (!accessKey) return;
	if (document.hidden) {
		/* Pause the 500 ms poll while hidden; the engines keep running. */
		clearInterval(pollTimer);
		pollTimer = null;
	} else {
		if (!pollTimer) pollTimer = setInterval(refresh, 500);
		refresh();
	}
});
$("#unlockForm").onsubmit = async (e) => {
	e.preventDefault();
	const status = $("#unlockStatus"),
		button = e.target.querySelector("button");
	button.disabled = true;
	status.classList.remove("error");
	status.textContent = "Verifying private access…";
	try {
		await authorize($("#accessKey").value);
		unlock();
	} catch (err) {
		status.classList.add("error");
		status.textContent =
			err.message === "unauthorized"
				? "That key was not accepted."
				: "Private sync is temporarily unavailable.";
	} finally {
		button.disabled = false;
	}
};
decorate();
$("#themeToggle").innerHTML = icon(theme === "dark" ? "sun" : "moon");
const saved = sessionStorage.getItem(SESSION_KEY);
if (saved)
	try {
		await authorize(saved);
		unlock();
	} catch {
		lock();
	}
if ("serviceWorker" in navigator && location.protocol.startsWith("http"))
	navigator.serviceWorker.register(`./sw.js?v=${REVISION}`).catch(() => {});

/* Free time worth planning on a day: every gap of half an hour or more, at its real size, from
   now on for today and not at all for past days. */
function freeSlots(dayEvents, dateKey, start, end) {
	const today = isoDate();
	if (dateKey < today) return [];
	const now = new Date();
	const from = dateKey === today ? Math.max(start, Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15) : start;
	return from < end ? gaps(dayEvents, from, end).filter(([s, e]) => e - s >= 30) : [];
}
function renderPlan() {
	const anchor = new Date();
	anchor.setDate(anchor.getDate() + weekOffset);
	if (planDays === 7) anchor.setDate(anchor.getDate() - (anchor.getDay() + 6) % 7);
	const dates = Array.from({ length: planDays }, (_, i) => {
		const d = new Date(anchor);
		d.setDate(d.getDate() + i);
		return d;
	});
	const events = dates.map(dayEvents),
		all = events.flat(),
		{ start, end } = timeRange(all);
	const open = focusTasks(tasks, courses)
		.filter((t) => !t.done && !t.scheduledStart)
		.sort(
			(a, b) =>
				(({ must: 0, should: 1, could: 2 })[a.pri] ?? 0) -
				({ must: 0, should: 1, could: 2 }[b.pri] ?? 0),
		);
	const day = events[0],
		planned = intervals(day, start, end).reduce((n, [s, e]) => n + e - s, 0),
		available = end - start - planned;
	const today = isoDate();
	const nudge = planNudge({ now: new Date(), eventsFor: (key) => dayEvents(localDate(key)), tasks, dismissed: engines.todo.SyncEngine.get("user", "planNudge") || "" });
	return `<div class="planner-layout"><aside class="surface planner-tray" data-unschedule-zone data-ctx="area" data-area="tray"><div class="tray-drop-hint" aria-hidden="true">Drop to unschedule</div><div class="section-heading"><h2>Unscheduled</h2><span>${open.length} tasks</span></div><p class="muted" style="font-size:11px;margin:0 5px 17px">Drag a task into a day, or choose its calendar button.</p>${open.length ? open.map((t) => taskRow(t, true)).join("") : '<p class="group-empty">Your tasks have a time. Add another when you need it.</p>'}<button class="text-button" data-action="add" style="align-self:flex-start;margin:4px 5px 24px">+ Add a task</button><div class="tray-timer"><div><small>Focus</small><b data-timer>45:00</b></div><button data-action="timer" aria-label="Start or pause focus">${icon("play")}</button></div></aside><section class="surface planner-calendar" style="--plan-days:${planDays}"><div class="calendar-head">${icon("calendar")}<div class="calendar-dates">${dates.map((d) => `<div class="calendar-date ${isoDate(d) === today ? "today" : ""}" data-date="${isoDate(d)}" title="Double-click to ${planDays === 1 ? "see three days" : "zoom to this day"}">${d.toLocaleDateString("en-CA", { weekday: "short", day: "numeric" })}<small>${d.toLocaleDateString("en-CA", { month: "long", year: "numeric" })}</small></div>`).join("")}</div></div><div class="calendar-toolbar"><div class="plan-range" role="group" aria-label="Calendar view">${[1,3,7].map(n => `<button data-action="plan-range" data-days="${n}" aria-pressed="${planDays===n}">${n===7?"1 week":n===1?"1 day":"3 days"}</button>`).join("")}</div><button data-action="week-prev" aria-label="Previous ${planDays} days">←</button><button data-action="week-today">Today</button><button data-action="week-next" aria-label="Next ${planDays} days">→</button><button data-action="standalone" data-type="timetable">Edit timetable ↗</button></div>${nudge ? `<div class="plan-nudge" role="status"><span>${esc(nudge.text)}</span><button class="primary" data-action="nudge-plan" data-date="${nudge.date}">Plan ${esc(localDate(nudge.date).toLocaleDateString("en-CA", { weekday: "long" }))}</button><button class="icon-button" data-action="nudge-dismiss" data-date="${nudge.date}" aria-label="Dismiss">\u00d7</button></div>` : ""}<div class="calendar-scroll"><div class="calendar-body" style="--calendar-height:${((end - start) * 76) / 60}px"><div class="calendar-hours">${Array.from({ length: (end - start) / 60 + 1 }, (_, i) => `<span style="top:${i * 76}px">${timeString(start + i * 60)}</span>`).join("")}</div><div class="calendar-columns">${dates
		.map((date, i) => {
			const free = freeSlots(events[i], isoDate(date), start, end);
			return `<div class="calendar-column ${isoDate(date) === today ? "today" : ""}" data-drop-calendar data-date="${isoDate(date)}" data-start="${start}" data-end="${end}">${events[i].map((e) => eventMarkup(e, start)).join("")}${free.map(([s, e]) => `<div class="open-slot" style="top:${((s - start) * 76) / 60 + 4}px;height:${((e - s) * 76) / 60 - 8}px"><span>${formatMinutes(e - s)} free</span></div>`).join("")}${nowLine(start, end, 76, isoDate(date))}</div>`;
		})
		.join(
			"",
		)}</div></div></div><div class="capacity"><b>${dates[0].toLocaleDateString("en-CA", { weekday: "short" })} · Planned ${formatMinutes(planned)} · Available ${formatMinutes(available)}</b><div class="progress-track" role="meter" aria-label="Scheduled time for first displayed day" aria-valuemin="0" aria-valuemax="${end - start}" aria-valuenow="${planned}"><span style="width:${(planned / (end - start)) * 100}%"></span></div><span>${timeString(start)}–${timeString(end)} window · ${formatMinutes(end - start)} shown</span><small class="capacity-note">Calendar window, not a work limit. Scheduling outside it expands the view.</small></div></section></div>`;
}
function formatMinutes(n) {
	const h = Math.floor(n / 60),
		m = n % 60;
	return (
		`${h ? h + " h" : ""}${h && m ? " " : ""}${m ? m + " min" : ""}` || "0 min"
	);
}
function broadcastMarkup() {
	return `<section class="surface context-card broadcast-card" id="broadcastCompanion" data-ctx="partner" aria-label="Broadcast, your focus partner"><div class="broadcast-stage" data-action="partner-tap"><div class="broadcast-3d" title="Tap to hear from your partner"></div><div class="broadcast-figure ${broadcastPose}" role="img" aria-label="Broadcast, a suitcase-headed partner in a charcoal three-piece suit, articulated silver hands and double-monk dress shoes"><div class="broadcast-shadow"></div><div class="broadcast-leg broadcast-leg-left"><div class="broadcast-shoe"></div></div><div class="broadcast-leg broadcast-leg-right"><div class="broadcast-shoe"></div></div><div class="broadcast-arm broadcast-arm-left"><div class="broadcast-cuff"></div><div class="broadcast-hand"><i></i><i></i><i></i><i></i></div></div><div class="broadcast-arm broadcast-arm-right"><div class="broadcast-cuff"></div><div class="broadcast-hand"><i></i><i></i><i></i><i></i></div></div><div class="broadcast-body"><div class="broadcast-shirt"></div><div class="broadcast-tie"></div><div class="broadcast-tie-bar"></div><div class="broadcast-lapel"></div><div class="broadcast-lapel broadcast-lapel-right"></div><div class="broadcast-pocket"></div></div><div class="broadcast-head"><div class="broadcast-handle"></div><div class="broadcast-screen"><div class="broadcast-face"><span class="broadcast-eye broadcast-eye-left"></span><span class="broadcast-eye broadcast-eye-right"></span><span class="broadcast-mouth"></span><span class="broadcast-fang"></span></div><div class="broadcast-scan"></div><div class="broadcast-reflection"></div></div><div class="broadcast-clasps"></div></div></div></div><div class="broadcast-dialogue" data-state="tuning"><span class="sr-only bubble-sr" role="status" aria-live="polite">${esc(broadcastLine)}</span><span class="bubble-ghost" aria-hidden="true">${esc(broadcastLine)}</span><span class="bubble-text" aria-hidden="true">${esc(broadcastLine)}</span><i class="bubble-static" aria-hidden="true"></i></div>${partnerCta ? `<button class="broadcast-cta" data-action="partner-cta" data-kind="${esc(partnerCta.kind)}" data-id="${esc(partnerCta.id || "")}">${esc(partnerCta.label)}</button>` : ""}<p class="broadcast-away" role="status"></p></section>`;
}
const monthDay = (d) => d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
const clockTime = (ms) => {
	const d = new Date(ms);
	return timeString(d.getHours() * 60 + d.getMinutes());
};
function weeklyTarget() {
	const value = Number(engines.todo?.SyncEngine.get("todo", "weeklyHours"));
	return value >= 5 && value <= 80 ? value : WEEKLY_TARGET;
}
const focusSessionsRaw = () => engines.clock.SyncEngine.get("clock", "focus_sessions");
function saveSessions(raw) {
	engines.clock.SyncEngine.set("clock", "focus_sessions", raw);
	signature = "";
	refresh();
}
/* Scheduled blocks bill themselves from the day this arrived (earlier weeks keep the hours
   they had), minus entries removed from the docket. */
function autoSince() {
	let since = Number(engines.todo.SyncEngine.get("user", "autoDocketSince"));
	if (!since) {
		since = localDate(isoDate()).setHours(0, 0, 0, 0);
		engines.todo.SyncEngine.set("user", "autoDocketSince", since);
	}
	return since;
}
function docketExcluded() {
	let raw = engines.clock.SyncEngine.get("clock", "docket_excluded");
	try {
		if (typeof raw === "string") raw = JSON.parse(raw);
	} catch {
		raw = [];
	}
	return Array.isArray(raw) ? raw.map(String) : [];
}
const clearedRaw = () => engines.clock?.SyncEngine.get("clock", "docket_tasks");
function clearedTasks() {
	try {
		const raw = clearedRaw();
		return withCleared([], typeof raw === "string" ? JSON.parse(raw) : raw);
	} catch {
		return [];
	}
}
function billedEntries(events, now) {
	const classes = classEntries(events, now);
	const cleared = withCleared(tasks, clearedTasks()).slice(tasks.length);
	return [
		...sessionEntries(focusSessionsRaw(), [...tasks, ...cleared]),
		...classes,
		...scheduledEntries([...focusTasks(tasks, courses), ...cleared], { sessions: focusSessionsRaw(), classes, now, since: autoSince(), excluded: docketExcluded() }),
	];
}
function docketData(offset = docketOffset) {
	const anchor = new Date();
	anchor.setDate(anchor.getDate() + offset * 7);
	const keys = weekKeys(anchor);
	const now = offset === 0 ? new Date() : offset < 0 ? new Date(keys[6] + "T23:59:59") : new Date(keys[0] + "T00:00:00");
	const since = firstActivityKey();
	const events = keys.filter((key) => key >= since).flatMap((key) => occurrences(localDate(key)));
	return { keys, now, summary: summarize(billedEntries(events, now), now, weeklyTarget()) };
}
let weekCache = { key: "", at: 0, summary: null };
function currentWeek() {
	if (!engines.clock || !engines.timetable || !engines.todo) return null;
	const key = String(focusSessionsRaw() || "") + String(clearedRaw() || "").length + weeklyTarget() + isoDate() + docketExcluded().join();
	if (weekCache.summary && weekCache.key === key && Date.now() - weekCache.at < 20000) return weekCache.summary;
	try {
		weekCache = { key, at: Date.now(), summary: docketData(0).summary };
	} catch {
		return weekCache.summary;
	}
	return weekCache.summary;
}
function paceTail() {
	const s = currentWeek();
	if (!s) return "";
	const gap = Math.round((s.expected - s.billable) * 10) / 10;
	const pace = s.pace === "behind" ? ", " + formatUnits(gap) + " behind" : s.pace === "ahead" ? ", " + formatUnits(-gap) + " ahead" : ", right on pace";
	return formatUnits(s.billable) + " of " + formatUnits(s.target) + " hours this week" + pace + ".";
}
const partnerIntensity = () => (engines.todo?.SyncEngine.get("user", "partnerIntensity") === "steady" ? "steady" : "intense");
function weeklyCeiling() {
	const value = Number(engines.todo?.SyncEngine.get("todo", "weeklyCeiling"));
	return value >= 20 && value <= 100 ? value : 55;
}
function partnerVoice(s) {
	const { stats, grid } = heatInfo();
	const now = new Date();
	const todayCell = grid.columns.flat().find((c) => c.today);
	let celebrated = Number(engines.todo.SyncEngine.get("user", "partnerMilestone")) || 0;
	if (stats.current < celebrated) {
		celebrated = 0;
		engines.todo.SyncEngine.set("user", "partnerMilestone", 0);
	}
	const milestone = milestoneReached(stats.current, celebrated);
	if (milestone) {
		engines.todo.SyncEngine.set("user", "partnerMilestone", milestone);
		partnerCheer = true;
	}
	const todayKey = isoDate();
	const todayActive = (todayCell?.units || 0) >= STREAK_MIN;
	const hadHistory = grid.columns.flat().some((c) => c.key < todayKey && c.units >= STREAK_MIN);
	const comeback = todayActive && stats.current === 1 && hadHistory;
	if (comeback && engines.todo.SyncEngine.get("user", "partnerComeback") !== todayKey) {
		engines.todo.SyncEngine.set("user", "partnerComeback", todayKey);
		partnerCheer = true;
	}
	let plan = engines.todo.SyncEngine.get("user", "partnerPlan");
	try {
		if (typeof plan === "string") plan = JSON.parse(plan);
	} catch {
		plan = null;
	}
	const planText = plan && plan.date === todayKey && plan.taskId && task(plan.taskId) && !task(plan.taskId).done ? plan.text : "";
	const tomorrow = tomorrowKey();
	const tomorrowBooked = tasks.some((t) => !t.done && t.scheduleId && normalizeDateKey(t.dueKey) === tomorrow);
	const moment = momentFor({ mood: broadcastMood, day: now.getDay(), hour: now.getHours(), streak: stats.current, todayActive: (todayCell?.units || 0) >= STREAK_MIN, milestone, pct: s.pct, tomorrowBooked, billable: s.billable, comeback, overCeiling: s.billable >= weeklyCeiling(), plan: planText });
	const vars = { plan: planText, left: formatUnits(Math.max(0, s.target - s.billable)), gap: formatUnits(Math.max(0, s.expected - s.billable)), ahead: formatUnits(Math.max(0, s.billable - s.expected)), billable: formatUnits(s.billable), target: formatUnits(s.target), streak: milestone || stats.current };
	const key = moment + isoDate() + partnerIntensity();
	if (partnerLine.key !== key) {
		const line = pickLine(moment, vars, { date: isoDate(), used: [...partnerUsed], intensity: partnerIntensity() });
		partnerUsed.add(line.id);
		partnerLine = { key, line, moment, vars };
	}
	const focusable = activeTask();
	partnerCta = nextStep({ task: focusable && !focusable.done ? focusable : null, moment, hasOpenTasks: unfinishedToday().length > 0 });
	return partnerLine.line.text;
}
function advancePartnerLine() {
	if (!partnerLine.moment) return;
	const line = pickLine(partnerLine.moment, partnerLine.vars, { date: isoDate() + partnerUsed.size, used: [...partnerUsed], intensity: partnerIntensity() });
	partnerUsed.add(line.id);
	partnerLine.line = line;
	broadcastLine = line.text;
}
function renderReview() {
	const day = new Date().getDay();
	const week = isoDate(weekStart(new Date()));
	if (docketOffset !== 0 || (day !== 1 && day !== 2) || engines.todo.SyncEngine.get("user", "partnerReview") === week) return "";
	const last = docketData(-1).summary;
	if (!last.entries.length) return "";
	const review = weeklyReview(last, { streak: heatInfo().stats.current });
	const from = localDate(weekKeys(new Date(Date.now() - 7 * 864e5))[0]), to = localDate(weekKeys(new Date(Date.now() - 7 * 864e5))[6]);
	return '<section class="surface review-card ' + review.tone + '" aria-label="Last week\u2019s performance review"><div><p class="eyebrow">Performance review \u00b7 ' + monthDay(from) + " \u2013 " + monthDay(to) + '</p><h2>' + review.verdict + '</h2><p class="review-hours"><b>' + formatUnits(last.billable) + "</b> of " + formatUnits(last.target) + " billable hours \u00b7 " + review.pct + "%</p>" + (review.notes.length ? "<ul>" + review.notes.map((n) => "<li>" + esc(n) + "</li>").join("") + "</ul>" : "") + '</div><button class="text-button" data-action="review-dismiss" data-week="' + week + '">Noted</button></section>';
}
function docketNarration(s) {
	if (docketOffset < 0) return "That week closed at " + formatUnits(s.billable) + " of " + formatUnits(s.target) + " hours.";
	if (docketOffset > 0) return "Nothing billed yet. Plan the week before it plans you.";
	const gap = Math.round((s.expected - s.billable) * 10) / 10;
	if (s.pace === "behind") return formatUnits(gap) + " hours behind pace. Close it before Sunday.";
	if (s.pace === "ahead") return formatUnits(-gap) + " hours ahead of pace. Do not coast.";
	return "Right on pace. Hold the line.";
}
function docketInsight(s) {
	if (!s.entries.length) return "";
	const b = s.byKind;
	const late = lateNightHours(s.entries);
	if (docketOffset === 0 && late >= 0.5) return formatUnits(late) + " h billed after midnight this week. Sleep under six hours costs grades; move that work earlier.";
	const mix = practiceShare(s);
	if (mix.independent >= 3 && mix.share < PRACTICE_GOAL) return "Practice is " + Math.round(mix.share * 100) + "% of your independent time. Aim for a fifth: practice questions beat rereading.";
	if (docketOffset === 0 && b.reading > 0 && b.study === 0) return "No study time yet. Practice questions or outlining would balance the reading.";
	if (docketOffset === 0 && b.reading + b.study > 6 && b.writing === 0) return "No writing time yet. A short memo or case comment keeps the skill warm.";
	const top = ["reading", "study", "practice", "writing"].sort((a, c) => b[c] - b[a])[0];
	return b[top] ? "Most of your independent time went to " + KIND_LABEL[top].toLowerCase() + "." : "";
}
function docketCompare(s) {
	if (docketOffset !== 0) return "";
	const past = [-1, -2, -3, -4].map((o) => docketData(o).summary).filter((w, i) => i === 0 || w.billable > 0);
	const c = comparison(s, past);
	const chase = c.beaten ? '<span class="good">Beat last week</span>' : c.last > 0 ? "<span><b>" + formatUnits(c.toBeat) + "</b> h to beat last week</span>" : "";
	return '<div class="docket-compare">' + chase + "<span><b>" + formatUnits(c.toTarget) + "</b> h to target</span><span>Last week <b>" + formatUnits(c.last) + "</b></span><span>4-week avg <b>" + formatUnits(c.average) + "</b></span></div>";
}
function docketGauge(s, keys) {
	const arc = 251.3, fraction = s.target ? Math.min(1, s.expected / s.target) : 0;
	const point = (r) => [100 - r * Math.cos(fraction * Math.PI), 105 - r * Math.sin(fraction * Math.PI)];
	const [x1, y1] = point(68), [x2, y2] = point(96);
	const marker = docketOffset === 0 ? '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" class="gauge-marker"/>' : "";
	return '<svg viewBox="0 0 200 124" role="img" aria-label="' + formatUnits(s.billable) + " of " + formatUnits(s.target) + ' billable hours"><defs><linearGradient id="gaugeFill" x1="0" x2="1"><stop offset="0" stop-color="#b48aff"/><stop offset="1" stop-color="#7132ec"/></linearGradient></defs><path class="gauge-track" d="M20 105 A80 80 0 0 1 180 105"/><path class="gauge-fill" d="M20 105 A80 80 0 0 1 180 105" stroke-dasharray="' + (arc * s.pct) / 100 + " " + arc + '"/>' + marker + [0.25, 0.5, 0.75].map((f) => { const a = f * Math.PI, c = Math.cos(a), sn = Math.sin(a); return '<line class="gauge-tick' + (s.pct >= f * 100 ? " hit" : "") + '" x1="' + (100 - 90 * c) + '" y1="' + (105 - 90 * sn) + '" x2="' + (100 - 96 * c) + '" y2="' + (105 - 96 * sn) + '"/>'; }).join("") + '<text x="100" y="92" text-anchor="middle" class="gauge-value">' + formatUnits(s.billable) + '</text><text x="100" y="113" text-anchor="middle" class="gauge-of">of ' + formatUnits(s.target) + " hours</text></svg>";
}
function renderDocket() {
	const { keys, summary: s } = docketData();
	const today = isoDate();
	const perDay = keys.map((key) => s.entries.filter((e) => e.kind !== "admin" && isoDate(new Date(e.start)) === key).reduce((sum, e) => sum + e.units, 0));
	const max = Math.max(6, ...perDay);
	const bars = keys.map((key, i) => '<div class="' + (key === today ? "today" : "") + '" style="height:' + Math.max(7, (perDay[i] / max) * 100) + "%" + (perDay[i] ? "" : ";background:var(--surface-3)") + '" title="' + formatUnits(perDay[i]) + ' h"></div>').join("");
	let lastDay = "";
	const confirmed = Object.fromEntries(Object.entries(checkIns()).filter(([, v]) => v.answer === "done"));
	const rows = [...s.entries].reverse().map((e) => {
		const d = new Date(e.start), day = isoDate(d), first = day !== lastDay;
		lastDay = day;
		const manual = e.source === "manual", auto = e.source === "scheduled";
		return '<div class="docket-row' + (e.live ? " live" : "") + '" data-ctx="docket" data-task-id="' + esc(e.taskId || "") + '" data-manual="' + (manual ? 1 : 0) + '" data-auto="' + (auto ? 1 : 0) + '"><span class="docket-date">' + (first ? "<b>" + d.toLocaleDateString("en-CA", { weekday: "short" }) + "</b>" + monthDay(d) : "") + '</span><span class="docket-desc">' + esc(e.description) + '<span class="docket-meta"><span class="kind-chip ' + e.kind + '">' + KIND_LABEL[e.kind] + "</span><span>" + clockTime(e.start) + " – " + (e.live ? "now" : clockTime(e.end)) + "</span>" + (manual ? "<span>Logged</span>" : "") + (auto ? '<span class="auto-chip" title="Counted from your schedule. Remove it if you did not do the work.">' + (e.live ? "Billing now" : confirmed[e.id] ? "Confirmed" : "Auto") + "</span>" : "") + (e.sessions > 1 ? "<span>" + e.sessions + " sessions</span>" : "") + (isLateNight(e) ? '<span class="late-chip">After midnight</span>' : "") + '</span></span><span class="docket-units">' + formatUnits(e.units) + (manual ? '<button class="icon-button docket-remove" data-action="docket-remove" data-id="' + esc(e.id) + '" aria-label="Remove this entry">' + icon("close") + "</button>" : auto ? '<button class="icon-button docket-remove" data-action="docket-dismiss" data-id="' + esc(e.id) + '" aria-label="Remove this automatic entry" title="Did not do it? Remove it">' + icon("close") + "</button>" : "") + "</span></div>";
	}).join("");
	const first = localDate(keys[0]), last = localDate(keys[6]);
	const pace = docketOffset === 0 && s.billable >= weeklyCeiling() ? '<span class="behind">Past your ' + formatUnits(weeklyCeiling()) + " h ceiling. Rest.</span>" : docketOffset === 0 ? (s.pace === "ahead" ? '<span class="ahead">' + formatUnits(s.billable - s.expected) + " h ahead of pace</span>" : s.pace === "behind" ? '<span class="behind">' + formatUnits(s.expected - s.billable) + " h behind pace</span>" : '<span class="ahead">On pace</span>') : "<span>" + formatUnits(s.remaining) + " h short of target</span>";
	broadcastPose = "";
	broadcastMood = moodFor(s, { current: docketOffset === 0, sunday: new Date().getDay() === 0 });
	partnerCta = null;
	broadcastLine = docketOffset === 0 ? partnerVoice(s) : docketNarration(s);
	const insight = docketInsight(s);
	const legend = KINDS.filter((k) => k !== "admin").map((k) => '<span><i class="kind-dot ' + k + '"></i>' + KIND_LABEL[k] + " <b>" + formatUnits(s.byKind[k]) + "</b></span>").join("");
	return renderReview() + renderConsistency() + '<div class="docket-layout"><div class="docket-side"><section class="surface docket-gauge"><div class="docket-top"><p class="eyebrow">Billable this week</p><button class="text-button" data-action="docket-target">Target ' + formatUnits(s.target) + " h</button></div>" + docketGauge(s, keys) + '<p class="docket-pace">' + pace + '</p>' + docketCompare(s) + '<div class="docket-bars">' + bars + '</div><div class="docket-days">' + "MTWTFSS".split("").map((l) => "<span>" + l + "</span>").join("") + '</div><div class="docket-legend">' + legend + "</div></section>" + (broadcastVisible() ? broadcastMarkup() : "") + '</div><section class="surface docket-main"><div class="docket-head"><div><p class="eyebrow">Weekly docket</p><h2>' + monthDay(first) + " – " + monthDay(last) + '</h2></div><div class="docket-actions"><button class="icon-button flip" data-action="docket-week" data-step="-1" aria-label="Previous week">' + icon("right") + "</button>" + (docketOffset ? '<button class="text-button" data-action="docket-week" data-step="0">This week</button>' : "") + '<button class="icon-button" data-action="docket-week" data-step="1" aria-label="Next week">' + icon("right") + '</button><button class="primary" data-action="docket-log">Log time</button></div></div>' + (rows || '<p class="docket-empty">No hours yet this week. Scheduled study blocks count as their time passes; focus sessions and logged time count too.</p>') + (insight ? '<p class="docket-insight"><span class="eyebrow">Mix</span>' + esc(insight) + "</p>" : "") + '<div class="docket-total"><span>Total billable</span><b>' + formatUnits(s.billable) + "</b></div></section></div>";
}
let heatCache = { key: "", value: null }, heatAnimated = false;
function firstActivityKey() {
	let sessions = focusSessionsRaw();
	try {
		if (typeof sessions === "string") sessions = JSON.parse(sessions);
	} catch {
		sessions = [];
	}
	const firstAt = Math.min(...(Array.isArray(sessions) ? sessions : []).map((x) => Number(x?.completedAt) || Infinity));
	return Number.isFinite(firstAt) ? isoDate(new Date(firstAt)) : isoDate(weekStart(new Date()));
}
function heatInfo() {
	const today = isoDate();
	const key = String(focusSessionsRaw() || "") + today + weeklyTarget() + Math.floor(Date.now() / 120000) + docketExcluded().join() + tasks.map((t) => t.id + (t.done ? 1 : 0) + (t.scheduledStart || "")).join();
	if (heatCache.value && heatCache.key === key) return heatCache.value;
	const now = new Date();
	/* Class time only counts from the first recorded session, so recurring
	   blocks do not invent history from before the app was in use. */
	const since = firstActivityKey();
	/* Show the weeks you have actually used, from six up to the full span. */
	const weeks = Math.max(6, Math.min(HEAT_WEEKS, Math.round((weekStart(now) - weekStart(localDate(since))) / (7 * 864e5)) + 1));
	const keys = heatRange(today, weeks);
	const events = keys.filter((k) => k <= today && k >= since).flatMap((k) => occurrences(localDate(k)));
	const totals = dayTotals(billedEntries(events, now));
	const dailyTarget = weeklyTarget() / 5;
	const grid = heatCells({ totals, today, weeks, dailyTarget });
	const stats = streakStats(totals, keys, today, STREAK_MIN);
	heatCache = { key, value: { grid, stats, dailyTarget, weeks } };
	return heatCache.value;
}
function renderConsistency() {
	const { grid, stats, dailyTarget, weeks } = heatInfo();
	const recess = new Set(stats.recessDays);
	const animate = !heatAnimated;
	heatAnimated = true;
	const recent = grid.columns.slice(-4).flat().filter((c) => !c.future);
	const month = isoDate().slice(0, 7);
	const activeThisMonth = grid.columns.flat().filter((c) => !c.future && c.key.startsWith(month) && c.units >= STREAK_MIN).length;
	const onTarget = recent.filter((c) => c.level === 4).length;
	const label = (c) => localDate(c.key).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" }) + (c.future ? "" : " · " + formatUnits(c.units) + " h");
	const cells = grid.columns.map((column, w) => column.map((c) => '<i class="heat-cell l' + c.level + (c.today ? " today" : "") + (c.future ? " future" : "") + (recess.has(c.key) ? " recess" : "") + '" style="--c:' + w + '" title="' + esc(label(c) + (recess.has(c.key) ? " · recess day" : "")) + '"></i>').join("")).join("");
	const months = grid.months.map((m) => '<span style="grid-column:' + (m.week + 1) + '">' + m.label + "</span>").join("");
	const legend = [0, 1, 2, 3, 4].map((l) => '<i class="heat-cell l' + l + '"></i>').join("");
	return '<section class="surface consistency" aria-label="Consistency"><div class="streak">' + (stats.current === 0 ? '<p class="eyebrow">Fresh start</p><div class="streak-num restart">Day 1<small>starts with ' + STREAK_MIN + " billable hours</small></div>" : '<p class="eyebrow">Current streak</p><div class="streak-num">' + stats.current + "<small>" + (stats.current === 1 ? "day" : "days") + "</small></div>") + '<div class="milestone"><div class="milestone-bar" role="progressbar" aria-label="Progress to the next milestone" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + stats.progress + '"><i style="width:' + stats.progress + '%"></i></div><small>' + (stats.current === 0 ? "Bill " + STREAK_MIN + " hours today to start it" : Math.max(0, stats.next - stats.current) + (stats.next - stats.current === 1 ? " day" : " days") + " to " + stats.next) + '</small></div><div class="streak-meta"><span>Best <b>' + stats.best + "</b></span><span><b>" + activeThisMonth + "</b> active " + (activeThisMonth === 1 ? "day" : "days") + " this month</span><span><b>" + onTarget + "</b>" + (onTarget === 1 ? " on-target day" : " on-target days") + ' in 4 weeks</span></div><p class="streak-note">A day counts at ' + STREAK_MIN + " billable hours. Weekends never break it, and one missed weekday a week is a recess day.</p><p class=\"streak-recess " + (stats.recessLeft ? "" : "used") + "\">" + (stats.recessLeft ? "Recess day available this week" : "Recess day used this week") + "</p></div>" +
		'<div class="heat' + (animate ? " animate" : "") + '" style="--weeks:' + weeks + (weeks <= 10 ? ";--cell:30px" : "") + '" role="img" aria-label="Billable hours per day over the last ' + weeks + ' weeks. Current streak ' + stats.current + ' days."><div class="heat-months">' + months + '</div><div class="heat-body"><div class="heat-days"><span>M</span><span></span><span>W</span><span></span><span>F</span><span></span><span></span></div><div class="heat-grid">' + cells + '</div></div><div class="heat-legend"><span>Less</span>' + legend + "<span>More</span><small>Full colour = " + formatUnits(dailyTarget) + " h</small></div></div></section>";
}
function openTarget() {
	const d = openDialog("#settingsDialog", dialogHead("Weekly target", "settingsTitle") + '<p class="muted">Billable hours per week: class, reading, study and writing. Admin is tracked but not counted.</p><form id="targetForm" class="settings-links"><label class="field">Hours per week<input name="hours" type="number" min="5" max="80" step="0.5" value="' + weeklyTarget() + '"></label><label class="field">Weekly ceiling<input name="ceiling" type="number" min="20" max="100" step="1" value="' + weeklyCeiling() + '"></label><p class="muted">Above the ceiling Broadcast tells you to rest instead of pushing.</p><button class="primary">Save target</button></form>');
	$("#targetForm").onsubmit = (e) => {
		e.preventDefault();
		engines.todo.SyncEngine.set("todo", "weeklyHours", Math.min(80, Math.max(5, Number(e.target.elements.hours.value) || WEEKLY_TARGET)));
		engines.todo.SyncEngine.set("todo", "weeklyCeiling", Math.min(100, Math.max(20, Number(e.target.elements.ceiling.value) || 55)));
		d.close();
		signature = "";
		refresh();
	};
}
function openLogTime(prefillId = "") {
	const options = focusTasks(tasks, courses).filter((t) => !t.done || t.id === prefillId);
	const nowDate = new Date();
	const d = openDialog("#editorDialog", dialogHead("Log time", "editorTitle") + '<form id="logForm" class="log-form"><label class="field wide">Task<select name="task"><option value="">Something else</option>' + options.map((t) => '<option value="' + esc(t.id) + '" ' + (t.id === prefillId ? "selected" : "") + ">" + esc(t.text) + "</option>").join("") + '</select></label><label class="field wide">What did you work on?<input name="note" maxlength="200" autocomplete="off" placeholder="Reviewed Donoghue v Stevenson and outlined the neighbour principle"></label><div class="field wide tag-field">' + tagPicker({ current: "study", action: "tag-pick", kinds: KINDS.filter((k) => k !== "class"), reset: false }) + '</div><div class="field wide"><span class="field-label">Time spent</span><div class="hour-picker">' + [0.5, 1, 1.5, 2, 3].map((v) => '<button type="button" data-hours="' + v + '">' + formatUnits(v) + "</button>").join("") + '<input name="hours" type="number" min="0.1" max="16" step="0.1" value="1" aria-label="Hours"><span>hours</span></div></div><div class="form-grid"><label class="field">Finished<input name="time" type="time" value="' + timeString(nowDate.getHours() * 60 + nowDate.getMinutes()) + '"></label><label class="field">Date<input name="date" type="date" value="' + isoDate() + '"></label></div><div class="log-preview" id="logPreview" aria-live="polite"></div><p class="form-error" id="logError" role="alert"></p><div class="dialog-actions"><button type="button" data-action="close-dialog">Cancel</button><button type="submit" class="primary">Log time</button></div></form>');
	const f = d.querySelector("form").elements;
	let kind = "study", manualKind = false;
	const picked = () => options.find((t) => t.id === f.task.value);
	const update = () => {
		const t = picked();
		if (!manualKind) kind = t ? taskKind(t) : classifyText(f.note.value);
		paintTag(d.querySelector(".tag-box"), kind, null);
		d.querySelectorAll("[data-hours]").forEach((b) => b.classList.toggle("on", Number(b.dataset.hours) === Number(f.hours.value)));
		const hours = Number(f.hours.value) || 0, end = new Date(f.date.value + "T" + f.time.value);
		const start = new Date(end.getTime() - hours * 3600000);
		$("#logPreview").innerHTML = '<b>' + formatUnits(hours) + ' h</b><span class="kind-chip ' + kind + '">' + KIND_LABEL[kind] + "</span><span>" + (isNaN(end) ? "" : clockTime(start) + " – " + clockTime(end)) + "</span><small>" + (BILLABLE.has(kind) ? "Counts towards your target" : "Tracked, not billable") + "</small>";
	};
	f.task.onchange = () => {
		const t = picked();
		if (t && duration(t)) f.hours.value = formatUnits(duration(t) / 60);
		update();
	};
	f.note.oninput = update;
	f.hours.oninput = f.time.oninput = f.date.oninput = update;
	onTagChange(d, (e) => { if (e.detail.kind) { kind = e.detail.kind; manualKind = true; update(); } });
	d.querySelectorAll("[data-hours]").forEach((b) => (b.onclick = () => { f.hours.value = b.dataset.hours; update(); }));
	f.task.onchange();
	f.note.focus();
	d.querySelector("form").onsubmit = (e) => {
		e.preventDefault();
		try {
			const t = picked();
			if (!t && !f.note.value.trim()) throw new Error("Describe the work in a few words.");
			const end = new Date(f.date.value + "T" + f.time.value).getTime();
			if (!end) throw new Error("Choose when you finished.");
			const session = manualSession({ taskId: t?.id || "", minutes: minutesFor(Number(f.hours.value)), note: f.note.value, kind, endAt: end });
			const before = focusSessionsRaw();
			saveSessions(appendSession(before, session));
			docketOffset = Math.round((weekStart(new Date(end)) - weekStart(new Date())) / (7 * 86400000));
			d.close();
			if (view !== "docket") setView("docket"); else { signature = ""; refresh(); }
			notify("Logged " + formatUnits(minutesFor(Number(f.hours.value)) / 60) + " h.", () => { saveSessions(before); $("#toast").hidden = true; });
		} catch (error) {
			$("#logError").textContent = error.message;
		}
	};
}
/* Why Focus is on this task, in a few words. */
function focusReason(choice, now = Date.now()) {
	const t = choice.task, b = choice.block;
	if (!t) return "";
	const span = b ? `${clockTime(b[0])}–${clockTime(b[1])}` : "";
	const billing = b && b[0] <= now && now < b[1] && BILLABLE.has(taskKind(t)) ? '<span class="focus-billing">Billing automatically</span>' : "";
	const text =
		choice.reason === "now" ? `On your schedule now · ${span} · ${formatMinutes(Math.max(1, Math.round((b[1] - now) / 60000)))} left`
		: choice.reason === "over" ? `Ran over · was booked ${span}`
		: choice.reason === "next" ? `Next on your schedule · starts ${clockTime(b[0])}, in ${formatMinutes(Math.max(1, Math.round((b[0] - now) / 60000)))}`
		: choice.reason === "session" ? `In session${span ? ` · booked ${span}` : ""}`
		: choice.reason === "chosen" ? `Your pick${span ? ` · booked ${span}` : ""}`
		: `${t.pri === "should" ? "Should" : "Must"} do today · not scheduled`;
	return `<p class="focus-reason">${esc(text)}${billing}</p>`;
}
/* When a session or a pick holds Focus, say what the schedule has on now. */
function focusNudge(choice, now = Date.now()) {
	if (choice.reason !== "session" && choice.reason !== "chosen") return "";
	const live = focusPick(focusTasks(tasks, courses), { now });
	if (live.reason !== "now" || live.task.id === choice.task?.id) return "";
	return `<div class="focus-nudge">${icon("calendar")}<span>Booked now: <b>${esc(live.task.text)}</b> ${clockTime(live.block[0])}–${clockTime(live.block[1])}</span><button data-action="select-focus" data-id="${esc(live.task.id)}">Switch</button></div>`;
}
/* Focus runs one sprint at a time. A long task is cut into sprints with a break between them, because
   attention fades over a long unbroken block. How long a sprint can be depends on the day: longer when
   nothing is booked, shorter before a class or booked block. The length comes from the task and the
   schedule, never from what is left of today's block, so the timer, the plan and the subtitle agree. */
const paceMemo = { key: "", samples: [], names: [] };
function paceModel() {
	let raw = engines.clock?.SyncEngine.get("clock", "focus_sessions");
	const key = `${tasks.length}|${tasks.filter((t) => t.done).length}|${String(raw || "").length}|${courses.length}`;
	if (paceMemo.key !== key) {
		try {
			if (typeof raw === "string") raw = JSON.parse(raw);
		} catch {
			raw = [];
		}
		paceMemo.names = [...new Set(courses.map((c) => c.name).filter(Boolean))];
		paceMemo.samples = paceSamples({ tasks, sessions: Array.isArray(raw) ? raw : [], pagesOf: (t) => Reading.estimate(t.text, t.reading || {})?.pages || 0, names: paceMemo.names });
		paceMemo.key = key;
	}
	return paceMemo;
}
const paceFor = (t) => {
	const m = paceModel();
	return learnedPace(m.samples, courseOfTask(t.text, m.names));
};
/* What the task is worth in minutes, at your own pace when the estimate is automatic. */
function planBase(t) {
	const reading = t.reading || {};
	const learned = paceFor(t);
	const auto = !reading.manual && !(Number(reading.pace) > 0);
	const e = Reading.estimate(t.text, auto ? { ...reading, pace: learned.pace } : reading);
	const total = auto && e?.minutes ? e.minutes : duration(t) || e?.minutes || 0;
	return { reading: !!e?.pages, total, learned, e, auto };
}
function commitmentsFor(t, now = Date.now()) {
	const midnight = new Date(localDate(isoDate())).setHours(0, 0, 0, 0);
	const events = occurrences(new Date()).map((e) => ({ start: midnight + minutes(e.start) * 60000, name: e.name }));
	const blocks = tasks.filter((x) => !x.done && x.id !== t.id && blockOf(x)).map((x) => ({ start: blockOf(x)[0], name: x.text }));
	return nextCommitment(now, [...events, ...blocks]);
}
function capFor(t, base = planBase(t)) {
	const next = commitmentsFor(t);
	const remaining = Math.max(0, base.total - focusMinutes(t.id));
	return { ...sprintCap({ free: next.free, remaining }), name: next.name };
}
/* The sprint length the whole plan is built on. A class or booking trims only the sprint that is about to
   run, so it must not shrink every sprint after the break. */
const planMax = (cap) => (cap.mode === "tight" ? SPRINT.max : cap.max);
function planFor(t) {
	const base = planBase(t), cap = capFor(t, base);
	return { ...base, cap, plan: sessionPlan({ minutes: base.total, start: base.e?.start ?? null, end: base.e?.end ?? null, max: planMax(cap) }) };
}
const sprintFocus = (t) => {
	const base = planBase(t), cap = capFor(t, base), block = focusLength(t);
	/* Once a plan is saved, the timer follows the sprint you are on, so it matches the row. */
	const open = (t.subs || []).find((x) => !x.done && /^Sprint \d+/i.test(x.text || ""));
	const row = Number(open?.text.match(/\((\d+) min\)\s*$/)?.[1]);
	if (row > 0) return Math.max(5, Math.min(row, block, cap.mode === "tight" ? cap.max : row));
	const whole = base.total ? Math.min(sprintMinutes(base.total, planMax(cap)), block) : sprintMinutes(block, planMax(cap));
	return cap.mode === "tight" ? Math.min(whole, cap.max) : whole;
};
/* Which sprint you are on and how many there are. */
function sprintProgress(t) {
	const saved = (t.subs || []).filter((x) => /^Sprint \d+/i.test(x.text || ""));
	if (saved.length) return { count: saved.length, index: Math.min(saved.filter((x) => x.done).length + 1, saved.length) };
	const base = planBase(t);
	return { count: sprintCount(base.total || focusLength(t), planMax(capFor(t, base))), index: 1 };
}
function focusSubtitle(t) {
	const base = planBase(t), cap = capFor(t, base), total = base.total || focusLength(t), n = sprintCount(total, planMax(cap));
	return n === 1 ? `${sprintFocus(t)}-minute focus block` : `${n} sprints \u00b7 ${sprintMinutes(total, planMax(cap))} minutes each, with breaks`;
}
/* Why today's sprint is the length it is. */
function scheduleNote(t) {
	const cap = capFor(t);
	if (cap.mode === "open") return `Nothing booked ${cap.free === Infinity ? "for the rest of today" : `for ${formatMinutes(Math.round(cap.free))}`} \u00b7 sprints stretch to ${cap.max} minutes`;
	if (cap.mode === "tight") return `${cap.name ? esc(cap.name) : "Something"} starts in ${formatMinutes(Math.round(cap.free))} \u00b7 this sprint is trimmed to ${cap.max} minutes`;
	return "";
}
const sprintBadge = (t) => {
	const { count, index } = sprintProgress(t);
	return count > 1 ? `<p class="timer-sprint">Sprint ${index} of ${count}</p>` : "";
};
/* A timer saved before sprints still holds the whole task. */
function longTimerNotice(t, w) {
	const fresh = !w || (!w.studyActive && !w.tmRunning && w.tmRemaining === w.tmDuration);
	if (!t || fresh || w.tmDuration / 60 <= SPRINT.open + 5 || sprintCount(planBase(t).total || 0) < 2) return "";
	return `<div class="focus-nudge">${icon("clock")}<span>This timer was set for the whole task (${formatMinutes(Math.round(w.tmDuration / 60))}). Save the time so far and restart in ${sprintFocus(t)}-minute sprints.</span><button data-action="reset-timer">Switch to sprints</button></div>`;
}
/* After a sprint is ticked, work out your real pace and re-plan the sprints that are left. */
function replanTask(tid) {
	const t = task(tid);
	if (!t) return;
	const base = planBase(t);
	const next = replanRemaining({ subs: t.subs || [], taskId: t.id, spentMinutes: focusMinutes(t.id), priorPace: base.learned.pace, max: planMax(capFor(t, base)) });
	if (!next?.changed) return;
	engines.todo.TodoUIBridge.command.update(t.id, { subs: next.subs });
	signature = "";
	refresh();
	if (next.observed) notify(`You are reading at ${next.observed.toFixed(1)} minutes a page, so the next sprints are re-planned.`);
}
/* Sprints tick themselves once the focus time on a task covers them, so the plan keeps up with you.
   It only ever ticks, never unticks, and it looks again only when more time has been logged. */
const autoTickMemo = new Map();
function autoTickSprints() {
	const t = activeTask();
	if (!t || !t.subs?.length) return;
	const spent = focusMinutes(t.id);
	const key = String(spent);
	if (autoTickMemo.get(t.id) === key) return;
	autoTickMemo.set(t.id, key);
	let covered = 0, ticked = 0;
	for (const sub of t.subs) {
		const m = String(sub.text || "").match(/^Sprint \d+.*\((\d+) min\)\s*$/i);
		if (!m) continue;
		covered += Number(m[1]);
		if (!sub.done && spent >= covered * 0.9) {
			engines.todo.TodoUIBridge.command.subtask(t.id, sub.id);
			ticked++;
		}
	}
	if (ticked)
		setTimeout(() => {
			signature = "";
			refresh();
			replanTask(t.id);
		}, 0);
}
/* The last page of the furthest sprint you have ticked, for "Split off the rest". */
function sprintLastPage(t, reading) {
	let last = 0;
	for (const sub of t.subs || []) {
		const m = sub.done && String(sub.text || "").match(/^Sprint \d+:?\s*pp?\.\s*(\d+)(?:[\u2013-](\d+))?/i);
		if (m) last = Math.max(last, Number(m[2] || m[1]));
	}
	return last >= reading.start && last < reading.end ? last : null;
}
const breakLabel = (m) => `<li class="plan-break"><i></i><span><b>${m} min break</b><small>${m > SPRINT.breakMin ? "Walk, eat, step away from the desk" : "Stand up, look into the distance"}</small></span></li>`;
/* One row of the plan: a badge or a tick, what to read, and how long. */
function planRow({ lead, title, detail, minutes, state, id, label }) {
	const mark = id
		? `<button class="plan-check ${state === "done" ? "checked" : ""}" data-action="subtask" data-sub-id="${esc(id)}" aria-label="${state === "done" ? "Reopen" : "Complete"} step: ${esc(label)}">${state === "done" ? icon("check") : ""}</button>`
		: `<span class="plan-badge">${lead}</span>`;
	return `<li class="plan-row is-${state}">${mark}<span class="plan-text"><b>${esc(title)}</b>${detail ? `<small>${esc(detail)}</small>` : ""}</span>${minutes ? `<span class="plan-min">${minutes} min</span>` : ""}</li>`;
}
function describeStep(sub) {
	const text = String(sub.text || "");
	const sprint = text.match(/^Sprint (\d+):?\s*(.*?)\s*\((\d+) min\)\s*$/i);
	if (sprint) return { title: `Sprint ${sprint[1]}`, detail: sprint[2], minutes: Number(sprint[3]) };
	if (/^Close the book/i.test(text)) return { title: "Recall", detail: "Close the book and write the rule and the holding from memory", minutes: 5 };
	const timed = text.match(/^(.*?)\s*\((\d+) min\)\s*$/);
	return timed ? { title: timed[1], detail: "", minutes: Number(timed[2]) } : { title: text, detail: "", minutes: 0 };
}
const titleCase = (text) => text.replace(/\b[a-z]/g, (c) => c.toUpperCase());
/* What the plan is based on, so the estimate is never a mystery. */
function paceLine(learned) {
	const readings = (n) => `${n} ${n === 1 ? "reading" : "readings"}`;
	if (learned.source === "course") return `Your ${titleCase(learned.course)} pace \u00b7 ${learned.pace} min a page from ${readings(learned.n)}`;
	if (learned.source === "overall") return `Your pace \u00b7 ${learned.pace} min a page across ${readings(learned.n)}`;
	return `Starting pace \u00b7 ${learned.pace} min a page. It learns yours as you finish readings.`;
}
function stepsPanel(current, subs) {
	if (!current) return '<section class="session-steps plan-card"><div class="plan-head"><div><span class="plan-eyebrow">Plan</span><b>Choose a task to see its plan</b></div></div></section>';
	const { reading, total, plan, learned, auto } = planFor(current);
	const tip = reading ? `<p class="plan-tip">Skim the headings. Read for the one rule this adds. Then close the book and say it back.</p><p class="plan-pace">${esc(paceLine(learned))}</p>` : "";
	const refresh = reading && auto && learned.source !== "default" && total !== duration(current) ? `<button data-action="adopt-pace">Update estimate to ${formatMinutes(total)}</button>` : "";
	const generated = (!subs.length || oversizedSteps(subs)) && (reading || total > SPRINT.single);
	const sprints = (generated ? plan : subs).filter((x) => (generated ? x.kind === "sprint" : /^Sprint \d+/i.test(x.text || ""))).length;
	let list = "", meter = "";
	if (generated) {
		meter = sprints > 1 ? `<div class="plan-meter">${"<i></i>".repeat(sprints)}</div>` : "";
		list = plan.map((r) => planRow({ lead: r.kind === "recall" ? icon("check") : r.index, ...describeStep({ text: r.text }), state: r.index === 1 ? "current" : "next" }) + (r.breakAfter ? breakLabel(r.breakAfter) : "")).join("");
		return `<section class="session-steps plan-card"><div class="plan-head"><div><span class="plan-eyebrow">${reading ? "Reading plan" : "Plan"}</span><b>${formatMinutes(total)}${sprints ? ` \u00b7 ${sprints} ${sprints === 1 ? "sprint" : "sprints"}` : ""}</b></div>${meter}</div>${tip}<ol class="plan-list">${list}</ol><div class="plan-actions">${refresh}<button class="primary" data-action="adopt-plan">Use this plan</button></div></section>`;
	}
	if (!subs.length)
		return `<section class="session-steps plan-card"><div class="plan-head"><div><span class="plan-eyebrow">Plan</span><b>No steps yet</b></div></div>${tip}<p class="plan-tip">Add the steps that will help you finish this task.</p><div class="plan-actions">${refresh}<button data-action="edit" data-id="${esc(current.id)}">Add session steps</button></div></section>`;
	const firstOpen = subs.findIndex((x) => !x.done);
	list = subs.map((sub, i) => planRow({ ...describeStep(sub), id: sub.id, label: sub.text, state: sub.done ? "done" : i === firstOpen ? "current" : "next" }) + (breakAfterStep(subs, i) ? breakLabel(breakAfterStep(subs, i)) : "")).join("");
	meter = sprints > 1 ? `<div class="plan-meter">${subs.filter((x) => /^Sprint \d+/i.test(x.text || "")).map((x) => `<i class="${x.done ? "on" : ""}"></i>`).join("")}</div>` : "";
	return `<section class="session-steps plan-card"><div class="plan-head"><div><span class="plan-eyebrow">${reading ? "Reading plan" : "Plan"}</span><b>${subs.filter((x) => x.done).length} of ${subs.length} done</b></div>${meter}</div>${tip}<ol class="plan-list">${list}</ol>${refresh ? `<div class="plan-actions">${refresh}</div>` : ""}</section>`;
}
/* Today's finish line: each priority with its tasks, so the list is the checklist. */
function finishGroups() {
	const list = todayTasks(focusTasks(tasks, courses));
	const label = { must: "Must Do", should: "Should Do", could: "Could Do" };
	return ["must", "should", "could"]
		.map((pri) => {
			const items = list.filter((t) => (t.pri === "should" || t.pri === "could" ? t.pri : "must") === pri);
			const shown = items.slice().sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0)).slice(0, 5);
			const rows = shown
				.map((t) => `<li class="fl-item ${t.done ? "is-done" : ""}"><button class="fl-check ${t.done ? "checked" : ""}" data-action="toggle" data-id="${esc(t.id)}" aria-label="${t.done ? "Reopen" : "Complete"} ${esc(t.text)}">${t.done ? icon("check") : ""}</button><button class="fl-text" data-action="select-focus" data-id="${esc(t.id)}" title="Focus on this${notionLink(t) ? "; Ctrl-click opens Notion" : ""}" ${notionLink(t) ? `data-notion-url="${esc(notionLink(t))}"` : ""}>${esc(t.text)}</button>${duration(t) ? `<small>${formatMinutes(duration(t))}</small>` : ""}</li>`)
				.join("");
			const more = items.length > shown.length ? `<li class="fl-more">+${items.length - shown.length} more</li>` : "";
			return `<div class="fl-group ${pri}"><div class="fl-head"><i></i><b>${label[pri]}</b><span>${items.filter((t) => t.done).length} of ${items.length}</span></div>${items.length ? `<ul class="fl-list">${rows}${more}</ul>` : '<p class="fl-empty">Nothing here today</p>'}</div>`;
		})
		.join("");
}
function renderFocus() {
	const choice = focusChoice(),
		current = choice.task,
		after = current && blockOf(current) ? Math.max(Date.now(), blockOf(current)[1]) : Date.now(),
		next = focusPick(focusTasks(tasks, courses).filter((t) => t.id !== current?.id), { now: after }).task,
		events = occurrences(new Date()),
		now = new Date().getHours() * 60 + new Date().getMinutes(),
		nextEvent = events.find((e) => minutes(e.start) > now),
		subs = current?.subs || [];
	return `<div class="focus-layout"><section class="surface focus-main"><p class="eyebrow">Current task</p><h2 ${current && notionLink(current) ? `data-notion-url="${esc(notionLink(current))}" title="Ctrl-click to open in Notion"` : ""}>${esc(current?.text || "Room to focus")}${current && notionLink(current) ? `<a class="focus-notion" href="${esc(notionLink(current))}" target="_blank" rel="noopener" title="Open the lecture in Notion" aria-label="Open the lecture in Notion">${icon("link")}</a>` : ""}</h2>${current && readingWhen(current) ? `<p class="focus-when">${icon("calendar")}${esc(readingWhen(current))}</p>` : ""}${focusReason(choice)}<p class="focus-subtitle">${current ? focusSubtitle(current) : "Start a timer, or choose a task from Today"}</p>${current && scheduleNote(current) ? `<p class="focus-note">${scheduleNote(current)}</p>` : ""}${focusNudge(choice)}${longTimerNotice(current, engines.clock)}<div class="timer-art"><svg viewBox="0 0 240 240" aria-hidden="true"><circle class="timer-track" cx="120" cy="120" r="110"/><circle class="timer-progress" data-timer-ring cx="120" cy="120" r="110"/></svg><div><div class="timer-digits" data-timer>45:00</div><p class="timer-caption" data-phase>Ready to focus</p>${current ? sprintBadge(current) : ""}</div></div><div class="focus-controls"><button data-action="timer" data-timer-button>${icon("play")} Start focus</button><button class="primary" data-action="finish" data-finish>${icon("check")} Finish task</button><button data-action="reset-timer" title="End the session and save the time">End session</button></div><div class="break-actions" id="breakActions" hidden><span class="muted" style="font-size:12px">Your break is ready.</span><button data-action="flow">+15 min focus</button></div>${stepsPanel(current, subs)}</section><aside class="focus-sidebar"><section class="surface context-card"><p class="eyebrow">${icon("list")} Up next</p>${next ? `<div class="next-task"><button class="check-button" data-action="select-focus" data-id="${esc(next.id)}" aria-label="Select ${esc(next.text)}"></button><div><b>${esc(next.text)}</b><small>${duration(next) ? duration(next) + " min" : "No estimate"}</small></div></div>` : '<p class="muted" style="font-size:12px">No other commitments today.</p>'}</section><section class="surface context-card finish-context"><p class="eyebrow">${icon("flag")} Today’s finish line</p>${finishLine(true)}${finishGroups()}</section><section class="surface context-card next-scheduled"><p class="eyebrow">${icon("calendar")} Next scheduled</p><b>${esc(nextEvent?.name || "An open stretch")}</b><p>${nextEvent ? `${esc(nextEvent.start)} · ${formatMinutes(minutes(nextEvent.end) - minutes(nextEvent.start))}` : "No more scheduled blocks today."}</p></section></aside></div><div class="surface focus-agenda">${
		events
			.filter((e) => minutes(e.end) >= now)
			.slice(0, 3)
			.map(
				(e) =>
					`<div class="mini-event"><i></i><div><small>${esc(e.start)}</small><b>${esc(e.name)}</b><small>${formatMinutes(minutes(e.end) - minutes(e.start))}</small></div></div>`,
			)
			.join("") ||
		'<p class="muted" style="font-size:12px">Your remaining time is open.</p>'
	}</div>`;
}

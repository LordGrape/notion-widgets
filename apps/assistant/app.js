import {
	dailyGoal,
	dateKey,
	isoDate,
	localDate,
	normalizeDateKey,
	minutes,
	timeString,
	duration,
	todayTasks,
	intervals,
	gaps,
	validateSlot,
	escapeHtml as esc,
} from "./domain.mjs";
const WORKER = "https://widget-sync.lordgrape-widgets.workers.dev";
const SESSION_KEY = "command-centre-access-v1",
	THEME_KEY = "command-centre-theme-v1",
	REVISION = "20261001-live-calendar-v2";
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
	weekOffset = 0,
	collapsed = new Set(["could"]),
	signature = "",
	loadingTimer,
	pollTimer,
	lastFocus = null,
	toastTimer,
	lastTaskRaw;
let theme = document.documentElement.dataset.theme || "light";
const icons = {
	search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/>',
	sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
	moon: '<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z"/>',
	settings:
		'<path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
	clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
	calendar:
		'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
	play: '<path d="m8 4 12 8-12 8Z"/>',
	pause: '<path d="M8 5v14M16 5v14"/>',
	check: '<path d="m5 12 4 4L19 6"/>',
	more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
	chevron: '<path d="m6 9 6 6 6-6"/>',
	right: '<path d="m9 6 6 6-6 6"/>',
	plus: '<path d="M12 5v14M5 12h14"/>',
	reset: '<path d="M3 10a9 9 0 1 1 2 9M3 4v6h6"/>',
	grip: '<circle cx="8" cy="5" r="1"/><circle cx="16" cy="5" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="8" cy="19" r="1"/><circle cx="16" cy="19" r="1"/>',
	flag: '<path d="M5 21V3c5-3 9 3 14 0v10c-5 3-9-3-14 0"/>',
	list: '<path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1"/>',
	book: '<path d="M12 5v15M12 5C8 2 4 3 2 4v15c3-1 6-1 10 1 4-2 7-2 10-1V4c-2-1-6-2-10 1Z"/>',
	close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
function icon(name) {
	return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.clock}</svg>`;
}
function decorate(scope = document) {
	scope
		.querySelectorAll("[data-icon]")
		.forEach((n) => (n.innerHTML = icon(n.dataset.icon)));
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
function activeTask() {
	return (
		task(selectedId) ||
		todayTasks(tasks).find((t) => !t.done && t.pri !== "could") ||
		tasks.find((t) => !t.done)
	);
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
function notify(text, undo = false) {
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
	view = panel === "clock" ? "focus" : panel === "timetable" ? "plan" : "today";
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
	clearTimeout(loadingTimer);
	Object.keys(paths).forEach(
		(type) => ($(`#${type}Frame`).src = "about:blank"),
	);
	engines = {};
	tasks = [];
	courses = [];
	signature = "";
	selectedId = null;
	accessKey = "";
	sessionStorage.removeItem(SESSION_KEY);
	localStorage.removeItem(SESSION_KEY);
	$("#workspace").innerHTML =
		'<div class="loading-state">Loading your workspace…</div>';
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
	courses = engines.timetable.schedule || [];
	const raw = engines.todo.SyncEngine.get("todo", "dailyGoal");
	let setting;
	try {
		setting = typeof raw === "string" ? JSON.parse(raw) : raw;
	} catch {}
	target = setting?.date === dateKey() ? setting.count : 1;
	goal = dailyGoal(tasks, target);
	const context = engines.clock.SyncEngine.get("clock", "commandTask");
	if (!selectedId && context?.taskId && task(context.taskId))
		selectedId = context.taskId;
	const next = JSON.stringify([
		tasks,
		courses,
		raw,
		isoDate(),
		view,
		selectedId,
		weekOffset,
		[...collapsed],
	]);
	if (next !== signature) {
		signature = next;
		render();
	}
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
function setView(next) {
	view = next;
	signature = "";
	render();
}
function finishLine(compact = false) {
	return `<div class="finish-line ${compact ? "compact" : ""}"><div class="goal-label"><b>Daily finish line</b><button data-action="goal" title="Adjust today’s Should target">${goal.mustDone || 0} of ${goal.mustTotal || 0} Must · ${Math.min(goal.shouldDone || 0, goal.shouldTarget || 0)} of ${goal.shouldTarget || 0} Should</button></div><div class="progress-track" role="progressbar" aria-label="Daily finish line" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${goal.pct || 0}"><span style="width:${goal.pct || 0}%"></span></div></div>`;
}
function taskRow(t, planner = false) {
	const m = duration(t);
	return `<div class="task-row ${t.done ? "done" : ""}" data-task="${esc(t.id)}">${planner ? `<button class="drag-handle icon-button" draggable="true" data-drag="${esc(t.id)}" aria-label="Drag ${esc(t.text)} to the calendar">${icon("grip")}</button>` : ""}<button class="check-button ${t.done ? "checked" : ""}" data-action="toggle" data-id="${esc(t.id)}" aria-label="${t.done ? "Reopen" : "Complete"} ${esc(t.text)}">${t.done ? icon("check") : ""}</button><button class="task-title" data-action="edit" data-id="${esc(t.id)}">${esc(t.text)}${planner ? `<small class="planner-task-meta"><span class="priority-chip ${t.pri || "must"}">${t.pri === "could" ? "Could" : t.pri === "should" ? "Should" : "Must"}</span>${m ? `${m} min` : "No estimate"}</small>` : ""}</button>${!planner && m ? `<span class="task-meta">${icon("clock")}${m} min</span>` : ""}<div class="task-actions"><button class="icon-button" data-action="select-focus" data-id="${esc(t.id)}" aria-label="Focus on ${esc(t.text)}" title="Focus on this task">${icon("play")}</button><button class="icon-button" data-action="${planner ? "schedule" : "edit"}" data-id="${esc(t.id)}" aria-label="${planner ? "Schedule" : "Edit"} ${esc(t.text)}">${icon(planner ? "calendar" : "more")}</button></div></div>`;
}
function taskGroups() {
	const list = todayTasks(tasks).sort(
		(a, b) => (a.order ?? a.created) - (b.order ?? b.created),
	);
	return ["must", "should", "could"]
		.map((pri) => {
			const group = list.filter(
				(t) =>
					(t.pri === "should" || t.pri === "could" ? t.pri : "must") === pri,
			);
			const closed = collapsed.has(pri);
			return `<section class="task-group ${pri}"><button class="group-heading" data-action="collapse" data-priority="${pri}" aria-expanded="${!closed}">${icon(closed ? "right" : "chevron")}<i class="priority-dot"></i>${pri === "must" ? "Must Do" : pri === "should" ? "Should Do" : "Could Do"}<span class="count">${group.filter((t) => t.done).length} of ${group.length} complete</span></button>${closed ? "" : `<div class="task-rows">${group.length ? group.map((t) => taskRow(t)).join("") : `<p class="group-empty">${pri === "must" ? "No commitments here." : pri === "should" ? "Choose a task worth making progress on." : "Optional tasks, when you have room."}</p>`}</div>`}</section>`;
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
	const done = tasks.some(
		(t) =>
			t.done &&
			t.scheduleId === e.id &&
			normalizeDateKey(t.dueKey) === e.dateKey,
	);
	return `<button class="event ${done ? "completed" : ""}" style="top:${top}px;height:${height}px;--event-color:${/^#[0-9a-f]{3,8}$/i.test(e.color) ? e.color : "#9461e9"}" data-action="event" data-event-id="${esc(e.id)}" data-source="${esc(e.sourceDate)}" data-date="${esc(e.dateKey)}" aria-label="${esc(e.name)} ${esc(e.start)} to ${esc(e.end)}"><b>${esc(e.name)}</b><span>${esc(e.start)} – ${esc(e.end)}${e.location ? " · " + esc(e.location) : ""}</span></button>`;
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
	const events = occurrences(new Date()),
		{ start, end } = timeRange(events);
	return `<div class="today-layout"><section class="surface tasks-surface"><div class="today-heading"><div><h2>Today</h2><p class="date-copy">${dateLabel(new Date())}</p></div>${finishLine()}</div><form class="composer" id="quickAdd"><input name="task" aria-label="Add a task" placeholder="Add a task for today…" autocomplete="off" required><button class="primary" aria-label="Add task">${icon("plus")}</button><button type="button" data-action="add" aria-label="Add task with details">${icon("more")}</button></form>${taskGroups()}<div class="tasks-footer"><button class="text-button" data-action="all-tasks">All tasks · ${tasks.filter((t) => !t.done).length} open</button><button class="text-button" data-action="standalone" data-type="todo">Open To-Do separately ↗</button></div></section><section class="surface agenda-surface"><div class="section-heading"><h2>Your day</h2><span>${new Date().toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}</span></div><div class="agenda-scroll"><div class="timeline" style="--timeline-height:${((end - start) * 76) / 60}px">${hourLines(start, end)}${events.map((e) => eventMarkup(e, start)).join("")}${nowLine(start, end)}</div></div><div class="tasks-footer"><button class="text-button" data-action="view" data-view="plan">Open planner ${icon("right")}</button><button class="text-button" data-action="standalone" data-type="timetable">Timetable ↗</button></div></section></div>`;
}
function render() {
	if (!engines.todo) return;
	document.querySelectorAll(".view-tabs button").forEach((b) => {
		if (b.dataset.view === view) b.setAttribute("aria-current", "page");
		else b.removeAttribute("aria-current");
	});
	$("#workspace").innerHTML =
		view === "today"
			? renderToday()
			: view === "plan"
				? renderPlan()
				: renderFocus();
	$("#focusDock").hidden = view !== "today";
	renderDock();
	decorate();
	bindWorkspace();
	updateTimer();
	updateCalendarTime();
}
function renderDock() {
	const current = activeTask(),
		next = occurrences(new Date()).find(
			(e) =>
				minutes(e.start) > new Date().getHours() * 60 + new Date().getMinutes(),
		);
	$("#focusDock").innerHTML =
		`<div class="dock-task"><button class="dock-icon" data-action="view" data-view="focus" aria-label="Open focus workspace">${icon("clock")}</button><div><b>${esc(current?.text || "Ready when you are")}</b><small>${current ? `${duration(current) || 45}-minute focus block` : "Choose a task or start a timer"}</small></div></div><span class="dock-time" data-timer>45:00</span><div class="dock-controls"><button class="primary" data-action="timer" data-timer-button>${icon("play")} Start focus</button><button class="icon-button" data-action="reset-timer" aria-label="End and reset timer" title="End and reset timer">${icon("reset")}</button></div><div class="next-event">${icon("calendar")}<div><span>Next</span><b>${next ? `${esc(next.name)} · ${esc(next.start)}` : "No more scheduled blocks"}</b></div></div>`;
}
function bindWorkspace() {
	const form = $("#quickAdd");
	if (form)
		form.onsubmit = (e) => {
			e.preventDefault();
			const input = form.elements.task;
			engines.todo.TodoUIBridge.command.add({ text: input.value, pri: "must" });
			input.value = "";
			signature = "";
			refresh();
			notify("Task added.");
		};
	document.querySelectorAll("[data-drag]").forEach((el) => {
		el.ondragstart = (e) => {
			e.dataTransfer.setData("text/plain", el.dataset.drag);
			e.dataTransfer.effectAllowed = "move";
		};
	});
	document.querySelectorAll(".calendar-column").forEach((el) => {
		el.ondragover = (e) => {
			e.preventDefault();
			el.classList.add("drop-target");
		};
		el.ondragleave = () => el.classList.remove("drop-target");
		el.ondrop = (e) => {
			e.preventDefault();
			el.classList.remove("drop-target");
			const id = e.dataTransfer.getData("text/plain"),
				m =
					Number(el.dataset.start) +
					Math.floor(((e.clientY - el.getBoundingClientRect().top) / 76) * 4) *
						15;
			openSchedule(
				id,
				el.dataset.date,
				timeString(Math.max(0, Math.min(1425, m))),
			);
		};
	});
}
function selectFocus(id) {
	if (!task(id) || task(id).done) {
		notify("Choose an open task to focus on.");
		return;
	}
	const w = engines.clock;
	if (w.tmRunning || w.studyActive || w.breakInterval) {
		notify("Finish or reset the current session before switching tasks.");
		return;
	}
	selectedId = id;
	w.SyncEngine.set("clock", "commandTask", { taskId: id });
	setView("focus");
}
function timerAction() {
	const w = engines.clock,
		current = activeTask();
	if (!w.tmRunning && !w.studyActive && w.tmRemaining === w.tmDuration) {
		w.setMode?.("timer");
		w.setTimerType("study", true);
		w.stFocusEl.value = duration(current) || 45;
		w.studyTaskIds = current ? [current.id] : [];
		selectedId = current?.id || null;
		w.SyncEngine.set("clock", "commandTask", { taskId: selectedId });
	}
	w.document.getElementById("tmToggle").click();
	updateTimer();
}
function resetTimer() {
	const w = engines.clock;
	if (w.studyActive) w.document.getElementById("tmEndSession").click();
	else w.document.getElementById("tmReset").click();
	updateTimer();
	notify("Session ended. Recorded focus time is kept.");
}
function updateTimer() {
	const w = engines.clock;
	if (!w) return;
	const breaking = w.studyActive && !w.studyPending && w.studyPhase !== "focus";
	const remaining = breaking
		? w.breakRemaining
		: w.tmRunning
			? Math.max(0, w.tmStartRemaining - (Date.now() - w.tmStartTime) / 1000)
			: w.tmRemaining;
	const current = activeTask();
	const fresh =
		!w.studyActive && !w.tmRunning && w.tmRemaining === w.tmDuration;
	const seconds = Math.ceil(fresh ? (duration(current) || 45) * 60 : remaining);
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
				? (duration(current) || 45) * 60
				: w.tmDuration;
		ring.style.strokeDashoffset = String(
			691.15 * (1 - Math.max(0, Math.min(1, seconds / total))),
		);
	}
	const finish = $("[data-finish]");
	if (finish) finish.disabled = !current || current.done;
	if (view === "focus") {
		const currentKey = `${w.studyActive}:${w.studyPhase}:${w.studyPending}`;
		if (currentKey !== lastFocus) {
			lastFocus = currentKey;
			const actions = $("#breakActions");
			if (actions)
				actions.hidden = !(
					w.studyActive &&
					w.studyPending &&
					w.studyPhase !== "focus"
				);
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
function openEditor(id) {
	const t = task(id),
		d = openDialog(
			"#editorDialog",
			`${dialogHead(t ? "Edit task" : "Add task", "editorTitle")}<form id="taskForm"><div class="form-grid"><label class="field wide">Task<input name="text" value="${esc(t?.text || "")}" required maxlength="500"></label><label class="field">Priority<select name="pri">${["must", "should", "could"].map((p) => `<option value="${p}" ${p === (t?.pri || "must") ? "selected" : ""}>${p === "must" ? "Must Do" : p === "should" ? "Should Do" : "Could Do"}</option>`).join("")}</select></label><label class="field">Estimated minutes<input type="number" name="plannedMinutes" min="1" max="720" value="${duration(t || {}) || ""}" placeholder="Optional"></label><label class="field wide">Date<input name="dueKey" type="date" value="${esc(normalizeDateKey(t?.dueKey) || isoDate())}"></label><label class="field wide">Notes<textarea name="notes" rows="3">${esc(t?.notes || "")}</textarea></label><label class="field wide">Session steps <span>One step per line</span><textarea name="steps" rows="3" placeholder="Add the steps this task needs…">${esc((t?.subs || []).map((s) => s.text).join("\n"))}</textarea></label></div><p class="form-error" id="formError" role="alert"></p><div class="dialog-actions">${t ? `<button type="button" class="delete" data-action="delete" data-id="${esc(id)}">Delete</button><button type="button" data-action="schedule" data-id="${esc(id)}">Schedule</button>` : ""}<button type="submit" class="primary">${t ? "Save changes" : "Add task"}</button></div></form>`,
		);
	$("#taskForm").onsubmit = (e) => {
		e.preventDefault();
		const f = new FormData(e.target),
			key = f.get("dueKey"),
			patch = {
				text: f.get("text").trim(),
				pri: f.get("pri"),
				plannedMinutes: Number(f.get("plannedMinutes")) || null,
				dueKey: key || null,
				due: key === isoDate() ? "today" : null,
				notes: f.get("notes"),
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
			const newId = engines.todo.TodoUIBridge.command.add(patch);
			if (f.get("steps"))
				engines.todo.TodoUIBridge.command.update(newId, {
					subs: String(f.get("steps"))
						.split("\n")
						.map((s) => s.trim())
						.filter(Boolean)
						.map((text) => ({ id: crypto.randomUUID(), text, done: false })),
				});
		}
		d.close();
		signature = "";
		refresh();
		notify(t ? "Task updated." : "Task added.");
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
function openSettings() {
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
			)}</div><button data-action="goal">Adjust daily finish line</button> <button id="lockButton">Lock Command Centre</button>`,
	);
	$("#lockButton").onclick = lock;
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
function openSchedule(id, date = isoDate(), start = "13:00") {
	const t = task(id);
	if (!t) return;
	$("#editorDialog").open && $("#editorDialog").close();
	const d = openDialog(
		"#editorDialog",
		`${dialogHead("Schedule task", "editorTitle")}<p class="muted">${esc(t.text)}</p><form id="scheduleForm"><div class="form-grid" style="margin-top:20px"><label class="field wide">Date<input type="date" name="date" value="${date}" required></label><label class="field">Start<input type="time" name="start" value="${start}" required></label><label class="field">Minutes<input type="number" min="1" max="720" name="duration" value="${duration(t) || 45}" required></label></div><p class="form-error" role="alert" id="scheduleError"></p><div class="dialog-actions"><button type="button" data-action="close-dialog">Cancel</button><button class="primary">Save time block</button></div></form>`,
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
			let blocks =
				engines.timetable.SyncEngine.get("timetable", "courses") || [];
			if (typeof blocks === "string") blocks = JSON.parse(blocks);
			engines.timetable.schedule = blocks;
			validateSlot(
				occurrences(localDate(date)),
				minutes(start),
				end,
				fresh.scheduleId,
			);
			let block = blocks.find((b) => b.id === fresh.scheduleId);
			if (block) {
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
			engines.todo.TodoUIBridge.command.update(id, {
				scheduledStart: new Date(`${date}T${start}`).toISOString(),
				scheduledEnd: new Date(`${date}T${timeString(end)}`).toISOString(),
				dueKey: date,
				due: date === isoDate() ? "today" : null,
				scheduleId: block.id,
				timeboxed: true,
				plannedMinutes: m,
			});
			d.close();
			signature = "";
			refresh();
			notify("Task scheduled.");
		} catch (err) {
			$("#scheduleError").textContent = err.message;
		} finally {
			button.disabled = false;
		}
	};
}
function openEvent(id, source, date) {
	const block = courses.find((b) => b.id === id),
		event = occurrences(localDate(date)).find(
			(e) => e.id === id && e.sourceDate === source,
		);
	if (!block || !event) return;
	const d = openDialog(
		"#editorDialog",
		`${dialogHead("Scheduled block", "editorTitle")}<h3>${esc(event.name)}</h3><p class="muted" style="margin-top:7px">${dateLabel(localDate(date))} · ${esc(event.start)} – ${esc(event.end)}</p>${event.location ? `<p class="muted">${esc(event.location)}</p>` : ""}${event.outcomeGoal ? `<p style="margin-top:18px">${esc(event.outcomeGoal)}</p>` : ""}<p style="margin-top:18px;white-space:pre-wrap">${esc(event.description || "")}</p><div class="dialog-actions"><button data-action="standalone" data-type="timetable">Edit in Timetable ↗</button><button class="primary" data-action="close-dialog">Done</button></div>`,
	);
}
document.addEventListener("click", (e) => {
	const b = e.target.closest("[data-action]");
	if (!b) return;
	const id = b.dataset.id;
	switch (b.dataset.action) {
		case "toggle":
			engines.todo.TodoUIBridge.command.toggle(id);
			signature = "";
			refresh();
			notify(task(id)?.done ? "Task completed." : "Task reopened.", true);
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
			openEditor();
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
			resetTimer();
			break;
		case "schedule":
			openSchedule(id);
			break;
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
		case "week-prev":
			weekOffset -= 3;
			signature = "";
			render();
			break;
		case "week-next":
			weekOffset += 3;
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
			engines.clock.SyncEngine.set("clock", "commandTask", { taskId: null });
			signature = "";
			refresh();
			notify("Task completed.", true);
			break;
		case "subtask":
			engines.todo.TodoUIBridge.command.subtask(
				selectedId || activeTask()?.id,
				b.dataset.subId,
			);
			signature = "";
			refresh();
			break;
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
$("#undoButton").onclick = () => {
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
	if (!document.hidden) refresh();
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

function renderPlan() {
	const dates = Array.from({ length: 3 }, (_, i) => {
		const d = new Date();
		d.setDate(d.getDate() + weekOffset + i);
		return d;
	});
	const events = dates.map(occurrences),
		all = events.flat(),
		{ start, end } = timeRange(all);
	const open = tasks
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
	return `<div class="planner-layout"><aside class="surface planner-tray"><div class="section-heading"><h2>Unscheduled</h2><span>${open.length} tasks</span></div><p class="muted" style="font-size:11px;margin:0 5px 17px">Drag a task into a day, or choose its calendar button.</p>${open.length ? open.map((t) => taskRow(t, true)).join("") : '<p class="group-empty">Your tasks have a time. Add another when you need it.</p>'}<button class="text-button" data-action="add" style="align-self:flex-start;margin:4px 5px 24px">+ Add a task</button><div class="tray-timer"><div><small>Focus</small><b data-timer>45:00</b></div><button data-action="timer" aria-label="Start or pause focus">${icon("play")}</button></div></aside><section class="surface planner-calendar"><div class="calendar-head">${icon("calendar")}<div class="calendar-dates">${dates.map((d) => `<div class="calendar-date ${isoDate(d) === today ? "today" : ""}">${d.toLocaleDateString("en-CA", { weekday: "short", day: "numeric" })}<small>${d.toLocaleDateString("en-CA", { month: "long", year: "numeric" })}</small></div>`).join("")}</div></div><div class="calendar-toolbar"><button data-action="week-prev" aria-label="Previous three days">←</button><button data-action="week-today">Today</button><button data-action="week-next" aria-label="Next three days">→</button><button data-action="standalone" data-type="timetable">Edit timetable ↗</button></div><div class="calendar-scroll"><div class="calendar-body" style="--calendar-height:${((end - start) * 76) / 60}px"><div class="calendar-hours">${Array.from({ length: (end - start) / 60 + 1 }, (_, i) => `<span style="top:${i * 76}px">${timeString(start + i * 60)}</span>`).join("")}</div><div class="calendar-columns">${dates
		.map((date, i) => {
			const gap = gaps(events[i], start, end).find(
				([s, e]) => e - s >= 45 && s >= minutes("12:00"),
			);
			return `<div class="calendar-column ${isoDate(date) === today ? "today" : ""}" data-date="${isoDate(date)}" data-start="${start}">${events[i].map((e) => eventMarkup(e, start)).join("")}${gap ? `<div class="open-slot" style="top:${((gap[0] - start) * 76) / 60 + 4}px;height:${(45 * 76) / 60 - 8}px">45 min available</div>` : ""}${nowLine(start, end, 76, isoDate(date))}</div>`;
		})
		.join(
			"",
		)}</div></div></div><div class="capacity"><b>${dates[0].toLocaleDateString("en-CA", { weekday: "short" })} · Planned ${formatMinutes(planned)} · Available ${formatMinutes(available)}</b><div class="progress-track" role="meter" aria-label="Scheduled time for first displayed day" aria-valuemin="0" aria-valuemax="${end - start}" aria-valuenow="${planned}"><span style="width:${(planned / (end - start)) * 100}%"></span></div><span>${formatMinutes(planned)} / ${formatMinutes(end - start)}</span></div></section></div>`;
}
function formatMinutes(n) {
	const h = Math.floor(n / 60),
		m = n % 60;
	return (
		`${h ? h + " h" : ""}${h && m ? " " : ""}${m ? m + " min" : ""}` || "0 min"
	);
}
function renderFocus() {
	const current = activeTask(),
		next = todayTasks(tasks).find(
			(t) => !t.done && t.id !== current?.id && t.pri !== "could",
		),
		events = occurrences(new Date()),
		now = new Date().getHours() * 60 + new Date().getMinutes(),
		nextEvent = events.find((e) => minutes(e.start) > now),
		subs = current?.subs || [];
	return `<div class="focus-layout"><section class="surface focus-main"><p class="eyebrow">Current task</p><h2>${esc(current?.text || "Room to focus")}</h2><p class="focus-subtitle">${current ? `${duration(current) || 45}-minute focus block` : "Start a timer, or choose a task from Today"}</p><div class="timer-art"><svg viewBox="0 0 240 240" aria-hidden="true"><circle class="timer-track" cx="120" cy="120" r="110"/><circle class="timer-progress" data-timer-ring cx="120" cy="120" r="110"/></svg><div><div class="timer-digits" data-timer>45:00</div><p class="timer-caption" data-phase>Ready to focus</p></div></div><div class="focus-controls"><button data-action="timer" data-timer-button>${icon("play")} Start focus</button><button class="primary" data-action="finish" data-finish>${icon("check")} Finish task</button><button class="icon-button" data-action="reset-timer" aria-label="End and reset timer" title="End and reset timer">${icon("reset")}</button></div><div class="break-actions" id="breakActions" hidden><span class="muted" style="font-size:12px">Your break is ready.</span><button data-action="flow">+15 min focus</button></div><section class="session-steps"><div class="steps-head"><span>Session steps</span><span>${subs.filter((s) => s.done).length} of ${subs.length}</span></div>${subs.length ? subs.map((sub) => `<div class="step-row ${sub.done ? "done" : ""}"><button class="check-button ${sub.done ? "checked" : ""}" data-action="subtask" data-sub-id="${esc(sub.id)}" aria-label="${sub.done ? "Reopen" : "Complete"} step: ${esc(sub.text)}">${sub.done ? icon("check") : ""}</button><span class="step-text">${esc(sub.text)}</span></div>`).join("") : `<div class="step-empty">${current ? "Add the steps that will help you finish this task." : "Choose a task to see its session steps."}${current ? `<br><button data-action="edit" data-id="${esc(current.id)}">Add session steps</button>` : ""}</div>`}</section></section><aside class="focus-sidebar"><section class="surface context-card"><p class="eyebrow">${icon("list")} Up next</p>${next ? `<div class="next-task"><button class="check-button" data-action="select-focus" data-id="${esc(next.id)}" aria-label="Select ${esc(next.text)}"></button><div><b>${esc(next.text)}</b><small>${duration(next) ? duration(next) + " min" : "No estimate"}</small></div></div>` : '<p class="muted" style="font-size:12px">No other commitments today.</p>'}</section><section class="surface context-card finish-context"><p class="eyebrow">${icon("flag")} Today’s finish line</p>${finishLine(true)}${[
		"must",
		"should",
		"could",
	]
		.map((pri) => {
			const list = todayTasks(tasks).filter(
				(t) =>
					(t.pri === "should" || t.pri === "could" ? t.pri : "must") === pri,
			);
			return `<div class="priority-summary ${pri}"><i></i><span>${pri === "must" ? "Must Do" : pri === "should" ? "Should Do" : "Could Do"}</span><span>${list.filter((t) => t.done).length} of ${list.length}</span></div>`;
		})
		.join(
			"",
		)}</section><section class="surface context-card next-scheduled"><p class="eyebrow">${icon("calendar")} Next scheduled</p><b>${esc(nextEvent?.name || "An open stretch")}</b><p>${nextEvent ? `${esc(nextEvent.start)} · ${formatMinutes(minutes(nextEvent.end) - minutes(nextEvent.start))}` : "No more scheduled blocks today."}</p></section></aside></div><div class="surface focus-agenda">${
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

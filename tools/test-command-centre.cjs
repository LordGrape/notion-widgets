/* Synthetic data only. Every protected/external request is intercepted. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict"),
	http = require("node:http"),
	fs = require("node:fs"),
	path = require("node:path");
const root = process.cwd(),
	out = process.env.COMMAND_SCREENSHOTS || "/tmp/command-centre-qa";
fs.mkdirSync(out, { recursive: true });
const mime = {
	".html": "text/html",
	".js": "text/javascript",
	".mjs": "text/javascript",
	".css": "text/css",
	".svg": "image/svg+xml",
	".json": "application/json",
	".webmanifest": "application/manifest+json",
};
const server = http.createServer((req, res) => {
	let p = path.join(
		root,
		decodeURIComponent(new URL(req.url, "http://localhost").pathname),
	);
	if (!p.startsWith(root + path.sep)) {
		res.writeHead(403);
		return res.end();
	}
	if (fs.existsSync(p) && fs.statSync(p).isDirectory())
		p = path.join(p, "index.html");
	fs.readFile(p, (e, data) => {
		res.writeHead(e ? 404 : 200, {
			"Content-Type": mime[path.extname(p)] || "application/octet-stream",
		});
		res.end(e ? "Not found" : data);
	});
});
const now = Date.now(),
	date = new Date(),
	key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
	day = date.getDay();
const seedTasks = [
	{
		id: "reading",
		text: "Read assigned case",
		pri: "must",
		plannedMinutes: 45,
		due: "today",
		dueKey: key,
		created: 1,
		done: false,
		subs: [
			{ id: "s1", text: "Identify material facts", done: true },
			{ id: "s2", text: "State the legal issue", done: false },
			{ id: "s3", text: "Note the court’s reasoning", done: false },
		],
	},
	{
		id: "outline",
		text: "Prepare seminar outline",
		pri: "must",
		plannedMinutes: 30,
		due: "today",
		dueKey: key,
		created: 2,
		done: true,
		doneAt: now,
	},
	{
		id: "review",
		text: "Review class notes",
		pri: "should",
		plannedMinutes: 20,
		due: "today",
		dueKey: key,
		created: 3,
		done: false,
	},
	{
		id: "extra",
		text: "Organize reading notes",
		pri: "could",
		plannedMinutes: 15,
		due: "today",
		dueKey: key,
		created: 4,
		done: false,
	},
];
const seedCourses = [
	["seminar", "Seminar", "11:00", "12:00", "#9461e9", "Room B1.04"],
	["lunch", "Lunch break", "12:00", "13:00", "#aaa4bd", ""],
	["study", "Reading block", "13:00", "14:00", "#9461e9", ""],
	["review-block", "Review", "15:00", "16:00", "#b792ed", ""],
].map(([id, name, start, end, color, location]) => ({
	id,
	name,
	color,
	location,
	category: id === "seminar" ? "class" : "personal",
	days: [{ day, start, end, location }],
	overrides: [],
}));
let states = {
	todo: { tasks: { value: JSON.stringify(seedTasks), _ts: now - 1000 } },
	timetable: { courses: { value: seedCourses, _ts: now - 1000 } },
	clock: {},
	user: {},
	dragon: {},
};
(async () => {
	await new Promise((r) => server.listen(0, "127.0.0.1", r));
	const base = `http://127.0.0.1:${server.address().port}`;
	const browser = await chromium.launch({
		headless: true,
		...(process.env.COMMAND_CHROMIUM
			? {
					executablePath: process.env.COMMAND_CHROMIUM,
					args: [
						"--no-sandbox",
						"--disable-gpu",
						"--disable-dev-shm-usage",
						"--no-zygote",
						"--disable-software-rasterizer",
					],
				}
			: {}),
	});
	try {
		const context = await browser.newContext({
				viewport: { width: 1440, height: 1000 },
				timezoneId: "America/Toronto",
				serviceWorkers: "block",
			}),
			page = await context.newPage(),
			errors = [];
		context.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
		page.on("pageerror", (e) => errors.push(e.message));
		const routeHandler = async (route) => {
			const req = route.request(),
				u = new URL(req.url());
			if (u.hostname === "127.0.0.1") return route.continue();
			if (u.hostname === "widget-sync.lordgrape-widgets.workers.dev") {
				const headers = {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Headers": "X-Widget-Key,Content-Type",
					"Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
				};
				if (req.method() === "OPTIONS")
					return route.fulfill({ status: 204, headers });
				const ns = u.pathname.split("/")[2];
				if (u.pathname.startsWith("/state/")) {
					if (req.method() === "GET")
						return route.fulfill({
							headers,
							json: { value: states[ns] || {} },
						});
					if (req.method() === "PUT") {
						states[ns] = JSON.parse(req.postData()).value;
						return route.fulfill({ headers, json: { ok: true } });
					}
				}
				return route.fulfill({
					headers,
					json: { ok: true, items: [], tasks: [] },
				});
			}
			return route.abort();
		};
		await context.route("**/*", routeHandler);
		await page.goto(base + "/apps/assistant/");
		await page.locator("#accessKey").fill("synthetic-test-key");
		await page.locator("#unlockForm button").click();
		await page.locator(".today-layout").waitFor({ timeout: 30000 });
		await page
			.getByRole("button", { name: "Read assigned case", exact: true })
			.waitFor();
		// The live indicator must move without rebuilding the calendar or losing input.
		const checkLiveTime = async () => {
			const noon = await page.evaluate(() => new Date().setHours(12, 0, 0, 0));
			await page.evaluate((value) => {
				window.calendarTestNow = value;
				if (!window.NativeDate) {
					window.NativeDate = Date;
					window.Date = class extends window.NativeDate {
						constructor(...args) {
							super(...(args.length ? args : [window.calendarTestNow]));
						}
						static now() {
							return window.calendarTestNow;
						}
					};
				}
			}, noon);
			await page.waitForFunction(
				() =>
					document.querySelector(".now-line:not([hidden]) time")
						?.textContent === "12:00",
			);
			await page.waitForTimeout(1500); // Let task/sync writes settle before testing time alone.
			const before = await page.evaluate(() => {
				window.testTimeLayer = document.querySelector(
					".calendar-time:not([hidden])",
				);
				return parseFloat(
					testTimeLayer.style.getPropertyValue("--now-position"),
				);
			});
			await page.evaluate(
				(value) => {
					window.calendarTestNow = value;
				},
				noon + 15.5 * 60000,
			);
			await page.waitForFunction(
				() =>
					document.querySelector(".now-line:not([hidden]) time")
						?.textContent === "12:15",
			);
			const result = await page.evaluate(() => ({
				same:
					testTimeLayer ===
					document.querySelector(".calendar-time:not([hidden])"),
				position: parseFloat(
					testTimeLayer.style.getPropertyValue("--now-position"),
				),
				shade: parseFloat(
					getComputedStyle(testTimeLayer.querySelector(".elapsed-time")).height,
				),
			}));
			assert(result.same, "Time updates must preserve the calendar DOM");
			assert(Math.abs(result.position - before - (15.5 * 76) / 60) < 0.05);
			assert(Math.abs(result.shade - result.position) < 0.05);
			await page.evaluate(
				(value) => {
					window.calendarTestNow = value;
				},
				noon - 4 * 3600000,
			);
			await page.waitForFunction(
				() =>
					document.querySelector(".calendar-time:not([hidden]) .now-line")
						.hidden,
			);
			await page.evaluate(
				(value) => {
					window.calendarTestNow = value;
				},
				noon + 6 * 3600000,
			);
			await page.waitForFunction(
				() =>
					document.querySelector(".calendar-time:not([hidden]) .now-line")
						.hidden &&
					parseFloat(
						document
							.querySelector(".calendar-time:not([hidden])")
							.style.getPropertyValue("--now-position"),
					) > 0,
			);
			await page.evaluate((value) => {
				window.calendarTestNow = value;
				if (!window.NativeDate) {
					window.NativeDate = Date;
					window.Date = class extends window.NativeDate {
						constructor(...args) {
							super(...(args.length ? args : [window.calendarTestNow]));
						}
						static now() {
							return window.calendarTestNow;
						}
					};
				}
			}, noon);
			await page.waitForFunction(
				() =>
					!document.querySelector(".calendar-time:not([hidden]) .now-line")
						.hidden,
			);
			await page.evaluate(() => {
				window.Date = window.NativeDate;
				delete window.NativeDate;
			});
		};
		await checkLiveTime();
		await page.screenshot({
			path: path.join(out, "A-today-light.png"),
			fullPage: true,
		});
		const getTasks = () =>
			page.evaluate(
				() =>
					document
						.querySelector("#todoFrame")
						.contentWindow.document.querySelector("#shell")
						.contentWindow.TodoUIBridge.snapshot().tasks,
			);
		// Existing completion/undo must work, and all unrelated data must survive.
		await page
			.getByRole("button", { name: "Complete Read assigned case", exact: true })
			.click();
		assert.equal((await getTasks()).find((t) => t.id === "reading").done, true);
		await page.locator("#undoButton").click();
		assert.equal(
			(await getTasks()).find((t) => t.id === "reading").done,
			false,
		);
		await page.locator("#quickAdd input").fill("Synthetic new task");
		await page
			.locator("#quickAdd button[type=submit],#quickAdd button:not([type])")
			.first()
			.click();
		assert((await getTasks()).some((t) => t.text === "Synthetic new task"));
		// Today: dragging from the actual task title onto an occupied time suggests a gap.
		await page.evaluate(() => {
			window.dragImages = [];
			window.cueTones = 0;
			const setDragImage = DataTransfer.prototype.setDragImage;
			DataTransfer.prototype.setDragImage = function (el, x, y) {
				const rect = el.getBoundingClientRect();
				window.dragImages.push({
					width: rect.width,
					height: rect.height,
					text: el.textContent,
				});
				return setDragImage.call(this, el, x, y);
			};
			const create = AudioContext.prototype.createOscillator;
			AudioContext.prototype.createOscillator = function () {
				window.cueTones++;
				return create.call(this);
			};
		});

		const dragReading = () =>
			page
				.locator('.task-row[data-task="reading"] .task-title')
				.dragTo(page.locator(".timeline"), {
					targetPosition: { x: 100, y: 171 },
				});
		await dragReading();
		await page.locator("#scheduleForm").waitFor();
		assert.equal(
			await page.locator("#scheduleForm [name=start]").inputValue(),
			"14:00",
		);
		assert.equal(
			await page.locator("#scheduleForm [name=duration]").inputValue(),
			"45",
		);
		assert.equal(
			await page.locator("#scheduleForm [name=date]").inputValue(),
			key,
		);
		assert(
			!(await getTasks()).find((t) => t.id === "reading").scheduleId,
			"Dropping must not save before confirmation",
		);
		await page
			.locator("#editorDialog [data-action=close-dialog]")
			.first()
			.click();
		assert(
			!(await getTasks()).find((t) => t.id === "reading").scheduleId,
			"Cancel leaves the task unchanged",
		);
		await dragReading();
		await page.locator("#scheduleForm .primary").click();
		await page.waitForFunction(
			() => !document.querySelector("#editorDialog").open,
		);
		const reading = (await getTasks()).find((t) => t.id === "reading");
		assert(reading.scheduleId && reading.scheduledStart);
		assert.equal(
			(await getTasks()).filter((t) => t.id === "reading").length,
			1,
		);
		assert.equal(
			await page
				.locator('.timeline .event[data-event-id="' + reading.scheduleId + '"]')
				.count(),
			1,
		);
		const feedback = await page.evaluate(() => ({
			images: window.dragImages,
			tones: window.cueTones,
		}));
		assert.equal(feedback.images.length, 2);
		for (const image of feedback.images) {
			assert.equal(image.width, 230);
			assert.equal(image.height, 44);
			assert(image.text.includes("Read assigned case"));
		}
		assert.equal(
			feedback.tones,
			10,
			"Pickup, drop and successful save have distinct soft cues",
		);
		assert.equal(
			await page.locator(".drag-chip,.is-dragging,.drop-preview").count(),
			0,
		);
		await page.locator("#settingsButton").click();
		await page.locator("#soundToggle").click();
		assert.equal(
			await page.locator("#soundToggle").getAttribute("aria-pressed"),
			"false",
		);
		await page.locator("#settingsDialog [data-action=close-dialog]").click();
		await dragReading();
		assert.equal(
			await page.evaluate(() => window.cueTones),
			feedback.tones,
			"Muted dragging emits no sound",
		);
		await page
			.locator("#editorDialog [data-action=close-dialog]")
			.first()
			.click();
		await page.locator("#settingsButton").click();
		await page.locator("#soundToggle").click();
		await page.locator("#settingsDialog [data-action=close-dialog]").click();
		// The drag grip doubles as a keyboard/touch scheduling button.
		await page
			.getByRole("button", {
				name: "Drag Read assigned case to the calendar",
				exact: true,
			})
			.click();
		await page.locator("#scheduleForm").waitFor();
		await page
			.locator("#editorDialog [data-action=close-dialog]")
			.first()
			.click();
		// B: click-to-schedule uses the same task and one dated block, never recurrence.
		await page.locator(".view-tabs [data-view=plan]").click();
		await checkLiveTime();
		assert.equal(await page.locator(".calendar-time:not([hidden])").count(), 1);
		await page.screenshot({
			path: path.join(out, "B-plan-light.png"),
			fullPage: true,
		});
		await page
			.getByRole("button", { name: "Schedule Review class notes", exact: true })
			.click();
		await page.locator("#scheduleForm [name=start]").fill("16:00");
		await page.locator("#scheduleForm .primary").click();
		await page.waitForFunction(
			() => !document.querySelector("#editorDialog").open,
		);
		let review = (await getTasks()).find((t) => t.id === "review");
		assert(review.scheduledStart && review.scheduleId);
		let blocks = await page.evaluate(
			() =>
				document
					.querySelector("#timetableFrame")
					.contentWindow.document.querySelector("#schedule").contentWindow
					.CommandTimetable.schedule,
		);
		const added = blocks.find((b) => b.id === review.scheduleId);
		assert.equal(added.startDate, key);
		assert.equal(added.endDate, key);
		assert.equal(blocks.length, 6);
		// Rescheduling updates the existing dated block rather than duplicating it.
		await page.locator(".view-tabs [data-view=today]").click();
		await page
			.getByRole("button", { name: "Edit Review class notes", exact: true })
			.click();
		await page.locator("#editorDialog [data-action=schedule]").click();
		await page.locator("#scheduleForm [name=start]").fill("16:30");
		await page.locator("#scheduleForm .primary").click();
		await page.waitForFunction(
			() => !document.querySelector("#editorDialog").open,
		);
		blocks = await page.evaluate(
			() =>
				document
					.querySelector("#timetableFrame")
					.contentWindow.document.querySelector("#schedule").contentWindow
					.CommandTimetable.schedule,
		);
		assert.equal(blocks.length, 6);
		// Drag-to-schedule must land in the same explicit scheduling form.
		await page.locator(".view-tabs [data-view=plan]").click();
		await page
			.locator('[data-drag="extra"]')
			.dragTo(page.locator(".calendar-column").nth(1), {
				targetPosition: { x: 80, y: 100 },
			});
		await page.locator("#scheduleForm").waitFor();
		assert.equal(
			await page.locator("#scheduleForm [name=date]").inputValue(),
			await page.locator(".calendar-column").nth(1).getAttribute("data-date"),
		);
		await page
			.locator("#editorDialog [data-action=close-dialog]")
			.first()
			.click();
		await page.locator(".view-tabs [data-view=today]").click();
		// C: task subtasks, start/pause and view/theme switching use the original Clock.
		await page
			.getByRole("button", { name: "Focus on Read assigned case", exact: true })
			.click();
		await page.locator(".focus-layout").waitFor();
		await page.screenshot({
			path: path.join(out, "C-focus-light.png"),
			fullPage: true,
		});
		await page
			.getByRole("button", {
				name: "Complete step: State the legal issue",
				exact: true,
			})
			.click();
		assert.equal(
			(await getTasks()).find((t) => t.id === "reading").subs[1].done,
			true,
		);
		await page.locator(".focus-controls [data-action=timer]").click();
		const clock = () =>
			page.evaluate(() => {
				const w =
					document.querySelector("#clockFrame").contentWindow.CommandClock;
				return {
					running: w.tmRunning,
					start: w.tmStartTime,
					duration: w.tmDuration,
					remaining: w.tmRemaining,
				};
			});
		const initial = await clock();
		assert(initial.running);
		assert.equal(initial.duration, 2700);
		await page.locator(".view-tabs [data-view=today]").click();
		await page.locator("#themeToggle").click();
		await page.locator(".view-tabs [data-view=focus]").click();
		assert.equal((await clock()).start, initial.start);
		await page.screenshot({
			path: path.join(out, "C-focus-dark.png"),
			fullPage: true,
		});
		await page.locator(".focus-controls [data-action=timer]").click();
		assert.equal((await clock()).running, false);
		await page.locator(".focus-controls [data-action=reset-timer]").click();
		// Layouts fit laptop, tablet, mobile, light/dark and reduced motion.
		await page.emulateMedia({ reducedMotion: "reduce" });
		for (const width of [1440, 1024, 820, 390]) {
			await page.setViewportSize({ width, height: 1000 });
			for (const v of ["today", "plan", "focus"]) {
				await page.locator(`.view-tabs [data-view=${v}]`).click();
				assert.equal(
					await page.evaluate(
						() => document.documentElement.scrollWidth <= innerWidth,
					),
					true,
					`${v} overflows at ${width}`,
				);
				if (width === 390)
					await page.screenshot({
						path: path.join(out, `${v}-mobile-dark.png`),
						fullPage: true,
					});
			}
		}
		// Standalone widgets still bootstrap through their original entry points.
		for (const widget of [
			"todo-smart-shell.html",
			"timetable-shell.html",
			"clock.html",
            "quotes.html",
            "lineup.html",
            "apps/athlete/athlete.html",
            "studyengine/index.html",
            "firac-reader/site/index.html",
		]) {
			const p = await context.newPage();
			await p.goto(`${base}/${widget}#key=synthetic-test-key`);
			await p.waitForTimeout(1700);
			assert(await p.locator("body").count());
            const surface = widget === "todo-smart-shell.html" ? p.frameLocator("#shell") : widget === "timetable-shell.html" ? p.frameLocator("#schedule") : p;
            await surface.locator("svg[data-wi]").first().waitFor();
            assert(await surface.locator("svg[data-wi]").count() > 0, `${widget} renders shared icons`);
            assert.equal(await surface.locator("svg[data-wi]").first().getAttribute("aria-hidden"), "true");
			if (widget === "todo-smart-shell.html")
				await p.frameLocator("#shell").locator("#inp").waitFor();
			if (widget === "timetable-shell.html")
				await p.frameLocator("#schedule").locator("#main").waitFor();
			if (widget === "clock.html")
				assert.equal(
					await p.evaluate(() => window.CommandClock === undefined),
					true,
				);
			await p.screenshot({
				path: path.join(out, `standalone-${widget.replaceAll("/", "-")}.png`),
				fullPage: true,
			});
			await p.close();
		}
		// A fresh browser with no local cache must receive the same protected task state.
		const freshContext = await browser.newContext({
			timezoneId: "America/Toronto",
			serviceWorkers: "block",
		});
		await freshContext.route("**/*", routeHandler);
		const freshPage = await freshContext.newPage();
		await freshPage.goto(`${base}/todo.html#key=synthetic-test-key`);
		await freshPage.locator("#inp").waitFor();
		await freshPage.waitForFunction(() =>
			window.TodoUIBridge?.snapshot().tasks.some(
				(t) => t.text === "Synthetic new task",
			),
		);
		const remoteReview = await freshPage.evaluate(() =>
			window.TodoUIBridge.snapshot().tasks.find((t) => t.id === "review"),
		);
		assert(remoteReview.scheduledStart && remoteReview.scheduleId);
		await freshContext.close();
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.locator("#settingsButton").click();
		await page.locator("#lockButton").click();
		assert.equal(
			await page.evaluate(() =>
				localStorage.getItem("command-centre-access-v1"),
			),
			null,
		);
		assert.equal(
			await page.locator("#appShell").getAttribute("aria-hidden"),
			"true",
		);
		assert.deepEqual(errors, []);
		console.log(
			"Command Centre: completion, undo, capture, scheduling, rescheduling, subtasks, timer continuity, four widths, reduced motion, standalone widgets and lock passed.",
		);
		console.log("Screenshots: " + out);
	} finally {
		await browser.close();
		server.close();
	}
})().catch((e) => {
	console.error(e);
	server.close();
	process.exit(1);
});

const fs = require("node:fs"),
	assert = require("node:assert/strict");
const { chromium } = require("playwright");
const root = process.cwd();
const coreSource = fs.readFileSync("core.js", "utf8");
const themeCode = coreSource.slice(
	coreSource.indexOf("/* Shared CSS tokens"),
	coreSource.indexOf(
		"/* ══════════════════════════════════════",
		coreSource.indexOf("/* Shared CSS tokens"),
	),
);
const fakeCore = `let store={'todo/tasks':JSON.stringify([{id:'must-a',text:'Read a sample case',pri:'must',done:false,created:1},{id:'must-b',text:'Brief a sample case',pri:'must',done:false,created:2},{id:'should',text:'Review class notes',pri:'should',done:false,created:3},{id:'could',text:'Optional extra reading',pri:'could',done:false,created:4}])};let SyncEngine={init(){},onReady(cb){cb()},get(ns,k){return store[ns+'/'+k]},set(ns,k,v){store[ns+'/'+k]=v},subscribe(){return()=>{}},onSyncStatus(){},isOnline(){return false},pull:async()=>{},push:async()=>{},flush:async()=>{}};window.testRead=()=>store;window.Core={isDark:matchMedia('(prefers-color-scheme: dark)').matches,emit(){},a11y:{announce(){}}};${themeCode}`;
(async () => {
	const browser = await chromium.launch({ headless: true });
	try {
		for (const width of [360, 1000])
			for (const theme of ["light", "dark"])
				for (const reducedMotion of ["reduce", "no-preference"]) {
					const context = await browser.newContext({
						viewport: { width, height: 900 },
						colorScheme: theme,
						reducedMotion,
					});
					await context.route("**/*", (route) => {
						const url = new URL(route.request().url()),
							file = url.pathname.split("/").pop();
						if (file === "core.js")
							return route.fulfill({
								contentType: "application/javascript",
								body: fakeCore,
							});
						if (fs.existsSync(file) && !file.includes(".."))
							return route.fulfill({
								contentType: file.endsWith(".html")
									? "text/html"
									: "application/javascript",
								body: fs.readFileSync(file, "utf8"),
							});
						return route.fulfill({ body: "" });
					});
					const page = await context.newPage(),
						errors = [];
					page.on("pageerror", (e) => errors.push(e.message));
					await page.goto(
						"https://widget.test/todo-smart-shell.html?theme=" + theme,
					);
					const app = page.frameLocator("#shell");
					await app.locator("#todo-ui-root").waitFor({ state: "attached" });
					const frame = page.frames().find((f) => f !== page.mainFrame());
					assert.equal(await app.locator("#todoNudgeToggle").count(), 0);
					await page.screenshot({
						path: `/tmp/todo-ui-${width}-${theme}-${reducedMotion}.png`,
					});
					await app.locator("#cPri").click();
					await app
						.getByRole("menuitemradio", { name: "Could Do", exact: true })
						.click();
					await app.locator("#inp").fill("A bonus task");
					await app.locator("#addbtn").click();
					assert.equal(
						await frame.evaluate(
							() =>
								JSON.parse(testRead()["todo/tasks"]).find(
									(t) => t.text === "A bonus task",
								).pri,
						),
						"could",
					);
					await app.locator("#cTime").click();
					await app
						.getByRole("menuitem", { name: "Custom time…", exact: true })
						.click();
					await app.getByRole("dialog").waitFor();
					await app.locator("#customMinutes").fill("25");
					await app.getByRole("button", { name: "Use custom time" }).click();
					await app.getByRole("dialog").waitFor({ state: "hidden" });
					await app.locator("#inp").fill("A timed task");
					await app.locator("#addbtn").click();
					assert.equal(
						await frame.evaluate(
							() =>
								JSON.parse(testRead()["todo/tasks"]).find(
									(t) => t.text === "A timed task",
								).plannedMinutes,
						),
						25,
					);
					await app.locator("#cDue").click();
					await app
						.getByRole("menuitem", { name: "Custom date…", exact: true })
						.click();
					await app.getByRole("dialog").waitFor();
					await app
						.getByRole("button", { name: "Tomorrow", exact: true })
						.click();
					await app.getByRole("dialog").waitFor({ state: "hidden" });
					await app.locator("#inp").fill("Prepare sample summary");
					await app.locator("#addbtn").click();
					assert.equal(
						await frame.evaluate(
							() =>
								JSON.parse(testRead()["todo/tasks"]).find(
									(t) => t.text === "Prepare sample summary",
								).due,
						),
						"tomorrow",
					);
					const handle = app.getByRole("button", {
						name: "Reorder Read a sample case",
					});
					await handle.focus();
					await handle.press("Space");
					await app.locator(".ui-dragging").waitFor();
					await frame.waitForTimeout(100);
					await handle.press("ArrowDown");
					await frame.waitForTimeout(100);
					await handle.press("Space");
					assert(
						await frame.evaluate(() => {
							const t = JSON.parse(testRead()["todo/tasks"]);
							return (
								t.find((t) => t.id === "must-b").order <
								t.find((t) => t.id === "must-a").order
							);
						}),
					);
					// Let the 160ms reorder animation finish before locating the next pointer target.
					await frame.waitForTimeout(250);
					const aBox = await app
						.getByRole("button", { name: "Reorder Read a sample case" })
						.boundingBox();
					const bBox = await app
						.getByRole("button", { name: "Reorder Brief a sample case" })
						.boundingBox();
					await page.mouse.move(
						aBox.x + aBox.width / 2,
						aBox.y + aBox.height / 2,
					);
					await page.mouse.down();
					await page.mouse.move(
						aBox.x + aBox.width / 2,
						aBox.y + aBox.height / 2 - 10,
						{ steps: 3 },
					);
					await app.locator(".ui-dragging").waitFor();
					await page.mouse.move(
						bBox.x + bBox.width / 2,
						bBox.y + bBox.height / 2,
						{ steps: 8 },
					);
					await frame.waitForTimeout(100);
					await page.mouse.up();
					assert(
						await frame.evaluate(() => {
							const t = JSON.parse(testRead()["todo/tasks"]);
							return (
								t.find((t) => t.id === "must-a").order <
								t.find((t) => t.id === "must-b").order
							);
						}),
					);
					const edit = app.locator('.item[data-id="must-a"] .manage');
					await edit.click();
					await app
						.locator('.item[data-id="must-a"] .e-title-main')
						.fill("Edited sample case");
					await app.locator('.item[data-id="must-a"] .edone').click();
					assert.equal(
						await frame.evaluate(
							() =>
								JSON.parse(testRead()["todo/tasks"]).find(
									(t) => t.id === "must-a",
								).text,
						),
						"Edited sample case",
					);
					for (const id of ["must-a", "must-b", "should"])
						await app.locator(`.item[data-id="${id}"] .box`).click();
					const timed = await frame.evaluate(
						() =>
							JSON.parse(testRead()["todo/tasks"]).find(
								(t) => t.text === "A timed task",
							).id,
					);
					await app.locator(`.item[data-id="${timed}"] .box`).click();
					assert.equal(await app.locator("#ringPct").innerText(), "100%");
					assert.match(
						await app.locator(".day-complete").innerText(),
						/Enjoy your time guilt-free/,
					);
					assert(await app.locator('.item[data-id="could"]').isVisible());
					await app.locator("#undoBtn").click();
					assert.notEqual(await app.locator("#ringPct").innerText(), "100%");
					await app.getByRole("button", { name: "Set daily target" }).click();
					await app
						.getByLabel("Should Do target", { exact: true })
						.selectOption("0");
					assert.match(
						await frame.evaluate(() => testRead()["todo/dailyGoal"]),
						/"count":0/,
					);
					await page.keyboard.press("Escape");
					await app.getByRole("tab", { name: "Upcoming", exact: true }).click();
					assert.match(
						await app.locator("#list").innerText(),
						/Prepare sample summary/,
					);
					assert.equal(
						await frame.evaluate(
							() => document.documentElement.scrollWidth > innerWidth,
						),
						false,
					);
					assert.deepEqual(errors, []);
					await context.close();
					console.log(
						`PASS UI ${width}px ${theme} ${reducedMotion}: menus, custom time/date, keyboard/pointer reorder, edit, goal, undo, target persistence, upcoming`,
					);
				}
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});

/* Screenshots of the Library preview (mock data) into design-previews/library/shots/.
 * Run from the repository root: node design-previews/library/shoot.cjs */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.resolve(__dirname, "../..");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };
const server = http.createServer((q, r) => {
	const p = path.join(root, decodeURIComponent(q.url.split("?")[0]));
	fs.readFile(p, (e, d) => {
		if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }); r.end(d); }
	});
});
(async () => {
	await new Promise((r) => server.listen(0, "127.0.0.1", r));
	const base = `http://127.0.0.1:${server.address().port}/design-previews/library/index.html`;
	const browser = await chromium.launch({ headless: true });
	const outDir = path.join(__dirname, "shots");
	fs.mkdirSync(outDir, { recursive: true });
	const out = (n) => path.join(outDir, `${n}.png`);
	const watch = (page) => {
		page.on("console", (m) => m.type() === "error" && console.log("console error", m.text()));
		page.on("pageerror", (e) => console.log("pageerror", e.message));
	};
	for (const t of ["light", "dark"]) {
		const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
		watch(page);
		await page.goto(`${base}?t=${t}&shot=1`);
		await page.waitForSelector(".lib-card", { timeout: 8000 });
		await page.waitForTimeout(1000);
		await page.screenshot({ path: out(`shelf-${t}`), fullPage: true });
		if (t === "light") {
			/* the add bar open, a ghost spine clicked (prefilled name), and a busy inbox */
			await page.goto(`${base}?t=${t}&shot=1&inbox=busy`);
			await page.waitForSelector(".lib-ghost", { timeout: 8000 });
			await page.waitForTimeout(600);
			await page.click('.lib-course-sec[data-course="c183"] .lib-ghost >> nth=0');
			await page.waitForTimeout(900);
			await page.evaluate(() => window.scrollTo(0, 0));
			await page.screenshot({ path: out("shelf-upload-open") });
		}
		await page.goto(`${base}?t=${t}&shot=1&open=r1&brief=1`);
		await page.waitForSelector(".lib-pagetext", { timeout: 8000 });
		await page.waitForTimeout(2600);
		await page.screenshot({ path: out(`reader-${t}`) });
		await page.close();
	}
	const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
	watch(m);
	await m.goto(`${base}?t=light&shot=1`);
	await m.waitForSelector(".lib-card");
	await m.waitForTimeout(1000);
	await m.screenshot({ path: out("shelf-mobile"), fullPage: true });
	await m.goto(`${base}?t=light&shot=1&open=r1&brief=1`);
	await m.waitForSelector(".lib-pagetext");
	await m.waitForTimeout(2600);
	await m.screenshot({ path: out("reader-mobile") });
	await m.close();
	await browser.close();
	server.close();
})();

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
	const only = process.argv[2];
	const out = (n) => `design-previews/library/shots/${n}.png`;
	for (const v of ["a", "b", "c"]) {
		if (only && only !== v) continue;
		for (const t of ["light", "dark"]) {
			const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
			page.on("console", (m) => m.type() === "error" && console.log("console error", m.text()));
			page.on("pageerror", (e) => console.log("pageerror", e.message));
			await page.goto(`${base}?v=${v}&t=${t}&shot=1`);
			await page.waitForSelector(".lib-card", { timeout: 8000 });
			await page.waitForTimeout(1000);
			await page.screenshot({ path: out(`${v}-shelf-${t}`), fullPage: true });
			await page.goto(`${base}?v=${v}&t=${t}&shot=1&open=r1&brief=1`);
			await page.waitForSelector(".lib-pagetext", { timeout: 8000 });
			await page.waitForTimeout(2600);
			await page.screenshot({ path: out(`${v}-reader-${t}`) });
			await page.close();
		}
		const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
		m.on("pageerror", (e) => console.log("pageerror", e.message));
		await m.goto(`${base}?v=${v}&t=light&shot=1`);
		await m.waitForSelector(".lib-card");
		await m.waitForTimeout(1000);
		await m.screenshot({ path: out(`${v}-shelf-mobile`), fullPage: true });
		await m.goto(`${base}?v=${v}&t=light&shot=1&open=r1&brief=1`);
		await m.waitForSelector(".lib-pagetext");
		await m.waitForTimeout(2600);
		await m.screenshot({ path: out(`${v}-reader-mobile`) });
		await m.close();
	}
	await browser.close();
	server.close();
})();

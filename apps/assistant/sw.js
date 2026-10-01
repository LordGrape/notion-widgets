const CACHE = "command-centre-20261001-page-lists";
const SHELL = [
	"../../widget-platform.js",
	"../../reading-estimates.js",
	"../../reading-estimates.css",
	"../../widget-icons.js",
	"./",
	"./index.html",
	"./styles.css",
	"./app.js",
	"./domain.mjs",
	"../todo/src/daily-goal.mjs",
	"./remember.js",
	"./manifest.webmanifest",
	"./icon.svg",
	"./icon-maskable.svg",
];
const allowed = new Set(
	SHELL.map((path) => new URL(path, self.location.href).href),
);
self.addEventListener("install", (e) =>
	e.waitUntil(
		caches
			.open(CACHE)
			.then((c) => c.addAll(SHELL))
			.then(() => self.skipWaiting()),
	),
);
self.addEventListener("activate", (e) =>
	e.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((k) => k.startsWith("command-centre-") && k !== CACHE)
						.map((k) => caches.delete(k)),
				),
			)
			.then(() => self.clients.claim()),
	),
);
self.addEventListener("fetch", (e) => {
	if (e.request.method !== "GET") return;
	const url = new URL(e.request.url);
	url.search = "";
	if (!allowed.has(url.href)) return;
	e.respondWith(
		fetch(e.request)
			.then((r) => {
				if (r.ok) caches.open(CACHE).then((c) => c.put(url.href, r.clone()));
				return r;
			})
			.catch(() => caches.match(url.href)),
	);
});

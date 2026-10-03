const CACHE = "command-centre-20261004-drag";
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
	"./hours.mjs",
	"./autofit.mjs",
	"./calendar-extras.mjs",
	"./interactions.mjs",
	"./readings-import.mjs",
	"./split.mjs",
	"./broadcast3d.mjs",
	"./partner.mjs",
	"./voice.mjs",
	"./broadcast.glb",
	"./broadcast-run.webp",
	"./calendar-actions.mjs",
	"../todo/src/daily-goal.mjs",
	"./remember.js",
	"./notion-sync.js",
	"./manifest.webmanifest",
	"./icon.svg",
	"./icon-maskable.svg",
	"./icon-192.png",
	"./icon-512.png",
	"./icon-maskable-512.png",
	"./apple-touch-icon.png",
	"./favicon-32.png",
];
/* The other loading scenes are cached the first time each is shown, not on install. */
const SCENES = ["./broadcast-laptop.webp", "./broadcast-meditate.webp", "./broadcast-soccer.webp", "./broadcast-basketball.webp", "./broadcast-coffee.webp"];
const allowed = new Set(
	[...SHELL, ...SCENES].map((path) => new URL(path, self.location.href).href),
);
self.addEventListener("install", (e) =>
	e.waitUntil(
		caches
			.open(CACHE)
			/* "reload" skips the browser's HTTP cache, so an update never installs a stale copy. */
			.then((c) => c.addAll(SHELL.map((path) => new Request(path, { cache: "reload" }))))
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
	/* The mascot sheet and model are large and only change with a release (the cache name changes
	   then), so keep them downloaded and serve them from the device instantly. */
	if (/\.(webp|glb)$/.test(url.pathname)) {
		e.respondWith(
			caches.match(url.href).then(
				(hit) =>
					hit ||
					fetch(e.request).then((r) => {
						if (r.ok)
							e.waitUntil(caches.open(CACHE).then((c) => c.put(url.href, r.clone())));
						return r;
					}),
			),
		);
		return;
	}
	e.respondWith(
		fetch(e.request, { cache: "no-cache" })
			.then((r) => {
				if (r.ok)
					e.waitUntil(caches.open(CACHE).then((c) => c.put(url.href, r.clone())));
				return r;
			})
			.catch(() => caches.match(url.href)),
	);
});

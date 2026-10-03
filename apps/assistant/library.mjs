/* Law School Library: the shelf (HTML string for the Docket view) and the reader (full-screen overlay).
 * Pure helpers are named exports and covered by library.test.mjs. The factory touches the DOM only in
 * bind(), open() and the reader; render() is a pure function of state. All Notion and user text is escaped. */

const API = "/notion/source-library";
const DEFAULT_CHUNK = 20 * 1024 * 1024;
const STATION_FRESH_MS = 20 * 60 * 1000;
const PHOTO_TTL_MS = 50 * 60 * 1000;
const BATCH = 12;
const ACCEPT_ATTR =
	"application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif";

/* FIRAC categories, same ids, prompts and colours as firac-reader/site/index.html (charge omitted). */
export const CATEGORIES = [
	{ id: "facts", label: "Facts", prompt: "Why is this fact legally material?", colour: "#c7c8cc" },
	{ id: "issue", label: "Issue", prompt: "Convert this passage into a neutral legal question.", colour: "#f1d36f" },
	{ id: "rule", label: "Rule", prompt: "State the governing rule in your own words.", colour: "#8ec4f0" },
	{ id: "analysis", label: "Analysis", prompt: "How did the court connect the rule to these facts?", colour: "#c1a5eb" },
	{ id: "conclusion", label: "Conclusion", prompt: "What did the court decide on this issue?", colour: "#91d1ac" },
	{ id: "unsure", label: "Unsure", prompt: "What do you need to verify about this passage?", colour: "#c7a9e8" },
];
const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

/* ---------- pure helpers ---------- */

export function esc(value) {
	return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function safeColour(value, fallback = "var(--accent)") {
	const v = String(value || "").trim();
	return /^#[0-9a-f]{3,8}$/i.test(v) ? v : fallback;
}

/** "LAW 183: Property Law" -> "LAW183"; "" when no course code is present. */
export function courseCode(name) {
	const m = /\b([A-Za-z]{2,5})\s*-?\s*(\d{3}[A-Za-z]?)\b/.exec(String(name || ""));
	return m ? (m[1] + m[2]).toUpperCase() : "";
}

/** "LAW 183: Property Law" -> "Property Law"; falls back to the whole name. */
export function courseSubject(name) {
	const s = String(name || "");
	const i = s.indexOf(":");
	return (i >= 0 ? s.slice(i + 1) : s.replace(/^[A-Za-z]{2,5}\s*-?\s*\d{3}[A-Za-z]?\s*/, "")).trim() || s;
}

export function courseCodeSpaced(name) {
	const m = /\b([A-Za-z]{2,5})\s*-?\s*(\d{3}[A-Za-z]?)\b/.exec(String(name || ""));
	return m ? `${m[1].toUpperCase()} ${m[2].toUpperCase()}` : String(name || "");
}

export function examBankUrl(courseName) {
	const code = courseCode(courseName);
	if (!code) return "";
	return `https://queensu.scholaris.ca/browse/title?scope=cab1b9d2-6777-45cd-b56d-78c608468888&startsWith=${encodeURIComponent(code)}`;
}

/** Finds the colour the host assigned to a course, matching by code first and then by exact name. */
export function courseColour(courses, courseName, fallback = "var(--accent)") {
	const list = Array.isArray(courses) ? courses : [];
	const code = courseCode(courseName);
	const hit =
		(code && list.find((c) => courseCode(c.name) === code)) ||
		list.find((c) => String(c.name || "").toLowerCase() === String(courseName || "").toLowerCase());
	return safeColour(hit && hit.colour, fallback);
}

const STATUS = {
	uploading: { label: "Uploading", tone: "accent" },
	queued: { label: "Queued", tone: "neutral" },
	reading: { label: "Reading", tone: "accent", busy: true },
	filed: { label: "Filed", tone: "good" },
	attention: { label: "Needs attention", tone: "warn" },
	failed: { label: "Failed", tone: "bad" },
};

export function statusMeta(status, pct) {
	const m = STATUS[status] || { label: status ? String(status) : "Unknown", tone: "neutral" };
	const label = status === "uploading" && Number.isFinite(pct) ? `Uploading ${Math.round(pct)}%` : m.label;
	return { label, tone: m.tone, busy: !!m.busy };
}

export function readingStatusMeta(status) {
	return status === "Checked" ? { label: "Checked", tone: "good" } : { label: "Machine-read", tone: "neutral" };
}

export function relativeTime(iso, now = Date.now()) {
	const t = Date.parse(iso);
	if (!Number.isFinite(t)) return "";
	const s = Math.max(0, Math.round((now - t) / 1000));
	if (s < 45) return "just now";
	const m = Math.round(s / 60);
	if (m < 60) return `${Math.max(1, m)} min ago`;
	const h = Math.round(m / 60);
	if (h < 24) return `${h} h ago`;
	const d = Math.round(h / 24);
	return `${d} d ago`;
}

function clockLabel(iso, now) {
	const d = new Date(iso);
	const n = new Date(now);
	const time = d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
	if (d.toDateString() === n.toDateString()) return time;
	return `${d.toLocaleDateString("en-CA", { month: "short", day: "numeric" })}, ${time}`;
}

/** Online if the heartbeat is within 20 minutes or the station is reading something right now. */
export function stationState(station, now = Date.now()) {
	if (!station || !station.at || !Number.isFinite(Date.parse(station.at))) {
		return { online: false, reading: null, label: "Scan station offline", detail: "It has not checked in yet" };
	}
	const age = now - Date.parse(station.at);
	const reading = station.reading ? String(station.reading) : null;
	if (reading || age <= STATION_FRESH_MS) {
		return {
			online: true,
			reading,
			label: "Scan station online",
			detail: reading ? `Reading ${reading}` : `last seen ${relativeTime(station.at, now)}`,
		};
	}
	return { online: false, reading: null, label: "Scan station offline", detail: `Offline since ${clockLabel(station.at, now)}` };
}

function pageNumber(v) {
	const n = Number(v);
	return Number.isFinite(n) ? n : Infinity;
}

export function sortReadings(readings, courseMap = {}) {
	return [...(readings || [])].sort((a, b) => {
		const ca = String(courseMap[a.courseId] || "");
		const cb = String(courseMap[b.courseId] || "");
		return (
			ca.localeCompare(cb, "en-CA", { numeric: true }) ||
			pageNumber(a.first) - pageNumber(b.first) ||
			String(a.title || "").localeCompare(String(b.title || ""), "en-CA", { numeric: true })
		);
	});
}

export function filterReadings(readings, { courseId = "all", query = "" } = {}) {
	const q = String(query || "").trim().toLowerCase();
	return (readings || []).filter((r) => {
		if (courseId && courseId !== "all" && r.courseId !== courseId) return false;
		if (!q) return true;
		return [r.title, r.book, r.authors].some((v) => String(v || "").toLowerCase().includes(q));
	});
}

export function formatBytes(n) {
	const v = Number(n) || 0;
	if (v < 1024) return `${v} B`;
	if (v < 1024 * 1024) return `${Math.round(v / 1024)} KB`;
	if (v < 1024 * 1024 * 1024) return `${(v / 1048576).toFixed(v < 10 * 1048576 ? 1 : 0)} MB`;
	return `${(v / 1073741824).toFixed(1)} GB`;
}

const PHOTO_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;
export function isPdf(f) {
	return f && (f.type === "application/pdf" || /\.pdf$/i.test(f.name || ""));
}
export function isPhoto(f) {
	return !!f && (/^image\/(jpeg|png|webp|heic|heif)$/i.test(f.type || "") || PHOTO_EXT.test(f.name || ""));
}
export function isAcceptedFile(f) {
	return isPdf(f) || isPhoto(f);
}

export function filesSummary(files) {
	const list = files || [];
	const bytes = list.reduce((s, f) => s + (Number(f.size) || 0), 0);
	if (!list.length) return "";
	const kind = list.length === 1 && isPdf(list[0]) ? "PDF" : `${list.length} ${list.length === 1 ? "photo" : "photos"}`;
	return `${kind} · ${formatBytes(bytes)}`;
}

/** Suggest a name from file names: single file -> its stem; several -> their common stem or the first stem. */
export function nameFromFiles(files) {
	const stems = (files || []).map((f) => String(f.name || "").replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim()).filter(Boolean);
	if (!stems.length) return "";
	if (stems.length === 1) return stems[0];
	let prefix = stems[0];
	for (const s of stems) while (prefix && !s.startsWith(prefix)) prefix = prefix.slice(0, -1);
	prefix = prefix.replace(/[\s\-_.(]+$/, "").replace(/\s*\d+$/, "").trim();
	return prefix.length >= 3 ? prefix : stems[0].replace(/[\s\-_.(]*\d+\)?$/, "").trim() || stems[0];
}

/** Prepend the course name unless the name already mentions that course (by code or full name). */
export function withCourseName(name, courseName) {
	const base = String(name || "").trim();
	const course = String(courseName || "").trim();
	if (!course) return base;
	const compact = base.toLowerCase().replace(/\s+/g, "");
	const code = courseCode(course).toLowerCase();
	if (compact.includes(course.toLowerCase().replace(/\s+/g, "")) || (code && compact.includes(code))) return base;
	return base ? `${course} ${base}` : `${course} `;
}

export function chunkCount(size, chunkBytes = DEFAULT_CHUNK) {
	return Math.max(1, Math.ceil((Number(size) || 0) / chunkBytes));
}

export function naturalFileSort(files) {
	return [...files].sort((a, b) => String(a.name).localeCompare(String(b.name), "en-CA", { numeric: true }));
}

/* ----- highlights ----- */

export function joinParagraphs(paragraphs) {
	return (paragraphs || []).map((p) => String(p ?? "")).join("\n");
}

export function paragraphOffsets(paragraphs) {
	let at = 0;
	return (paragraphs || []).map((p) => {
		const s = String(p ?? "");
		const out = { start: at, end: at + s.length };
		at += s.length + 1;
		return out;
	});
}

/** Clamp to the text and trim surrounding whitespace; null when nothing is left. */
export function normaliseRange(text, start, end) {
	let s = Math.max(0, Math.min(text.length, Math.min(start, end)));
	let e = Math.max(0, Math.min(text.length, Math.max(start, end)));
	while (s < e && /\s/.test(text[s])) s++;
	while (e > s && /\s/.test(text[e - 1])) e--;
	return e > s ? { start: s, end: e } : null;
}

export function makeHighlight({ id, page, text, start, end, category, note = "" }) {
	const r = normaliseRange(text, start, end);
	if (!r || !CAT[category]) return null;
	return {
		id: id || `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
		page,
		quote: text.slice(r.start, r.end),
		category,
		note: String(note || "").trim(),
		start: r.start,
		end: r.end,
	};
}

const PARA_MARK = /^\[\d+\]/;

/** HTML for a page's paragraphs with saved highlights (<mark data-hid>) and search hits layered in. Escapes everything. */
export function renderParagraphsHtml(paragraphs, highlights = [], search = []) {
	const offs = paragraphOffsets(paragraphs);
	return (paragraphs || [])
		.map((raw, i) => {
			const text = String(raw ?? "");
			const { start: ps, end: pe } = offs[i];
			const pn = PARA_MARK.exec(text);
			const hl = highlights.filter((h) => h.end > ps && h.start < pe);
			const fd = search.filter((h) => h.end > ps && h.start < pe);
			const points = new Set([ps, pe]);
			if (pn) points.add(ps + pn[0].length);
			for (const h of [...hl, ...fd]) {
				points.add(Math.max(ps, h.start));
				points.add(Math.min(pe, h.end));
			}
			const cuts = [...points].sort((a, b) => a - b);
			const segs = [];
			for (let k = 0; k < cuts.length - 1; k++) {
				const a = cuts[k];
				const b = cuts[k + 1];
				if (b <= a) continue;
				const f = fd.find((h) => h.start <= a && h.end >= b) || null;
				let top = null;
				for (const h of hl) if (h.start <= a && h.end >= b) top = h;
				let seg = esc(text.slice(a - ps, b - ps));
				if (pn && b <= ps + pn[0].length) seg = `<span class="lib-pn">${seg}</span>`;
				const last = segs[segs.length - 1];
				if (last && last.f === f && last.top === top) last.html += seg;
				else segs.push({ f, top, html: seg });
			}
			let html = "";
			for (const { f, top, html: seg0 } of segs) {
				let seg = seg0;
				if (f) seg = `<mark class="lib-find${f.current ? " lib-find-current" : ""}">${seg}</mark>`;
				if (top) seg = `<mark class="lib-hl${top.pending ? " lib-hl-pending" : ""}" data-hid="${esc(top.id)}" data-cat="${esc(top.category)}">${seg}</mark>`;
				html += seg;
			}
			return `<p class="lib-para" data-start="${ps}">${html || "<br>"}</p>`;
		})
		.join("");
}

export function findMatches(text, query) {
	const q = String(query || "").trim().toLowerCase();
	if (q.length < 2) return [];
	const hay = String(text || "").toLowerCase();
	const out = [];
	for (let i = hay.indexOf(q); i >= 0; i = hay.indexOf(q, i + q.length)) out.push({ start: i, end: i + q.length });
	return out;
}

export function sortHighlights(list) {
	return [...(list || [])].sort((a, b) => pageNumber(a.page) - pageNumber(b.page) || a.start - b.start);
}

export function groupHighlights(list) {
	return CATEGORIES.map((c) => ({ ...c, items: sortHighlights((list || []).filter((h) => h.category === c.id)) })).filter((g) => g.items.length);
}

export function citation(book, page) {
	return `(${book}, p. ${page})`;
}

export function briefMarkdown({ title, book, highlights }) {
	const name = book || title || "Reading";
	const out = [`# Brief: ${title || name}`, ""];
	if (book && title && book !== title) out.push(`_${book}_`, "");
	const groups = groupHighlights(highlights);
	if (!groups.length) out.push("_No passages saved yet._", "");
	for (const g of groups) {
		out.push(`## ${g.label}`, "");
		for (const h of g.items) {
			const lines = String(h.quote).split(/\n+/).map((l) => `> ${l}`);
			lines[lines.length - 1] += ` ${citation(name, h.page)}`;
			out.push(...lines, "");
			if (h.note) out.push(`**${g.prompt}** ${h.note.replace(/\n+/g, " ")}`, "");
		}
	}
	return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

export function slug(s) {
	return String(s || "brief").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "brief";
}

/* ---------- factory ---------- */

export function createLibrary({ api, store, icon, courses = [], notify = () => {}, onChange = null }) {
	const S = {
		readings: [],
		courseMap: {},
		loaded: false,
		loading: false,
		error: "",
		filter: "all",
		inbox: [],
		station: null,
		inboxError: "",
		uploads: [],
		draft: { files: [], name: "", touched: false, error: "" },
	};
	let version = 0;
	const bump = () => {
		version++;
		if (typeof onChange === "function") onChange();
	};
	const bound = new WeakSet();
	let reader = null;

	const ic = (name) => {
		try {
			return icon(name) || "";
		} catch {
			return "";
		}
	};

	async function json(path, init) {
		const res = await api(path, init);
		let data = {};
		try {
			data = await res.json();
		} catch {
			/* non-JSON body */
		}
		if (!res.ok) throw new Error(data.detail || data.error || `Request failed (${res.status})`);
		return data;
	}
	const jsonInit = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

	/* ----- data ----- */

	async function loadLibrary() {
		S.loading = !S.loaded;
		S.error = "";
		try {
			const d = await json(`${API}/library`);
			S.readings = Array.isArray(d.readings) ? d.readings : [];
			S.courseMap = d.courses || {};
			S.loaded = true;
		} catch (e) {
			S.error = e.message || "Could not load the library";
		}
		S.loading = false;
	}

	async function loadInbox() {
		try {
			const d = await json(`${API}/inbox`);
			S.inbox = Array.isArray(d.items) ? d.items : [];
			S.station = d.station || null;
			S.inboxError = "";
		} catch (e) {
			S.inboxError = e.message || "Could not reach the inbox";
		}
	}

	async function load() {
		S.loading = true;
		bump();
		await Promise.all([loadLibrary(), loadInbox()]);
		bump();
	}

	function inboxSignature() {
		return JSON.stringify([S.inbox, S.station && S.station.reading, stationState(S.station).label + stationState(S.station).detail, S.inboxError]);
	}

	async function poll() {
		const before = inboxSignature();
		const prev = new Map(S.inbox.map((i) => [i.id, i.status]));
		await loadInbox();
		const fresh = S.inbox.filter((i) => i.status === "filed" && prev.has(i.id) && prev.get(i.id) !== "filed");
		if (fresh.length) {
			notify(`${fresh[0].name || "A reading"} is on the shelf`);
			await loadLibrary();
			bump();
			return;
		}
		if (inboxSignature() !== before) bump();
	}

	/* ----- uploads ----- */

	function addFiles(list) {
		const incoming = [...(list || [])];
		const accepted = incoming.filter(isAcceptedFile);
		const d = S.draft;
		d.error = "";
		if (incoming.length && !accepted.length) d.error = "That file type is not supported. Use a PDF or photos (JPG, PNG, HEIC, WebP).";
		else if (accepted.length < incoming.length) d.error = "Some files were skipped. Only PDF and photos are supported.";
		if (!accepted.length) return bump();
		const pdf = accepted.find(isPdf);
		if (pdf) {
			d.files = [pdf];
			if (accepted.length > 1) d.error = "A reading is one PDF or a set of photos, so only the PDF was added.";
		} else {
			const current = d.files.filter(isPhoto);
			d.files = naturalFileSort([...current, ...accepted]);
		}
		if (!d.touched) d.name = nameFromFiles(d.files);
		bump();
	}

	function uploadBytes(up) {
		return up.files.reduce((s, f) => s + f.size, 0);
	}

	async function runUpload(up) {
		up.error = "";
		up.status = "uploading";
		bump();
		try {
			if (!up.itemId) {
				const d = await json(
					`${API}/inbox`,
					jsonInit({ name: up.name, files: up.files.map((f) => ({ name: f.name, type: f.type || "application/octet-stream", size: f.size })) }),
				);
				up.itemId = d.item.id;
				up.chunkBytes = d.chunkBytes || DEFAULT_CHUNK;
				up.cursor = { f: 0, c: 0 };
				up.sent = 0;
				S.inbox = [d.item, ...S.inbox.filter((i) => i.id !== d.item.id)];
			}
			const total = Math.max(1, uploadBytes(up));
			for (; up.cursor.f < up.files.length; up.cursor.f++, up.cursor.c = 0) {
				const file = up.files[up.cursor.f];
				const n = chunkCount(file.size, up.chunkBytes);
				for (; up.cursor.c < n; up.cursor.c++) {
					const blob = file.slice(up.cursor.c * up.chunkBytes, (up.cursor.c + 1) * up.chunkBytes);
					let lastError;
					for (let attempt = 0; attempt < 3; attempt++) {
						try {
							await json(`${API}/inbox/chunk?id=${encodeURIComponent(up.itemId)}&file=${up.cursor.f}&chunk=${up.cursor.c}`, {
								method: "PUT",
								headers: { "Content-Type": "application/octet-stream" },
								body: blob,
							});
							lastError = null;
							break;
						} catch (e) {
							lastError = e;
						}
					}
					if (lastError) throw lastError;
					up.sent += blob.size;
					up.pct = Math.min(99, Math.round((up.sent / total) * 100));
					bump();
				}
			}
			await json(`${API}/inbox/ready?id=${encodeURIComponent(up.itemId)}`, { method: "POST" });
			up.pct = 100;
			up.status = "done";
			await loadInbox();
			S.uploads = S.uploads.filter((u) => u !== up);
			bump();
		} catch (e) {
			up.status = "error";
			up.error = e.message || "Upload failed";
			bump();
		}
	}

	function startUpload() {
		const d = S.draft;
		if (!d.files.length) return;
		const name = String(d.name || "").trim() || nameFromFiles(d.files) || "Untitled reading";
		const up = { key: `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, files: d.files, itemId: null, pct: 0, status: "uploading", error: "" };
		S.uploads.unshift(up);
		S.draft = { files: [], name: "", touched: false, error: "" };
		runUpload(up);
	}

	async function dismiss(key) {
		const up = S.uploads.find((u) => u.key === key || u.itemId === key);
		const itemId = up ? up.itemId : key;
		if (up) S.uploads = S.uploads.filter((u) => u !== up);
		if (itemId) {
			S.inbox = S.inbox.filter((i) => i.id !== itemId);
			bump();
			try {
				await json(`${API}/inbox/remove?id=${encodeURIComponent(itemId)}`, { method: "POST" });
			} catch (e) {
				notify(e.message || "Could not remove that item");
				await loadInbox();
			}
		}
		bump();
	}

	/* ----- shelf rendering ----- */

	function inboxRows() {
		const rows = [];
		const locals = new Map(S.uploads.filter((u) => u.itemId).map((u) => [u.itemId, u]));
		for (const item of S.inbox) {
			const up = locals.get(item.id);
			const failedLocal = up && up.status === "error";
			const status = failedLocal ? "failed" : up && up.status === "uploading" ? "uploading" : item.status;
			rows.push({
				key: up ? up.key : item.id,
				itemId: item.id,
				name: item.name,
				status,
				pct: up && up.status === "uploading" ? up.pct : null,
				note: failedLocal ? up.error : item.note || "",
				meta: filesSummary(item.files),
				at: item.updatedAt || item.createdAt,
				readingId: item.readingId || null,
				retry: failedLocal ? up.key : null,
				at_sort: Date.parse(item.createdAt) || 0,
			});
		}
		for (const up of S.uploads) {
			if (up.itemId && S.inbox.some((i) => i.id === up.itemId)) continue;
			rows.push({
				key: up.key,
				itemId: up.itemId,
				name: up.name,
				status: up.status === "error" ? "failed" : "uploading",
				pct: up.status === "error" ? null : up.pct,
				note: up.error,
				meta: filesSummary(up.files),
				at: null,
				readingId: null,
				retry: up.status === "error" ? up.key : null,
				at_sort: Infinity,
			});
		}
		return rows.sort((a, b) => b.at_sort - a.at_sort);
	}

	function stationHtml() {
		const st = stationState(S.station);
		return `<div class="lib-station ${st.online ? "is-on" : "is-off"}" role="status"><i class="lib-light" aria-hidden="true"></i><span><b>${esc(st.label)}</b><small>${esc(st.detail)}</small></span></div>`;
	}

	function uploaderHtml() {
		const d = S.draft;
		const stage = d.files.length
			? `<form class="lib-stage" data-lib-form novalidate>
				<ul class="lib-files">${d.files
					.map(
						(f, i) =>
							`<li><span class="lib-file-ic">${ic("book")}</span><span class="lib-file-name">${esc(f.name)}</span><span class="lib-file-size">${esc(formatBytes(f.size))}</span><button type="button" class="lib-x" data-lib-remove-file="${i}" aria-label="Remove ${esc(f.name)}">${ic("close")}</button></li>`,
					)
					.join("")}</ul>
				<label class="lib-field"><span>Name</span><input data-lib-name type="text" maxlength="140" autocomplete="off" spellcheck="false" value="${esc(d.name)}" placeholder="Property pp. 144-188"></label>
				<p class="lib-help">Name it after the course and pages, e.g. Property pp. 144-188</p>
				${
					courses.length
						? `<div class="lib-chips" role="group" aria-label="Add a course to the name">${courses
								.map(
									(c) =>
										`<button type="button" class="lib-chip" data-lib-course-chip="${esc(c.name)}" style="--chip:${esc(safeColour(c.colour))}"><i aria-hidden="true"></i>${esc(courseCodeSpaced(c.name))}</button>`,
								)
								.join("")}</div>`
						: ""
				}
				<div class="lib-stage-actions"><button type="submit" class="lib-btn lib-btn-primary" data-lib-submit>Send to the scan station</button><button type="button" class="lib-btn lib-btn-ghost" data-lib-clear>Clear</button></div>
			</form>`
			: "";
		return `<section class="lib-add" aria-label="Add a reading">
			<div class="lib-add-head"><h3>Add a reading</h3><p>The scan station on your PC reads it (about 20 s a page) and files it in Notion.</p></div>
			<input type="file" class="lib-file-input" data-lib-file multiple accept="${ACCEPT_ATTR}" hidden>
			<div class="lib-drop${d.files.length ? " is-compact" : ""}" data-lib-drop>
				<button type="button" class="lib-drop-btn" data-lib-browse>
					<span class="lib-drop-ic">${ic("cloud")}</span>
					<span class="lib-drop-copy"><strong>${d.files.length ? "Add more photos" : "Drop a PDF or photos here"}</strong><span>or browse your files. PDF, JPG, PNG, HEIC or WebP; several photos become one reading.</span></span>
				</button>
			</div>
			${d.error ? `<p class="lib-inline-error" role="alert">${esc(d.error)}</p>` : ""}
			${stage}
		</section>`;
	}

	function inboxHtml() {
		const rows = inboxRows();
		if (!rows.length && !S.inboxError) return "";
		const body = rows
			.map((r) => {
				const m = statusMeta(r.status, r.pct);
				const bar =
					r.status === "uploading"
						? `<div class="lib-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(r.pct || 0)}"><i style="width:${Math.max(3, Math.round(r.pct || 0))}%"></i></div>`
						: m.busy
							? `<div class="lib-bar is-indeterminate" aria-hidden="true"><i></i></div>`
							: "";
				const actions = [
					r.status === "filed" && r.readingId ? `<button type="button" class="lib-btn lib-btn-small" data-lib-open="${esc(r.readingId)}">Open</button>` : "",
					r.retry ? `<button type="button" class="lib-btn lib-btn-small" data-lib-retry-upload="${esc(r.retry)}">Retry</button>` : "",
					r.status !== "reading"
						? `<button type="button" class="lib-x" data-lib-dismiss="${esc(r.key)}" aria-label="Dismiss ${esc(r.name)}">${ic("close")}</button>`
						: "",
				].join("");
				const when = r.at ? relativeTime(r.at) : "";
				return `<li class="lib-row" data-tone="${m.tone}" data-status="${esc(r.status)}">
					<span class="lib-row-ic">${ic(r.status === "uploading" ? "cloud" : r.status === "attention" || r.status === "failed" ? "flag" : r.status === "filed" ? "check" : "book")}</span>
					<div class="lib-row-main">
						<div class="lib-row-top"><b>${esc(r.name)}</b><span class="lib-pill" data-tone="${m.tone}">${esc(m.label)}</span></div>
						<p class="lib-row-meta">${esc([r.meta, when].filter(Boolean).join(" · "))}${r.note ? `<span class="lib-row-note">${esc(r.note)}</span>` : ""}</p>
						${bar}
					</div>
					<div class="lib-row-actions">${actions}</div>
				</li>`;
			})
			.join("");
		return `<section class="lib-inbox" aria-label="Scan station inbox">
			<div class="lib-section-head"><h3>In the scan station</h3></div>
			${S.inboxError ? `<p class="lib-inline-error" role="alert">${esc(S.inboxError)}</p>` : ""}
			<ul class="lib-rows">${body}</ul>
		</section>`;
	}

	function skeletonCards() {
		return Array.from({ length: 4 }, () => `<div class="lib-card lib-skel" aria-hidden="true"><span class="lib-spine"></span><div class="lib-card-body"><i class="lib-sk w30"></i><i class="lib-sk w90 h20"></i><i class="lib-sk w60"></i><i class="lib-sk w40"></i></div></div>`).join("");
	}

	function cardHtml(r) {
		const cname = S.courseMap[r.courseId] || "";
		const colour = courseColour(courses, cname);
		const rs = readingStatusMeta(r.status);
		const exam = examBankUrl(cname);
		const pages = r.first && r.last ? `pp. ${esc(r.first)}–${esc(r.last)}` : "";
		const byline = [r.book && r.book !== r.title ? r.book : "", r.authors].filter(Boolean).join(" · ");
		return `<article class="lib-card" style="--spine:${esc(colour)}">
			<span class="lib-spine" aria-hidden="true"></span>
			<div class="lib-card-body">
				<div class="lib-card-top"><span class="lib-course">${esc(courseCodeSpaced(cname) || "Reading")}</span><span class="lib-badge" data-tone="${rs.tone}">${esc(rs.label)}</span></div>
				<h3 class="lib-card-title"><button type="button" class="lib-card-open" data-lib-open="${esc(r.id)}">${esc(r.title)}</button></h3>
				${byline ? `<p class="lib-card-by">${esc(byline)}</p>` : ""}
				<div class="lib-card-foot">
					<span class="lib-pages">${pages}${r.captured ? `<small>${esc(r.captured)}</small>` : ""}</span>
					${exam ? `<a class="lib-exam" href="${esc(exam)}" target="_blank" rel="noopener noreferrer" title="Opens Queen's ExamBank in a new tab. Off-campus access needs a NetID login.">Past exams</a>` : ""}
					<span class="lib-go" aria-hidden="true">${ic("right")}</span>
				</div>
			</div>
		</article>`;
	}

	function shelfHtml() {
		if (S.error && !S.readings.length) {
			return `<div class="lib-state lib-state-error" role="alert"><p><b>The shelf did not load.</b><span>${esc(S.error)}</span></p><button type="button" class="lib-btn" data-lib-retry-load>Retry</button></div>`;
		}
		if (!S.loaded) return `<div class="lib-grid">${skeletonCards()}</div>`;
		const ids = [...new Set(S.readings.map((r) => r.courseId))].sort((a, b) => String(S.courseMap[a] || "").localeCompare(String(S.courseMap[b] || ""), "en-CA", { numeric: true }));
		if (!S.readings.length) {
			return `<div class="lib-state lib-empty"><div class="lib-books" aria-hidden="true"><i></i><i></i><i></i><i></i></div><h3>Your shelf is ready</h3><p>Add a scanned chapter above and it will appear here, typeset and ready to brief, as soon as the scan station files it.</p></div>`;
		}
		const filter = ids.includes(S.filter) ? S.filter : "all";
		const items = sortReadings(filterReadings(S.readings, { courseId: filter }), S.courseMap);
		const chips = [`<button type="button" class="lib-filter${filter === "all" ? " is-on" : ""}" data-lib-filter="all" aria-pressed="${filter === "all"}">All<span>${S.readings.length}</span></button>`]
			.concat(
				ids.map((id) => {
					const name = S.courseMap[id] || "Other";
					const n = S.readings.filter((r) => r.courseId === id).length;
					return `<button type="button" class="lib-filter${filter === id ? " is-on" : ""}" data-lib-filter="${esc(id)}" aria-pressed="${filter === id}" style="--chip:${esc(courseColour(courses, name))}"><i aria-hidden="true"></i>${esc(courseCodeSpaced(name))}<span>${n}</span></button>`;
				}),
			)
			.join("");
		const courseName = filter !== "all" ? S.courseMap[filter] : "";
		const exam = courseName ? examBankUrl(courseName) : "";
		return `<div class="lib-filters" role="group" aria-label="Filter by course">${chips}</div>
			${exam ? `<p class="lib-exam-line"><a href="${esc(exam)}" target="_blank" rel="noopener noreferrer">Past exams for ${esc(courseCodeSpaced(courseName))} in Queen's ExamBank</a><small>Off-campus access needs a NetID login.</small></p>` : ""}
			<div class="lib-grid">${items.map(cardHtml).join("")}</div>`;
	}

	function render() {
		const n = S.readings.length;
		const courseN = new Set(S.readings.map((r) => r.courseId)).size;
		const sub = !S.loaded ? "Opening the shelf" : n ? `${n} ${n === 1 ? "reading" : "readings"} across ${courseN} ${courseN === 1 ? "course" : "courses"}` : "Nothing filed yet";
		return `<section class="lib" data-lib>
			<header class="lib-head"><div><p class="lib-eyebrow">Law School Library</p><h2 class="lib-title">Readings</h2><p class="lib-sub">${esc(sub)}</p></div>${stationHtml()}</header>
			${uploaderHtml()}
			${inboxHtml()}
			<div class="lib-shelf">${shelfHtml()}</div>
		</section>`;
	}

	/* ----- shelf events ----- */

	function bind(root) {
		const el = root && (root.matches && root.matches("[data-lib]") ? root : root.querySelector && root.querySelector("[data-lib]"));
		const host = root && root.nodeType === 1 ? root : null;
		if (!host || bound.has(host)) return;
		bound.add(host);
		const inLib = (e) => (e.target && e.target.closest ? e.target.closest("[data-lib]") : null);
		host.addEventListener("click", (e) => {
			if (!inLib(e)) return;
			const t = e.target.closest("button, a, [data-lib-open]");
			if (!t) return;
			const d = t.dataset;
			if (d.libOpen) open(d.libOpen);
			else if (d.libFilter !== undefined) {
				S.filter = d.libFilter;
				bump();
			} else if (d.libBrowse !== undefined) {
				const input = host.querySelector("[data-lib-file]");
				if (input) input.click();
			} else if (d.libRemoveFile !== undefined) {
				S.draft.files.splice(Number(d.libRemoveFile), 1);
				if (!S.draft.touched) S.draft.name = nameFromFiles(S.draft.files);
				bump();
			} else if (d.libClear !== undefined) {
				S.draft = { files: [], name: "", touched: false, error: "" };
				bump();
			} else if (d.libCourseChip !== undefined) {
				S.draft.name = withCourseName(S.draft.name, d.libCourseChip);
				S.draft.touched = true;
				const input = host.querySelector("[data-lib-name]");
				if (input) {
					input.value = S.draft.name;
					input.focus();
					input.setSelectionRange(input.value.length, input.value.length);
				}
			} else if (d.libSubmit !== undefined) {
				e.preventDefault();
				startUpload();
			} else if (d.libRetryLoad !== undefined) load();
			else if (d.libRetryUpload !== undefined) {
				const up = S.uploads.find((u) => u.key === d.libRetryUpload);
				if (up) runUpload(up);
			} else if (d.libDismiss !== undefined) dismiss(d.libDismiss);
		});
		host.addEventListener("submit", (e) => {
			if (!inLib(e)) return;
			e.preventDefault();
			startUpload();
		});
		host.addEventListener("input", (e) => {
			if (e.target && e.target.matches && e.target.matches("[data-lib-name]")) {
				S.draft.name = e.target.value;
				S.draft.touched = true;
			}
		});
		host.addEventListener("change", (e) => {
			if (e.target && e.target.matches && e.target.matches("[data-lib-file]")) {
				addFiles(e.target.files);
				e.target.value = "";
			}
		});
		const zone = (e) => (e.target && e.target.closest ? e.target.closest("[data-lib-drop]") : null);
		const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
		host.addEventListener("dragenter", (e) => {
			const z = zone(e);
			if (z && hasFiles(e)) {
				e.preventDefault();
				z.classList.add("is-over");
			}
		});
		host.addEventListener("dragover", (e) => {
			const z = zone(e);
			if (z && hasFiles(e)) {
				e.preventDefault();
				e.dataTransfer.dropEffect = "copy";
				z.classList.add("is-over");
			}
		});
		host.addEventListener("dragleave", (e) => {
			const z = zone(e);
			if (z && !z.contains(e.relatedTarget)) z.classList.remove("is-over");
		});
		host.addEventListener("drop", (e) => {
			const z = zone(e);
			if (!z || !hasFiles(e)) return;
			e.preventDefault();
			z.classList.remove("is-over");
			addFiles(e.dataTransfer.files);
		});
		void el;
	}

	/* ---------- reader ---------- */

	function open(readingId) {
		if (reader) reader.close();
		reader = createReader(readingId);
	}

	function createReader(readingId) {
		const meta = S.readings.find((r) => r.id === readingId) || { id: readingId, title: "Reading" };
		const cname = S.courseMap[meta.courseId] || "";
		const spine = courseColour(courses, cname);
		const bookName = meta.book || meta.title || "Reading";
		const briefKey = `library:brief:${readingId}`;
		const reduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
		const prevFocus = document.activeElement;
		const R = {
			pages: [],
			total: 0,
			nextOffset: 0,
			loading: false,
			error: "",
			dead: false,
			batchAt: {},
			view: {},
			current: 0,
			search: { open: false, q: "", matches: [], at: 0 },
			pending: null,
			sel: null,
		};
		let highlights = [];
		try {
			const saved = store.get(briefKey);
			if (saved && Array.isArray(saved.highlights)) highlights = saved.highlights.filter((h) => h && CAT[h.category] && Number.isFinite(h.start) && Number.isFinite(h.end));
		} catch {
			highlights = [];
		}

		const overlay = document.createElement("div");
		overlay.className = "lib-reader";
		overlay.setAttribute("role", "dialog");
		overlay.setAttribute("aria-modal", "true");
		overlay.setAttribute("aria-label", `Reading: ${meta.title || ""}`);
		overlay.style.setProperty("--spine", spine);
		overlay.innerHTML = `
			<header class="lib-r-bar">
				<button type="button" class="lib-iconbtn" data-r-close aria-label="Close reading (Esc)">${ic("close")}</button>
				<div class="lib-r-title"><span class="lib-r-eyebrow"><i aria-hidden="true"></i>${esc(courseCodeSpaced(cname) || "Reading")}</span><h2>${esc(meta.title)}</h2><p>${esc([meta.book && meta.book !== meta.title ? meta.book : "", meta.authors].filter(Boolean).join(" · "))}</p></div>
				<div class="lib-r-where"><span data-r-where>Loading pages</span><div class="lib-r-meter" aria-hidden="true"><i data-r-meter></i></div></div>
				<div class="lib-r-tools">
					<button type="button" class="lib-iconbtn" data-r-prev aria-label="Previous page (k)">${ic("up")}</button>
					<button type="button" class="lib-iconbtn" data-r-next aria-label="Next page (j)">${ic("down")}</button>
					<button type="button" class="lib-iconbtn" data-r-search-toggle aria-label="Search in this reading (Ctrl+F)">${ic("search")}</button>
				</div>
			</header>
			<div class="lib-r-search" data-r-searchbar hidden>
				<span class="lib-r-search-ic">${ic("search")}</span>
				<input type="search" data-r-search placeholder="Search this reading" aria-label="Search this reading" autocomplete="off" spellcheck="false">
				<span class="lib-r-count" data-r-count aria-live="polite"></span>
				<button type="button" class="lib-iconbtn" data-r-find-prev aria-label="Previous match">${ic("up")}</button>
				<button type="button" class="lib-iconbtn" data-r-find-next aria-label="Next match">${ic("down")}</button>
				<button type="button" class="lib-iconbtn" data-r-search-close aria-label="Close search">${ic("close")}</button>
			</div>
			<div class="lib-r-body">
				<nav class="lib-r-rail" aria-label="Pages" data-r-rail></nav>
				<main class="lib-r-scroll" data-r-scroll tabindex="-1"><div class="lib-r-column" data-r-column></div></main>
				<aside class="lib-r-brief" data-r-brief aria-label="Brief"></aside>
			</div>
			<button type="button" class="lib-r-fab" data-r-sheet aria-expanded="false">${ic("list")}<span>Brief</span><b data-r-fab-count>0</b></button>
			<div class="lib-r-scrim" data-r-scrim></div>
			<div class="lib-pop" data-r-pop hidden></div>`;
		document.body.appendChild(overlay);
		document.body.classList.add("lib-reader-open");

		const q = (sel) => overlay.querySelector(sel);
		const scroller = q("[data-r-scroll]");
		const column = q("[data-r-column]");
		const rail = q("[data-r-rail]");
		const briefEl = q("[data-r-brief]");
		const pop = q("[data-r-pop]");
		const searchInput = q("[data-r-search]");

		const label = (p, i) => (p && p.printed != null && p.printed !== "" ? p.printed : i + 1);
		const hlFor = (i) => {
			const p = R.pages[i];
			if (!p) return [];
			const key = String(label(p, i));
			const list = highlights.filter((h) => String(h.page) === key);
			if (R.pending && String(R.pending.page) === key) list.push({ ...R.pending, pending: true });
			return list;
		};
		const pageText = (i) => joinParagraphs(R.pages[i] && R.pages[i].paragraphs);

		function searchRanges(i) {
			const out = [];
			R.search.matches.forEach((m, k) => {
				if (m.i === i) out.push({ start: m.start, end: m.end, current: k === R.search.at });
			});
			return out;
		}

		function pageHtml(i) {
			const p = R.pages[i];
			if (!p) {
				return `<section class="lib-page is-skeleton" data-i="${i}" aria-busy="true"><div class="lib-gutter"><span class="lib-pnum"><i class="lib-sk w60"></i></span></div><div class="lib-page-main"><i class="lib-sk w90"></i><i class="lib-sk w100"></i><i class="lib-sk w100"></i><i class="lib-sk w80"></i><i class="lib-sk w100"></i><i class="lib-sk w60"></i></div></section>`;
			}
			const num = label(p, i);
			const photoMode = R.view[i] === "photo" && p.photo;
			const flags = (p.flags || [])
				.map((f) => {
					const text = String(f).replace(/^\s*check against the photo:?\s*/i, "");
					return `<div class="lib-flag">${ic("flag")}<p><b>Check against the photo</b>${text ? `<span>${esc(text)}</span>` : ""}${p.photo && !photoMode ? `<button type="button" data-r-view="photo" data-i="${i}">See the photo</button>` : ""}</p></div>`;
				})
				.join("");
			const toggle = `<div class="lib-seg" role="group" aria-label="Page ${esc(num)} view"><button type="button" data-r-view="text" data-i="${i}" aria-pressed="${!photoMode}">Text</button><button type="button" data-r-view="photo" data-i="${i}" aria-pressed="${!!photoMode}"${p.photo ? "" : " disabled title=\"No photo for this page\""}>Photo</button></div>`;
			const body = photoMode
				? `<figure class="lib-photo"><img src="${esc(p.photo)}" alt="Original photo of page ${esc(num)}" data-i="${i}" loading="lazy"><figcaption>Original photo<a href="${esc(p.photo)}" target="_blank" rel="noopener noreferrer">Open full size</a></figcaption></figure>`
				: `<div class="lib-pagetext" data-i="${i}" lang="en-CA">${renderParagraphsHtml(p.paragraphs || [], hlFor(i), searchRanges(i))}</div>`;
			return `<section class="lib-page" data-i="${i}" id="lib-p-${i}"><div class="lib-gutter"><span class="lib-pnum" title="Printed page ${esc(num)}"><small>p.</small>${esc(num)}</span></div><div class="lib-page-main"><div class="lib-page-tools">${toggle}</div>${flags}${body}</div></section>`;
		}

		function renderColumn() {
			const count = Math.max(R.total, R.pages.length);
			let html = "";
			for (let i = 0; i < count; i++) html += pageHtml(i);
			if (R.error) html += `<div class="lib-state lib-state-error" role="alert"><p><b>Some pages did not load.</b><span>${esc(R.error)}</span></p><button type="button" class="lib-btn" data-r-retry>Retry</button></div>`;
			if (!count && !R.error) for (let i = 0; i < 3; i++) html += pageHtml(i);
			column.innerHTML = html;
		}

		function renderPage(i) {
			const cur = column.querySelector(`.lib-page[data-i="${i}"]`);
			if (!cur) return;
			const t = document.createElement("template");
			t.innerHTML = pageHtml(i);
			cur.replaceWith(t.content.firstElementChild);
		}

		function renderRail() {
			const count = Math.max(R.total, R.pages.length);
			const sequential = meta.first && meta.last && Number(meta.last) - Number(meta.first) + 1 === count;
			let html = "";
			for (let i = 0; i < count; i++) {
				const p = R.pages[i];
				const num = p ? label(p, i) : sequential ? Number(meta.first) + i : "…";
				const n = p ? hlFor(i).filter((h) => !h.pending).length : 0;
				html += `<button type="button" class="lib-rail-item${i === R.current ? " is-current" : ""}${p ? "" : " is-pending"}${p && p.flags && p.flags.length ? " has-flag" : ""}" data-r-go="${i}" ${i === R.current ? 'aria-current="true"' : ""}><span>p. ${esc(num)}</span>${n ? `<b>${n}</b>` : ""}</button>`;
			}
			rail.innerHTML = `<p class="lib-rail-head">Pages</p>${html}`;
			const cur = rail.querySelector(".is-current");
			if (cur) cur.scrollIntoView({ block: "nearest" });
		}

		function renderProgress() {
			const count = Math.max(R.total, R.pages.length);
			const p = R.pages[R.current];
			q("[data-r-where]").textContent = count ? `${p ? `p. ${label(p, R.current)} · ` : ""}${R.current + 1} of ${count}` : "Loading pages";
			q("[data-r-meter]").style.width = count ? `${Math.round(((R.current + 1) / count) * 100)}%` : "0%";
			rail.querySelectorAll(".lib-rail-item").forEach((b) => {
				const on = Number(b.dataset.rGo) === R.current;
				b.classList.toggle("is-current", on);
				if (on) {
					b.setAttribute("aria-current", "true");
					b.scrollIntoView({ block: "nearest" });
				} else b.removeAttribute("aria-current");
			});
		}

		function renderBrief() {
			const groups = groupHighlights(highlights);
			q("[data-r-fab-count]").textContent = String(highlights.length);
			if (!groups.length) {
				briefEl.innerHTML = `<div class="lib-b-head"><div><p class="lib-eyebrow">Brief</p><h3>Your FIRAC brief</h3></div><button type="button" class="lib-iconbtn lib-b-close" data-r-sheet aria-label="Close brief">${ic("close")}</button></div>
					<div class="lib-b-empty"><p>Select a passage in the reading and choose what it is. Add a line in your own words and it lands here.</p><ul>${CATEGORIES.filter((c) => c.id !== "unsure").map((c) => `<li style="--cat:${c.colour}"><i></i>${esc(c.label)}</li>`).join("")}</ul></div>`;
				return;
			}
			briefEl.innerHTML = `<div class="lib-b-head"><div><p class="lib-eyebrow">Brief</p><h3>${highlights.length} ${highlights.length === 1 ? "passage" : "passages"}</h3></div>
				<div class="lib-b-tools"><button type="button" class="lib-iconbtn" data-r-copy aria-label="Copy brief as Markdown" title="Copy as Markdown">${ic("copy")}</button><button type="button" class="lib-btn lib-btn-small" data-r-export>Export .md</button><button type="button" class="lib-iconbtn lib-b-close" data-r-sheet aria-label="Close brief">${ic("close")}</button></div></div>
				<div class="lib-b-scroll">${groups
					.map(
						(g) => `<section class="lib-b-group" style="--cat:${g.colour}"><h4><i></i>${esc(g.label)}<span>${g.items.length}</span></h4>${g.items
							.map(
								(h) => `<article class="lib-b-entry" data-hid="${esc(h.id)}"><button type="button" class="lib-b-jump" data-r-jump="${esc(h.id)}"><span class="lib-b-page">p. ${esc(h.page)}</span><blockquote>${esc(h.quote)}</blockquote></button>${h.note ? `<p class="lib-b-note">${esc(h.note)}</p>` : ""}<div class="lib-b-actions"><button type="button" class="lib-iconbtn" data-r-edit="${esc(h.id)}" aria-label="Edit note">${ic("edit")}</button><button type="button" class="lib-iconbtn" data-r-del="${esc(h.id)}" aria-label="Remove from brief">${ic("trash")}</button></div></article>`,
							)
							.join("")}</section>`,
					)
					.join("")}</div>`;
		}

		function persist() {
			try {
				store.set(briefKey, { readingId, title: meta.title || "", highlights, updatedAt: new Date().toISOString() });
			} catch (e) {
				notify("Could not save the brief");
			}
			bump();
		}

		/* ----- pages loading ----- */

		async function fetchBatch(offset) {
			const d = await json(`${API}/library/pages?id=${encodeURIComponent(readingId)}&offset=${offset}&limit=${BATCH}`);
			if (R.dead) return d;
			R.total = Number(d.total) || R.total;
			if (R.pages.length < R.total) R.pages.length = R.total;
			const at = Number.isFinite(d.offset) ? d.offset : offset;
			(d.pages || []).forEach((p, k) => {
				R.pages[at + k] = p;
			});
			R.batchAt[Math.floor(at / BATCH)] = Date.now();
			return d;
		}

		async function loadAll() {
			if (R.loading) return;
			R.loading = true;
			R.error = "";
			try {
				while (!R.dead && (R.nextOffset < R.total || R.nextOffset === 0)) {
					const first = R.nextOffset === 0;
					const offset = R.nextOffset;
					await fetchBatch(offset);
					if (R.dead) return;
					R.nextOffset = offset + BATCH;
					if (first) {
						renderColumn();
						renderRail();
						renderProgress();
					} else {
						for (let i = offset; i < Math.min(offset + BATCH, R.total); i++) renderPage(i);
						renderRail();
						renderProgress();
					}
					refreshSearch(true);
				}
			} catch (e) {
				if (!R.dead) {
					R.error = e.message || "Could not load pages";
					renderColumn();
				}
			}
			R.loading = false;
		}

		let reloadingBatch = {};
		async function reloadBatchFor(i) {
			const b = Math.floor(i / BATCH);
			if (reloadingBatch[b] || Date.now() - (R.batchAt[b] || 0) < 5000) return;
			reloadingBatch[b] = true;
			try {
				await fetchBatch(b * BATCH);
				for (let k = b * BATCH; k < Math.min((b + 1) * BATCH, R.total); k++) renderPage(k);
			} catch (e) {
				notify("Could not refresh the photo links");
			}
			reloadingBatch[b] = false;
		}

		/* ----- navigation ----- */

		function goTo(i, behavior) {
			const count = Math.max(R.total, R.pages.length);
			if (!count) return;
			i = Math.max(0, Math.min(count - 1, i));
			const el = column.querySelector(`.lib-page[data-i="${i}"]`);
			if (!el) return;
			R.current = i;
			el.scrollIntoView({ behavior: behavior || (reduced() ? "auto" : "smooth"), block: "start" });
			renderProgress();
			const v = R.view[i] === "photo" && R.pages[i] && R.pages[i].photo;
			if (v && Date.now() - (R.batchAt[Math.floor(i / BATCH)] || 0) > PHOTO_TTL_MS) reloadBatchFor(i);
		}

		let raf = 0;
		scroller.addEventListener(
			"scroll",
			() => {
				if (raf) return;
				raf = requestAnimationFrame(() => {
					raf = 0;
					const line = scroller.scrollTop + scroller.clientHeight * 0.3;
					const pagesEls = column.querySelectorAll(".lib-page");
					let at = 0;
					for (let k = 0; k < pagesEls.length; k++) {
						if (pagesEls[k].offsetTop <= line) at = k;
						else break;
					}
					if (at !== R.current) {
						R.current = at;
						renderProgress();
					}
				});
			},
			{ passive: true },
		);

		/* ----- search ----- */

		function refreshSearch(keepAt) {
			const s = R.search;
			const query = s.q;
			const prev = s.matches.map((m) => m.i);
			s.matches = [];
			if (query.trim().length >= 2) {
				R.pages.forEach((p, i) => {
					if (!p || R.view[i] === "photo") return;
					for (const m of findMatches(pageText(i), query)) s.matches.push({ ...m, i });
				});
			}
			if (!keepAt || s.at >= s.matches.length) s.at = 0;
			q("[data-r-count]").textContent = query.trim().length < 2 ? "" : s.matches.length ? `${s.at + 1} of ${s.matches.length}` : "No matches";
			const touched = new Set([...prev, ...s.matches.map((m) => m.i)]);
			touched.forEach((i) => R.pages[i] && renderPage(i));
		}

		function stepSearch(d) {
			const s = R.search;
			if (!s.matches.length) return;
			s.at = (s.at + d + s.matches.length) % s.matches.length;
			q("[data-r-count]").textContent = `${s.at + 1} of ${s.matches.length}`;
			const touched = new Set([s.matches[s.at].i, ...s.matches.map((m) => m.i)]);
			touched.forEach((i) => renderPage(i));
			const cur = column.querySelector(".lib-find-current");
			if (cur) cur.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
		}

		function openSearch() {
			R.search.open = true;
			q("[data-r-searchbar]").hidden = false;
			searchInput.focus();
			searchInput.select();
		}
		function closeSearch() {
			R.search.open = false;
			R.search.q = "";
			searchInput.value = "";
			q("[data-r-searchbar]").hidden = true;
			refreshSearch();
			scroller.focus({ preventScroll: true });
		}
		let searchTimer = 0;
		searchInput.addEventListener("input", () => {
			clearTimeout(searchTimer);
			searchTimer = setTimeout(() => {
				R.search.q = searchInput.value;
				refreshSearch();
				if (R.search.matches.length) {
					const cur = column.querySelector(".lib-find-current");
					if (cur) cur.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
				}
			}, 140);
		});
		searchInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				stepSearch(e.shiftKey ? -1 : 1);
			}
		});

		/* ----- selection, palette, composer ----- */

		function hidePop() {
			pop.hidden = true;
			pop.innerHTML = "";
			pop.dataset.mode = "";
		}

		function pointToOffset(container, node, off) {
			const ps = [...container.querySelectorAll(".lib-para")];
			for (const p of ps) {
				const r = document.createRange();
				r.selectNodeContents(p);
				let cmp;
				try {
					cmp = r.comparePoint(node, off);
				} catch {
					cmp = 1;
				}
				if (cmp === 1) continue;
				if (cmp === -1) return Number(p.dataset.start);
				const pre = document.createRange();
				pre.selectNodeContents(p);
				pre.setEnd(node, off);
				return Number(p.dataset.start) + pre.toString().length;
			}
			const last = ps[ps.length - 1];
			return last ? Number(last.dataset.start) + last.textContent.length : 0;
		}

		function readSelection() {
			const sel = window.getSelection();
			if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
			const range = sel.getRangeAt(0);
			const startEl = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
			const container = startEl && startEl.closest && startEl.closest(".lib-pagetext");
			if (!container || !column.contains(container)) return null;
			const i = Number(container.dataset.i);
			const text = pageText(i);
			const start = pointToOffset(container, range.startContainer, range.startOffset);
			const endEl = range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement;
			const end = endEl && container.contains(endEl) ? pointToOffset(container, range.endContainer, range.endOffset) : text.length;
			const r = normaliseRange(text, start, end);
			if (!r) return null;
			const rect = range.getBoundingClientRect();
			return { i, page: label(R.pages[i], i), start: r.start, end: r.end, rect };
		}

		function placePop(rect) {
			const w = Math.min(window.innerWidth, 380);
			const x = Math.max(12, Math.min(window.innerWidth - w - 12, rect.left + rect.width / 2 - w / 2));
			const above = rect.top > 150;
			pop.style.setProperty("--pop-x", `${x}px`);
			pop.style.setProperty("--pop-y", `${above ? Math.max(12, rect.top - 12) : Math.min(window.innerHeight - 24, rect.bottom + 12)}px`);
			pop.dataset.place = above ? "above" : "below";
		}

		function showPalette(sel) {
			R.sel = sel;
			pop.dataset.mode = "palette";
			pop.innerHTML = `<div class="lib-palette" role="toolbar" aria-label="Classify the selected passage">${CATEGORIES.map(
				(c, k) => `<button type="button" data-r-cat="${c.id}" style="--cat:${c.colour}" title="${esc(c.label)} (${k + 1})"><i aria-hidden="true"></i>${esc(c.label)}</button>`,
			).join("")}</div>`;
			placePop(sel.rect);
			pop.hidden = false;
		}

		function openComposer({ sel, category, editing }) {
			const c = CAT[category];
			const base = editing || null;
			R.composer = { sel, category, editing: base };
			if (!base) {
				R.pending = { id: "pending", page: sel.page, quote: "", category, note: "", start: sel.start, end: sel.end };
				renderPage(sel.i);
			}
			const quote = base ? base.quote : pageText(sel.i).slice(sel.start, sel.end);
			pop.dataset.mode = "composer";
			pop.innerHTML = `<form class="lib-composer" style="--cat:${c.colour}" data-r-form>
				<div class="lib-c-head"><span class="lib-c-tag"><i></i>${esc(c.label)}</span><span class="lib-c-page">p. ${esc(base ? base.page : sel.page)}</span><button type="button" class="lib-iconbtn" data-r-cancel aria-label="Cancel">${ic("close")}</button></div>
				<blockquote>${esc(quote.length > 220 ? quote.slice(0, 217) + "…" : quote)}</blockquote>
				<label><span>${esc(c.prompt)}</span><textarea rows="3" data-r-note placeholder="In your own words" maxlength="1200">${esc(base ? base.note : "")}</textarea></label>
				<div class="lib-c-actions"><button type="submit" class="lib-btn lib-btn-primary">${base ? "Save" : "Add to brief"}</button>${base ? "" : `<button type="button" class="lib-btn lib-btn-ghost" data-r-nonote>Add without a note</button>`}<small>Ctrl+Enter saves</small></div>
			</form>`;
			if (sel && sel.rect && !base) placePop(sel.rect);
			else {
				pop.style.setProperty("--pop-x", `${Math.max(12, window.innerWidth / 2 - 190)}px`);
				pop.style.setProperty("--pop-y", `${Math.round(window.innerHeight / 2 - 120)}px`);
				pop.dataset.place = "below";
			}
			pop.hidden = false;
			window.getSelection && window.getSelection().removeAllRanges();
			const ta = pop.querySelector("textarea");
			if (ta) ta.focus({ preventScroll: true });
		}

		function cancelComposer() {
			const c = R.composer;
			R.composer = null;
			if (R.pending) {
				const i = Number(R.pendingIndex ?? c?.sel?.i);
				R.pending = null;
				if (Number.isFinite(i)) renderPage(i);
			}
			hidePop();
		}

		function saveComposer(withNote) {
			const c = R.composer;
			if (!c) return;
			const note = withNote ? (pop.querySelector("textarea")?.value || "").trim() : "";
			if (c.editing) {
				const h = highlights.find((x) => x.id === c.editing.id);
				if (h) h.note = note;
				R.composer = null;
				hidePop();
				persist();
				renderBrief();
				return;
			}
			const text = pageText(c.sel.i);
			const h = makeHighlight({ page: c.sel.page, text, start: c.sel.start, end: c.sel.end, category: c.category, note });
			R.composer = null;
			R.pending = null;
			hidePop();
			if (h) {
				highlights.push(h);
				persist();
				renderBrief();
				renderRail();
				renderProgress();
			}
			renderPage(c.sel.i);
		}

		let selTimer = 0;
		function onSelectionChange() {
			clearTimeout(selTimer);
			selTimer = setTimeout(() => {
				if (R.dead || R.composer) return;
				const sel = readSelection();
				if (sel) showPalette(sel);
				else if (pop.dataset.mode === "palette") hidePop();
			}, 180);
		}
		document.addEventListener("selectionchange", onSelectionChange);

		pop.addEventListener("mousedown", (e) => {
			if (!e.target.closest("textarea, input")) e.preventDefault();
		});

		/* ----- export ----- */

		function exportMarkdown() {
			const md = briefMarkdown({ title: meta.title, book: bookName, highlights });
			const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${slug(meta.title)}-brief.md`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			setTimeout(() => URL.revokeObjectURL(url), 2000);
		}

		/* ----- events ----- */

		function jumpToHighlight(id) {
			const h = highlights.find((x) => x.id === id);
			if (!h) return;
			const i = R.pages.findIndex((p, k) => p && String(label(p, k)) === String(h.page));
			if (i < 0) return notify("That page is still loading");
			if (R.view[i] === "photo") {
				R.view[i] = "text";
				renderPage(i);
			}
			goTo(i, "auto");
			overlay.classList.remove("is-sheet");
			requestAnimationFrame(() => {
				const mark = column.querySelector(`mark[data-hid="${CSS.escape(id)}"]`);
				if (mark) {
					mark.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
					column.querySelectorAll(`mark[data-hid="${CSS.escape(id)}"]`).forEach((m) => {
						m.classList.remove("is-flash");
						void m.offsetWidth;
						m.classList.add("is-flash");
					});
				}
			});
		}

		let delTimer = 0;
		overlay.addEventListener("click", (e) => {
			const t = e.target.closest("button, a, mark");
			if (!t || !overlay.contains(t)) return;
			const d = t.dataset;
			if (t.tagName === "MARK" && d.hid) {
				const entry = briefEl.querySelector(`.lib-b-entry[data-hid="${CSS.escape(d.hid)}"]`);
				if (entry) {
					overlay.classList.add("is-sheet");
					entry.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
					entry.classList.remove("is-flash");
					void entry.offsetWidth;
					entry.classList.add("is-flash");
				}
				return;
			}
			if (d.rClose !== undefined) close();
			else if (d.rPrev !== undefined) goTo(R.current - 1);
			else if (d.rNext !== undefined) goTo(R.current + 1);
			else if (d.rGo !== undefined) goTo(Number(d.rGo));
			else if (d.rSearchToggle !== undefined) (R.search.open ? closeSearch : openSearch)();
			else if (d.rSearchClose !== undefined) closeSearch();
			else if (d.rFindPrev !== undefined) stepSearch(-1);
			else if (d.rFindNext !== undefined) stepSearch(1);
			else if (d.rView !== undefined) {
				const i = Number(d.i);
				R.view[i] = d.rView === "photo" ? "photo" : "text";
				renderPage(i);
				if (R.view[i] === "photo" && Date.now() - (R.batchAt[Math.floor(i / BATCH)] || 0) > PHOTO_TTL_MS) reloadBatchFor(i);
				if (R.search.q) refreshSearch(true);
			} else if (d.rRetry !== undefined) {
				R.error = "";
				renderColumn();
				loadAll();
			} else if (d.rCat !== undefined && R.sel) {
				const sel = R.sel;
				R.sel = null;
				openComposer({ sel, category: d.rCat });
			} else if (d.rCancel !== undefined) cancelComposer();
			else if (d.rNonote !== undefined) saveComposer(false);
			else if (d.rJump !== undefined) jumpToHighlight(d.rJump);
			else if (d.rEdit !== undefined) {
				const h = highlights.find((x) => x.id === d.rEdit);
				if (h) openComposer({ sel: { page: h.page }, category: h.category, editing: h });
			} else if (d.rDel !== undefined) {
				if (t.dataset.confirm) {
					clearTimeout(delTimer);
					const i = R.pages.findIndex((p, k) => p && String(label(p, k)) === String(highlights.find((x) => x.id === d.rDel)?.page));
					highlights = highlights.filter((x) => x.id !== d.rDel);
					persist();
					renderBrief();
					if (i >= 0) renderPage(i);
					renderRail();
					renderProgress();
				} else {
					t.dataset.confirm = "1";
					t.classList.add("is-confirm");
					t.setAttribute("aria-label", "Confirm removal");
					t.innerHTML = "Remove?";
					delTimer = setTimeout(renderBrief, 2600);
				}
			} else if (d.rExport !== undefined) exportMarkdown();
			else if (d.rCopy !== undefined) {
				const md = briefMarkdown({ title: meta.title, book: bookName, highlights });
				(navigator.clipboard ? navigator.clipboard.writeText(md) : Promise.reject()).then(
					() => notify("Brief copied as Markdown"),
					() => notify("Could not copy. Use Export instead."),
				);
			} else if (d.rSheet !== undefined) {
				const on = !overlay.classList.contains("is-sheet");
				overlay.classList.toggle("is-sheet", on);
				q("[data-r-sheet]").setAttribute("aria-expanded", String(on));
			}
		});
		overlay.addEventListener("click", (e) => {
			if (e.target.matches("[data-r-scrim]")) overlay.classList.remove("is-sheet");
		});
		overlay.addEventListener("submit", (e) => {
			e.preventDefault();
			saveComposer(true);
		});
		overlay.addEventListener("keydown", (e) => {
			if (e.target.matches && e.target.matches("[data-r-note]") && e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				saveComposer(true);
			}
		});
		column.addEventListener(
			"error",
			(e) => {
				if (e.target && e.target.tagName === "IMG") reloadBatchFor(Number(e.target.dataset.i));
			},
			true,
		);

		function onKey(e) {
			if (R.dead) return;
			const typing = e.target && e.target.matches && e.target.matches("input, textarea, select, [contenteditable]");
			if (e.key === "Escape") {
				e.preventDefault();
				if (R.composer) cancelComposer();
				else if (!pop.hidden) hidePop();
				else if (R.search.open) closeSearch();
				else if (overlay.classList.contains("is-sheet")) overlay.classList.remove("is-sheet");
				else close();
				return;
			}
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
				e.preventDefault();
				openSearch();
				return;
			}
			if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
			if (pop.dataset.mode === "palette" && /^[1-6]$/.test(e.key) && R.sel) {
				e.preventDefault();
				const sel = R.sel;
				R.sel = null;
				openComposer({ sel, category: CATEGORIES[Number(e.key) - 1].id });
				return;
			}
			if (e.key === "j" || e.key === "ArrowRight") {
				e.preventDefault();
				goTo(R.current + 1);
			} else if (e.key === "k" || e.key === "ArrowLeft") {
				e.preventDefault();
				goTo(R.current - 1);
			} else if (e.key === "/") {
				e.preventDefault();
				openSearch();
			}
		}
		document.addEventListener("keydown", onKey);

		function close() {
			if (R.dead) return;
			R.dead = true;
			document.removeEventListener("keydown", onKey);
			document.removeEventListener("selectionchange", onSelectionChange);
			clearTimeout(selTimer);
			clearTimeout(searchTimer);
			overlay.remove();
			document.body.classList.remove("lib-reader-open");
			if (reader === R) reader = null;
			if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
		}
		R.close = close;

		renderColumn();
		renderRail();
		renderBrief();
		renderProgress();
		scroller.focus({ preventScroll: true });
		loadAll();
		return R;
	}

	return {
		load,
		poll,
		render,
		bind,
		open,
		get version() {
			return version;
		},
	};
}

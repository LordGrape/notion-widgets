import { getCorsHeaders } from "../cors";
import type { Env } from "../types";
import { fromLecturePage, type LectureRow } from "./lecture-readings";
import { CALENDAR_DB_ID, isId, notion, PAGES_DB_ID, READINGS_DB_ID } from "./source-library";

/* The Library shelf in Command Centre: read the Source Library, and hand new scans to the scan station.

   GET  library                            readings (newest first), the term's lectures with readings, course names
   GET  library/pages?id=&offset=&limit=   one reading's pages: text, flags and the photo, a batch at a time
   POST inbox                              { name, files: [{ name, type, size }] } -> { item } (status "uploading")
   PUT  inbox/chunk?id=&file=&chunk=       body: up to 20 MB of one file
   POST inbox/ready?id=                    every chunk is up; the station may take it
   GET  inbox                              { items, station } for Command Centre and the station
   GET  inbox/chunk?id=&file=&chunk=       the station downloads a chunk
   POST inbox/status                       { id, status, note?, readingId?, readingUrl? } from the station
   POST inbox/heartbeat                    { version } from the station, every quarter hour
   POST inbox/remove?id=                   forget an item and its chunks

   Uploads wait in KV for at most a week. The station deletes the chunks once it has the file. */

export const CHUNK_BYTES = 20 * 1024 * 1024; /* KV holds up to 25 MiB per value */
const MAX_FILE_BYTES = 200 * 1024 * 1024;
const MAX_FILES = 80;
const INDEX_KEY = "library:inbox";
const STATION_KEY = "library:station";
const CHUNK_TTL = 7 * 24 * 3600;
const STATUSES = ["uploading", "queued", "reading", "filed", "attention", "failed"] as const;
type Status = (typeof STATUSES)[number];

export interface InboxFile {
	name: string;
	type: string;
	size: number;
	chunks: number;
}
export interface InboxItem {
	id: string;
	name: string;
	files: InboxFile[];
	status: Status;
	note?: string;
	readingId?: string;
	readingUrl?: string;
	createdAt: string;
	updatedAt: string;
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify({ configured: true, ...(body as object) }), { status, headers: { "Content-Type": "application/json", ...getCorsHeaders() } });
}
const plain = (rich: any[] | undefined) => (rich || []).map((t: any) => t.plain_text ?? t.text?.content ?? "").join("");
const cleanName = (s: unknown, n = 120) => String(s ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

/* A Readings row as the shelf shows it. */
export function readingRow(page: any) {
	const p = page.properties || {};
	return {
		id: page.id as string,
		url: page.url as string,
		title: plain(p.Reading?.title),
		book: plain(p.Book?.rich_text),
		authors: plain(p.Authors?.rich_text),
		courseId: (p.Course?.relation || [])[0]?.id || null,
		lectureIds: (p.Lectures?.relation || []).map((r: any) => r.id as string),
		lectureCount: (p.Lectures?.relation || []).length,
		first: p["First page"]?.number ?? null,
		last: p["Last page"]?.number ?? null,
		status: p["Text status"]?.select?.name || "Machine-read",
		captured: p.Captured?.date?.start || page.created_time?.slice(0, 10) || "",
	};
}

/* A page's body: paragraphs, flags from the yellow callout, and the photo (inside a toggle or loose). */
export function pageContent(blocks: any[]) {
	const paragraphs: string[] = [], flags: string[] = [];
	const toggles: string[] = [];
	let photo: string | null = null;
	for (const b of blocks) {
		if (b.type === "paragraph") {
			const text = plain(b.paragraph.rich_text).trim();
			if (text) paragraphs.push(text);
		} else if (b.type === "callout") {
			const text = plain(b.callout.rich_text).trim();
			const m = text.match(/^Check against the photo:\s*(.*?)\.?$/s);
			if (m) flags.push(...m[1].split(/;\s*/).filter(Boolean));
		} else if (b.type === "image") photo = imageUrl(b) || photo;
		else if (b.type === "toggle" && b.has_children) toggles.push(b.id);
	}
	return { paragraphs, flags, photo, toggles };
}
export function imageUrl(b: any): string | null {
	const img = b.image || {};
	return img.file?.url || img.external?.url || null;
}

async function shelf(env: Env) {
	const readings = [];
	let cursor: string | undefined;
	do {
		const data = await notion(env, `/databases/${READINGS_DB_ID}/query`, {
			method: "POST",
			body: JSON.stringify({ sorts: [{ property: "Captured", direction: "descending" }], page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
		});
		readings.push(...(data.results || []).filter((r: any) => !r.archived && !r.in_trash).map(readingRow));
		cursor = data.has_more ? data.next_cursor : undefined;
	} while (cursor && readings.length < 400);
	/* The term's lectures with READINGS in their notes, so the shelf can show each class's syllabus,
	   scanned or not. A window of 150 days either side of today covers a term. */
	const lectures: LectureRow[] = [];
	const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
	cursor = undefined;
	do {
		const data = await notion(env, `/databases/${CALENDAR_DB_ID}/query`, {
			method: "POST",
			body: JSON.stringify({
				filter: { and: [{ property: "assignment", select: { is_empty: true } }, { property: "date", date: { on_or_after: day(-150) } }, { property: "date", date: { on_or_before: day(150) } }, { property: "notes", rich_text: { contains: "pp" } }] },
				sorts: [{ property: "date", direction: "ascending" }],
				page_size: 100,
				...(cursor ? { start_cursor: cursor } : {}),
			}),
		});
		for (const page of data.results || []) {
			const row = fromLecturePage(page);
			if (row) lectures.push(row);
		}
		cursor = data.has_more ? data.next_cursor : undefined;
	} while (cursor && lectures.length < 500);
	const courses: Record<string, string> = {};
	for (const id of [...new Set([...readings.map((r) => r.courseId), ...lectures.map((l) => l.courseId)].filter((x): x is string => !!x))].slice(0, 12)) {
		try {
			const page = await notion(env, `/pages/${id}`);
			const title = Object.values(page.properties || {}).find((v: any) => v?.type === "title") as any;
			courses[id] = plain(title?.title);
		} catch {
			/* a course the integration cannot see: the reading still shows its book */
		}
	}
	return { readings, lectures, courses };
}

async function readingPages(env: Env, id: string, offset: number, limit: number) {
	const rows: any[] = [];
	let cursor: string | undefined;
	do {
		const data = await notion(env, `/databases/${PAGES_DB_ID}/query`, {
			method: "POST",
			body: JSON.stringify({ filter: { property: "Reading", relation: { contains: id } }, sorts: [{ property: "Page number", direction: "ascending" }], page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
		});
		rows.push(...(data.results || []).filter((r: any) => !r.archived && !r.in_trash));
		cursor = data.has_more ? data.next_cursor : undefined;
	} while (cursor && rows.length < 300);
	const pages = [];
	/* Two Notion calls a page at most (the body, then the folded photo): a batch of 12 stays well
	   under the free plan's 50 outbound calls per request. */
	for (const row of rows.slice(offset, offset + limit)) {
		const p = row.properties || {};
		const body = await notion(env, `/blocks/${row.id}/children?page_size=100`);
		const content = pageContent(body.results || []);
		let photo = content.photo;
		for (const toggle of content.toggles) {
			if (photo) break;
			const inner = await notion(env, `/blocks/${toggle}/children?page_size=10`);
			photo = (inner.results || []).map(imageUrl).find(Boolean) || null;
		}
		pages.push({
			id: row.id,
			url: row.url,
			printed: p["Page number"]?.number ?? null,
			confidence: p["OCR confidence"]?.number ?? null,
			status: p["Text status"]?.select?.name || "Machine-read",
			paragraphs: content.paragraphs,
			flags: content.flags,
			photo,
		});
	}
	return { total: rows.length, offset, pages };
}

/* ---------- inbox ---------- */
async function readIndex(env: Env): Promise<InboxItem[]> {
	const list = (await env.WIDGET_KV.get(INDEX_KEY, "json")) as InboxItem[] | null;
	return Array.isArray(list) ? list : [];
}
const writeIndex = (env: Env, list: InboxItem[]) => env.WIDGET_KV.put(INDEX_KEY, JSON.stringify(list.slice(0, 40)));
const chunkKey = (id: string, file: number, chunk: number) => `library:chunk:${id}:${file}:${chunk}`;

export function newItem(body: any, now = new Date()): InboxItem {
	const files = (Array.isArray(body?.files) ? body.files : []).slice(0, MAX_FILES).map((f: any) => {
		const size = Math.floor(Number(f?.size) || 0);
		if (size <= 0 || size > MAX_FILE_BYTES) throw new Error("Each file must be between 1 byte and 200 MB.");
		return { name: cleanName(f?.name, 100) || "scan", type: String(f?.type || "").slice(0, 60), size, chunks: Math.ceil(size / CHUNK_BYTES) };
	});
	if (!files.length) throw new Error("Add a PDF or photos.");
	const name = cleanName(body?.name) || files[0].name.replace(/\.[^.]+$/, "");
	const stamp = now.toISOString();
	return { id: crypto.randomUUID(), name, files, status: "uploading", createdAt: stamp, updatedAt: stamp };
}

async function dropChunks(env: Env, item: InboxItem) {
	await Promise.all(item.files.flatMap((f, i) => Array.from({ length: f.chunks }, (_, c) => env.WIDGET_KV.delete(chunkKey(item.id, i, c)))));
}

function chunkAddress(url: URL, item: InboxItem | undefined) {
	const file = Number(url.searchParams.get("file")), chunk = Number(url.searchParams.get("chunk"));
	if (!item || !Number.isInteger(file) || !Number.isInteger(chunk) || !item.files[file] || chunk < 0 || chunk >= item.files[file].chunks) return null;
	return { file, chunk, key: chunkKey(item.id, file, chunk) };
}

export async function handleShelf(request: Request, env: Env, action: string, url: URL): Promise<Response | null> {
	const method = request.method;
	if (action === "library" && method === "GET") return json(await shelf(env));
	if (action === "library/pages" && method === "GET") {
		const id = url.searchParams.get("id");
		if (!isId(id)) return json({ error: "A reading id is required" }, 400);
		const offset = Math.max(0, Math.floor(Number(url.searchParams.get("offset")) || 0));
		const limit = Math.min(12, Math.max(1, Math.floor(Number(url.searchParams.get("limit")) || 12)));
		return json(await readingPages(env, id, offset, limit));
	}
	if (!action.startsWith("inbox")) return null;
	const id = url.searchParams.get("id") || "";
	if (action === "inbox" && method === "GET") {
		return json({ items: await readIndex(env), station: await env.WIDGET_KV.get(STATION_KEY, "json") });
	}
	if (action === "inbox" && method === "POST") {
		let item: InboxItem;
		try {
			item = newItem(await request.json());
		} catch (error) {
			return json({ error: (error as Error).message }, 400);
		}
		await writeIndex(env, [item, ...(await readIndex(env))]);
		return json({ item, chunkBytes: CHUNK_BYTES });
	}
	if (action === "inbox/heartbeat" && method === "POST") {
		const body = (await request.json().catch(() => ({}))) as any;
		await env.WIDGET_KV.put(STATION_KEY, JSON.stringify({ at: new Date().toISOString(), version: String(body?.version || "").slice(0, 20), reading: cleanName(body?.reading) || null }));
		return json({ ok: true });
	}
	const list = await readIndex(env);
	const item = list.find((i) => i.id === id);
	if (action === "inbox/chunk") {
		const at = chunkAddress(url, item);
		if (!at) return json({ error: "No such chunk" }, 404);
		if (method === "PUT") {
			if (item!.status !== "uploading") return json({ error: "This upload is closed" }, 409);
			const bytes = await request.arrayBuffer();
			if (!bytes.byteLength || bytes.byteLength > CHUNK_BYTES) return json({ error: "A chunk is at most 20 MB" }, 413);
			await env.WIDGET_KV.put(at.key, bytes, { expirationTtl: CHUNK_TTL });
			return json({ ok: true });
		}
		if (method === "GET") {
			const bytes = await env.WIDGET_KV.get(at.key, "arrayBuffer");
			if (!bytes) return json({ error: "That chunk has expired or was already collected" }, 410);
			return new Response(bytes, { headers: { "Content-Type": "application/octet-stream", ...getCorsHeaders() } });
		}
	}
	if (!item) return json({ error: "No such upload" }, 404);
	if (action === "inbox/ready" && method === "POST") {
		item.status = "queued";
		item.updatedAt = new Date().toISOString();
		await writeIndex(env, list);
		return json({ item });
	}
	if (action === "inbox/status" && method === "POST") {
		const body = (await request.json().catch(() => ({}))) as any;
		if (!STATUSES.includes(body?.status)) return json({ error: "Unknown status" }, 400);
		item.status = body.status;
		item.note = String(body.note || "").slice(0, 600) || undefined;
		if (isId(body.readingId)) item.readingId = body.readingId;
		if (typeof body.readingUrl === "string" && body.readingUrl.startsWith("https://")) item.readingUrl = body.readingUrl.slice(0, 300);
		item.updatedAt = new Date().toISOString();
		await writeIndex(env, list);
		if (item.status !== "uploading" && item.status !== "queued") await dropChunks(env, item);
		return json({ item });
	}
	if (action === "inbox/remove" && method === "POST") {
		await dropChunks(env, item);
		await writeIndex(env, list.filter((i) => i.id !== id));
		return json({ ok: true });
	}
	return null;
}

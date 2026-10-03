import { getCorsHeaders } from "../cors";
import type { Env } from "../types";
import { fromLecturePage, type LectureRow } from "./lecture-readings";

/* Source Library: the scan station (a PC service that reads photographed textbook pages) files
   readings into Notion through these routes, so the Notion token never leaves the Worker.

   GET  /notion/source-library/lectures?from=&to=   lecture rows with their READINGS notes (all, done or not)
   POST /notion/source-library/upload?name=x.jpg    body: JPEG bytes -> { id } (a Notion file upload)
   POST /notion/source-library/reading              body: ReadingInput -> { reading, pages } */

const NOTION_VERSION = "2022-06-28";
const CALENDAR_DB_ID = "783a2021-af4c-4369-86eb-7948ef66bf23";
const READINGS_DB_ID = "8ace347b-edb7-4f52-84a6-606aac8eaa8d";
const PAGES_DB_ID = "64fcad6a-367f-4d5b-b89d-a4bb664986d3";
const MAX_PAGES = 120;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const TEXT_LIMIT = 1900; /* Notion allows 2000 characters per rich-text object */

export interface PageInput {
	printed: number;
	confidence: number;
	status: "Machine-read" | "Checked";
	flags: string[];
	paragraphs: string[];
	imageUploadId?: string;
	lectureIds?: string[];
}
export interface ReadingInput {
	title: string;
	book: string;
	authors?: string;
	courseId?: string | null;
	lectureIds?: string[];
	notes?: string;
	captured: string;
	pages: PageInput[];
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...getCorsHeaders() } });
}

async function notion(env: Env, path: string, init: RequestInit = {}): Promise<any> {
	const response = await fetch("https://api.notion.com/v1" + path, {
		...init,
		headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(init.headers || {}) },
	});
	if (!response.ok) throw new Error(`Notion ${response.status}: ${(await response.text()).slice(0, 300)}`);
	return response.json();
}

/* Rich text in Notion-sized pieces. */
export function richText(text: string, annotations?: Record<string, unknown>): any[] {
	const out = [];
	for (let i = 0; i < text.length; i += TEXT_LIMIT) out.push({ type: "text", text: { content: text.slice(i, i + TEXT_LIMIT) }, ...(annotations ? { annotations } : {}) });
	return out.length ? out : [{ type: "text", text: { content: "" } }];
}

const clamp = (s: unknown, n: number) => String(s ?? "").slice(0, n);
const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(s);

/* Page body: a citation callout, flags if any, the text, and the photo folded in a toggle. */
export function pageBlocks(book: string, page: PageInput): any[] {
	const header = `${book}, p. ${page.printed}. `;
	const note = page.status === "Checked" ? "Proofread against the book." : `Machine-read text (OCR confidence ${Math.round(page.confidence)}). For an exact quotation or a paragraph number, check the photo below.`;
	const blocks: any[] = [
		{ type: "callout", callout: { icon: { type: "emoji", emoji: "📖" }, color: "gray_background", rich_text: [...richText(header, { bold: true }), ...richText(note)] } },
	];
	if (page.flags.length) blocks.push({ type: "callout", callout: { icon: { type: "emoji", emoji: "⚠️" }, color: "yellow_background", rich_text: richText(`Check against the photo: ${page.flags.join("; ")}.`) } });
	for (const p of page.paragraphs.slice(0, 80)) if (p.trim()) blocks.push({ type: "paragraph", paragraph: { rich_text: richText(p) } });
	if (page.imageUploadId) blocks.push({ type: "toggle", toggle: { rich_text: richText(`Photo of p. ${page.printed}`), children: [{ type: "image", image: { type: "file_upload", file_upload: { id: page.imageUploadId } } }] } });
	return blocks;
}

export function validateReading(body: any): ReadingInput {
	if (!body || typeof body !== "object") throw new Error("Send a reading.");
	const pages = Array.isArray(body.pages) ? body.pages.slice(0, MAX_PAGES) : [];
	if (!body.title || !body.book || !pages.length) throw new Error("A reading needs a title, a book and at least one page.");
	return {
		title: clamp(body.title, 200),
		book: clamp(body.book, 200),
		authors: clamp(body.authors, 200),
		courseId: isId(body.courseId) ? body.courseId : null,
		lectureIds: (Array.isArray(body.lectureIds) ? body.lectureIds : []).filter(isId).slice(0, 10),
		notes: clamp(body.notes, 1900),
		captured: /^\d{4}-\d{2}-\d{2}$/.test(body.captured) ? body.captured : new Date().toISOString().slice(0, 10),
		pages: pages.map((p: any) => ({
			printed: Math.round(Number(p.printed)) || 0,
			confidence: Math.max(0, Math.min(100, Number(p.confidence) || 0)),
			status: p.status === "Checked" ? "Checked" : "Machine-read",
			flags: (Array.isArray(p.flags) ? p.flags : []).map((f: unknown) => clamp(f, 200)).slice(0, 8),
			paragraphs: (Array.isArray(p.paragraphs) ? p.paragraphs : []).map((t: unknown) => String(t ?? "")).slice(0, 80),
			imageUploadId: isId(p.imageUploadId) ? p.imageUploadId : undefined,
			lectureIds: (Array.isArray(p.lectureIds) ? p.lectureIds : []).filter(isId).slice(0, 10),
		})),
	};
}

const relation = (ids: (string | null | undefined)[]) => ({ relation: ids.filter(isId).map((id) => ({ id })) });

async function createReading(env: Env, r: ReadingInput) {
	const first = Math.min(...r.pages.map((p) => p.printed)), last = Math.max(...r.pages.map((p) => p.printed));
	const reading = await notion(env, "/pages", {
		method: "POST",
		body: JSON.stringify({
			parent: { database_id: READINGS_DB_ID },
			icon: { type: "emoji", emoji: "📖" },
			properties: {
				Reading: { title: richText(r.title) },
				Course: relation([r.courseId]),
				Lectures: relation(r.lectureIds || []),
				Book: { rich_text: richText(r.book) },
				Authors: { rich_text: richText(r.authors || "") },
				"First page": { number: first },
				"Last page": { number: last },
				"Text status": { select: { name: r.pages.every((p) => p.status === "Checked") ? "Checked" : "Machine-read" } },
				Captured: { date: { start: r.captured } },
				Notes: { rich_text: richText(r.notes || "") },
			},
			children: [{ type: "callout", callout: { icon: { type: "emoji", emoji: "📖" }, color: "yellow_background", rich_text: richText("Read by the scan station from photos of the book. Each page row holds the text and a photo of the page; check the photo before relying on an exact quotation or paragraph number.") } }],
		}),
	});
	const pages = [];
	for (const p of r.pages) {
		const row = await notion(env, "/pages", {
			method: "POST",
			body: JSON.stringify({
				parent: { database_id: PAGES_DB_ID },
				properties: {
					Page: { title: richText(`${r.book.split(":")[0]} p. ${p.printed}`) },
					Reading: relation([reading.id]),
					Course: relation([r.courseId]),
					Lectures: relation(p.lectureIds || []),
					"Page number": { number: p.printed },
					Book: { rich_text: richText(r.book) },
					"Text status": { select: { name: p.status } },
					"OCR confidence": { number: Math.round(p.confidence) },
				},
				children: pageBlocks(r.book, p),
			}),
		});
		pages.push({ printed: p.printed, id: row.id, url: row.url });
	}
	return { reading: { id: reading.id, url: reading.url }, pages };
}

async function upload(env: Env, request: Request, name: string) {
	const bytes = await request.arrayBuffer();
	if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Send one JPEG under 8 MB.");
	const created = await notion(env, "/file_uploads", { method: "POST", body: JSON.stringify({ filename: name, content_type: "image/jpeg" }) });
	const form = new FormData();
	form.append("file", new Blob([bytes], { type: "image/jpeg" }), name);
	await notion(env, `/file_uploads/${created.id}/send`, { method: "POST", body: form });
	return { id: created.id };
}

export async function handleSourceLibrary(request: Request, env: Env, action: string): Promise<Response> {
	if (!env.NOTION_TOKEN) return json({ configured: false, error: "Notion integration not configured" }, 501);
	const url = new URL(request.url);
	try {
		if (action === "lectures" && request.method === "GET") {
			const from = url.searchParams.get("from") || "", to = url.searchParams.get("to") || "";
			if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return json({ error: "A valid from and to date are required" }, 400);
			const lectures: LectureRow[] = [];
			let cursor: string | undefined;
			do {
				const data = await notion(env, `/databases/${CALENDAR_DB_ID}/query`, {
					method: "POST",
					body: JSON.stringify({
						filter: { and: [{ property: "assignment", select: { is_empty: true } }, { property: "date", date: { on_or_after: from } }, { property: "date", date: { on_or_before: to } }, { property: "notes", rich_text: { contains: "pp" } }] },
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
			for (const id of [...new Set(lectures.map((l) => l.courseId).filter((x): x is string => !!x))].slice(0, 20)) {
				try {
					const page = await notion(env, `/pages/${id}`);
					courses[id] = (page.properties?.name?.title || []).map((t: any) => t.plain_text).join("");
				} catch {
					/* unreadable course: lectures still match by page range */
				}
			}
			return json({ configured: true, lectures, courses });
		}
		if (action === "upload" && request.method === "POST") {
			const name = (url.searchParams.get("name") || "page.jpg").replace(/[^\w.-]/g, "").slice(0, 80) || "page.jpg";
			return json({ configured: true, ...(await upload(env, request, name)) });
		}
		if (action === "reading" && request.method === "POST") {
			const reading = validateReading(await request.json());
			return json({ configured: true, ...(await createReading(env, reading)) });
		}
		return json({ error: "Unknown source library action" }, 404);
	} catch (error) {
		return json({ configured: true, error: "Source library request failed", detail: (error as Error).message }, 502);
	}
}

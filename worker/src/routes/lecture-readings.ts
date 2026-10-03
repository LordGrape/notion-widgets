import { getCorsHeaders } from "../cors";
import type { Env } from "../types";

/* Read-only view of the lecture rows in the domain calendar (the rows that are not assignments), so
   Command Centre can turn each class's READINGS into tasks. Nothing is written to Notion. */

const DEFAULT_CALENDAR_DB_ID = "ffcd7479-a64b-4766-89ae-f8a1dc900742";
const NOTION_VERSION = "2022-06-28";
const MAX_ROWS = 100;
const MAX_COURSES = 12;

type RichText = { plain_text?: string; text?: { content?: string } };
type Prop = {
  title?: RichText[];
  rich_text?: RichText[];
  name?: string;
  date?: { start?: string | null; end?: string | null } | null;
  status?: { name?: string } | null;
  relation?: Array<{ id: string }>;
};
interface Page {
  id: string;
  url?: string;
  properties?: Record<string, Prop>;
}

export interface LectureRow {
  id: string;
  url: string;
  title: string;
  start: string;
  end: string | null;
  progress: string;
  notes: string;
  courseId: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...getCorsHeaders() } });
}

const plain = (values?: RichText[]) => (values || []).map((v) => v.plain_text ?? v.text?.content ?? "").join("");
const validDay = (value: string | null): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function lectureFilter(from: string, to: string): Record<string, unknown> {
  return {
    and: [
      { property: "assignment", select: { is_empty: true } },
      { property: "progress", status: { does_not_equal: "done" } },
      { property: "date", date: { on_or_after: from } },
      { property: "date", date: { on_or_before: to } },
      { property: "hide from calendar", checkbox: { equals: false } },
    ],
  };
}

export function fromLecturePage(page: Page): LectureRow | null {
  const p = page.properties || {};
  const start = p["date"]?.date?.start;
  const title = plain(p["lecture/assignment"]?.title).trim();
  if (!start || !title) return null;
  return {
    id: page.id,
    url: page.url || `https://www.notion.so/${page.id.replace(/-/g, "")}`,
    title,
    start,
    end: p["date"]?.date?.end ?? null,
    progress: p["progress"]?.status?.name || "",
    notes: plain(p["notes"]?.rich_text),
    courseId: p["course"]?.relation?.[0]?.id ?? null,
  };
}

async function notion(env: Env, path: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch("https://api.notion.com/v1" + path, {
    ...init,
    headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!response.ok) throw new Error(`Notion ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

export async function handleLectureReadings(request: Request, env: Env): Promise<Response> {
  if (!env.NOTION_TOKEN) return json({ configured: false, error: "Notion integration not configured", lectures: [], courses: {} }, 501);
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!validDay(from) || !validDay(to) || from > to) return json({ error: "A valid inclusive date window is required" }, 400);
  const dbId = (env as Env & { UPCOMING_DB_ID?: string }).UPCOMING_DB_ID || DEFAULT_CALENDAR_DB_ID;
  try {
    const data = await notion(env, `/databases/${dbId}/query`, {
      method: "POST",
      body: JSON.stringify({ filter: lectureFilter(from, to), sorts: [{ property: "date", direction: "ascending" }], page_size: MAX_ROWS }),
    });
    const lectures = ((data.results || []) as Page[]).map(fromLecturePage).filter((row): row is LectureRow => !!row);
    const courseIds = [...new Set(lectures.map((l) => l.courseId).filter((id): id is string => !!id))].slice(0, MAX_COURSES);
    const courses: Record<string, string> = {};
    await Promise.all(
      courseIds.map(async (id) => {
        try {
          const page = (await notion(env, `/pages/${id}`)) as Page;
          const name = plain(page.properties?.["name"]?.title).trim();
          if (name) courses[id] = name;
        } catch {
          /* a course we cannot read just shows without a name */
        }
      }),
    );
    return json({ configured: true, from, to, lectures, courses });
  } catch (error) {
    return json({ configured: true, error: "Notion lecture sync failed", detail: (error as Error).message, lectures: [], courses: {} }, 502);
  }
}

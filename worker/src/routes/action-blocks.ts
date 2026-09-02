import { getCorsHeaders } from "../cors";
import type { Env } from "../types";

const DEFAULT_ACTION_BLOCKS_DB_ID = "67fdab55-eb09-4a59-a54d-0503ba4efeda";
const NOTION_VERSION = "2022-06-28";

type ActionStatus = "Scheduled" | "In progress" | "Done" | "Skipped";

export interface ActionBlockInput {
  notionPageId?: string;
  occurrenceId: string;
  scheduleId?: string;
  action: string;
  category: "Study" | "Training" | "Personal";
  status: ActionStatus;
  scheduledStart: string;
  scheduledEnd?: string | null;
  plannedMinutes?: number | null;
  actualMinutes?: number | null;
  priority?: "Must" | "Should" | "Could" | null;
  source?: "Schedule" | "Manual" | "Study Engine";
  notes?: string;
}

interface NotionPage {
  id: string;
  last_edited_time?: string;
  properties: Record<string, any>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...getCorsHeaders() } });
}

function richText(value: string) {
  return value ? [{ type: "text", text: { content: value.slice(0, 1900) } }] : [];
}

export function toNotionProperties(item: ActionBlockInput): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    Action: { title: richText(item.action) },
    Status: { status: { name: item.status } },
    Category: { select: { name: item.category } },
    Scheduled: { date: { start: item.scheduledStart, end: item.scheduledEnd || null } },
    "Planned minutes": { number: item.plannedMinutes ?? null },
    "Actual minutes": { number: item.actualMinutes ?? null },
    Source: { select: { name: item.source || "Schedule" } },
    "Occurrence ID": { rich_text: richText(item.occurrenceId) },
    "Schedule ID": { rich_text: richText(item.scheduleId || "") },
    Notes: { rich_text: richText(item.notes || "") }
  };
  if (item.priority) properties.Priority = { select: { name: item.priority } };
  return properties;
}

function text(prop: any): string {
  const values = prop?.title || prop?.rich_text || [];
  return values.map((v: any) => v?.plain_text || v?.text?.content || "").join("");
}

export function fromNotionPage(page: NotionPage) {
  const p = page.properties || {};
  return {
    notionPageId: page.id,
    occurrenceId: text(p["Occurrence ID"]) || `notion:${page.id}`,
    scheduleId: text(p["Schedule ID"]) || null,
    action: text(p.Action),
    category: p.Category?.select?.name || "Personal",
    status: p.Status?.status?.name || "Scheduled",
    scheduledStart: p.Scheduled?.date?.start || null,
    scheduledEnd: p.Scheduled?.date?.end || null,
    plannedMinutes: p["Planned minutes"]?.number ?? null,
    actualMinutes: p["Actual minutes"]?.number ?? null,
    priority: p.Priority?.select?.name || null,
    source: p.Source?.select?.name || "Manual",
    notes: text(p.Notes),
    lastEdited: page.last_edited_time || null
  };
}

async function notionFetch(env: Env, path: string, init: RequestInit = {}) {
  const response = await fetch("https:" + "//api.notion.com/v1" + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  if (!response.ok) throw new Error(`Notion ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return response.json() as Promise<any>;
}

async function findByOccurrence(env: Env, dbId: string, occurrenceId: string): Promise<NotionPage | null> {
  const data = await notionFetch(env, `/databases/${dbId}/query`, {
    method: "POST",
    body: JSON.stringify({ filter: { property: "Occurrence ID", rich_text: { equals: occurrenceId } }, page_size: 1 })
  });
  return data.results?.[0] || null;
}

async function upsert(env: Env, dbId: string, item: ActionBlockInput): Promise<NotionPage> {
  let page: NotionPage | null = null;
  if (item.notionPageId) page = { id: item.notionPageId, properties: {} };
  else page = await findByOccurrence(env, dbId, item.occurrenceId);
  const properties = toNotionProperties(item);
  if (page) return notionFetch(env, `/pages/${page.id}`, { method: "PATCH", body: JSON.stringify({ properties }) });
  return notionFetch(env, "/pages", { method: "POST", body: JSON.stringify({ parent: { database_id: dbId }, properties }) });
}

async function queryRange(env: Env, dbId: string, from?: string | null, to?: string | null) {
  const filters: any[] = [];
  if (from) filters.push({ property: "Scheduled", date: { on_or_after: from } });
  if (to) filters.push({ property: "Scheduled", date: { on_or_before: to } });
  const data = await notionFetch(env, `/databases/${dbId}/query`, {
    method: "POST",
    body: JSON.stringify({
      ...(filters.length ? { filter: filters.length === 1 ? filters[0] : { and: filters } } : {}),
      sorts: [{ property: "Scheduled", direction: "ascending" }],
      page_size: 100
    })
  });
  return (data.results || []).map(fromNotionPage);
}

export async function handleActionBlocks(request: Request, env: Env): Promise<Response> {
  if (!env.NOTION_TOKEN) return json({ configured: false, error: "Notion integration not configured" }, 501);
  const dbId = (env as Env & { ACTION_BLOCKS_DB_ID?: string }).ACTION_BLOCKS_DB_ID || DEFAULT_ACTION_BLOCKS_DB_ID;
  try {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const items = await queryRange(env, dbId, url.searchParams.get("from"), url.searchParams.get("to"));
      return json({ configured: true, items });
    }
    if (request.method === "POST") {
      const body = await request.json() as { items?: ActionBlockInput[] };
      const incoming = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
      const synced = [];
      for (const item of incoming) {
        if (!item?.occurrenceId || !item?.action || !item?.scheduledStart) continue;
        const page = await upsert(env, dbId, item);
        synced.push(fromNotionPage(page));
      }
      return json({ configured: true, items: synced });
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    return json({ configured: true, error: "Notion action sync failed", detail: (error as Error).message }, 502);
  }
}

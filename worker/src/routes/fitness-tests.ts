import { getCorsHeaders } from "../cors";
import type { Env } from "../types";

const DEFAULT_FITNESS_TEST_DB_ID = "a33b52c8-a9b0-4cc8-816e-a9b250144039";
const NOTION_VERSION = "2022-06-28";
const MAX_ITEMS = 50;

type RichTextItem = {
  plain_text?: string;
  text?: { content?: string };
};

type NotionProperty = {
  title?: RichTextItem[];
  rich_text?: RichTextItem[];
  number?: number | null;
  date?: { start?: string | null; end?: string | null } | null;
  select?: { name?: string } | null;
};

interface NotionPage {
  id: string;
  url?: string;
  archived?: boolean;
  last_edited_time?: string;
  properties?: Record<string, NotionProperty>;
}

interface NotionQueryResponse {
  results?: NotionPage[];
  has_more?: boolean;
  next_cursor?: string | null;
}

type TestMeta = {
  name: string;
  category: "SOA" | "Supplementary";
  component: string;
  unit: "s" | "reps" | "cm" | "ratio";
  loads?: number[];
};

const TEST_META: Record<string, TestMeta> = {
  run2400: {
    name: "2400 m run",
    category: "SOA",
    component: "Aerobic Power",
    unit: "s",
  },
  run8000: {
    name: "8 km run",
    category: "SOA",
    component: "Aerobic Capacity",
    unit: "s",
  },
  run400: {
    name: "400 m run",
    category: "SOA",
    component: "Anaerobic Capacity",
    unit: "s",
  },
  sprint40: {
    name: "40 m sprint",
    category: "SOA",
    component: "Power/Speed",
    unit: "s",
  },
  vjump: {
    name: "Vertical jump",
    category: "SOA",
    component: "Power/Speed",
    unit: "cm",
  },
  pullups: {
    name: "Pull-ups",
    category: "SOA",
    component: "Upper Strength",
    unit: "reps",
  },
  pushups: {
    name: "Push-ups",
    category: "SOA",
    component: "Upper Strength",
    unit: "reps",
  },
  situps: {
    name: "Sit-ups",
    category: "SOA",
    component: "Core",
    unit: "reps",
  },
  grip: {
    name: "Hand grip",
    category: "SOA",
    component: "Upper Strength",
    unit: "ratio",
  },
  bench: {
    name: "Bench press",
    category: "SOA",
    component: "Upper Strength",
    unit: "reps",
    loads: [55, 65, 75],
  },
  squat: {
    name: "Back squat",
    category: "SOA",
    component: "Lower Strength",
    unit: "reps",
    loads: [72, 80, 90],
  },
  ruck: {
    name: "Loaded march",
    category: "Supplementary",
    component: "Aerobic Capacity",
    unit: "s",
  },
};

export interface FitnessAssessment {
  id: string;
  t: string;
  d: string;
  v: number;
  load: number | null;
  dist: number | null;
  raw: string;
  ts: number;
  score: number;
  level: "Below L1" | "L1" | "L2" | "L3";
  sourceWorkoutId?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...getCorsHeaders() },
  });
}

function propertyText(property?: NotionProperty): string {
  const values = property?.title || property?.rich_text || [];
  return values
    .map((value) => value.plain_text || value.text?.content || "")
    .join("");
}

function validDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function cleanNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function resolvedTestName(testId: string, load: number | null): string {
  if (testId === "bench") return `Bench press @${load || 65}kg`;
  if (testId === "squat") return `Back squat @${load || 80}kg`;
  return TEST_META[testId]?.name || "";
}

function testFromNotionName(name: string): { t: string; load: number | null } | null {
  const lower = name.trim().toLowerCase();
  const direct: Record<string, string> = {
    "2400 m run": "run2400",
    "8 km run": "run8000",
    "400 m run": "run400",
    "40 m sprint": "sprint40",
    "vertical jump": "vjump",
    "pull-ups": "pullups",
    "push-ups": "pushups",
    "sit-ups": "situps",
    "hand grip": "grip",
    "loaded march": "ruck",
  };
  if (direct[lower]) return { t: direct[lower], load: null };
  const bench = lower.match(/^bench press\s*@\s*(55|65|75)\s*kg$/);
  if (bench) return { t: "bench", load: Number(bench[1]) };
  const squat = lower.match(/^back squat\s*@\s*(72|80|90)\s*kg$/);
  if (squat) return { t: "squat", load: Number(squat[1]) };
  return null;
}

function parseRuckDetails(raw: string): { load: number | null; dist: number | null } {
  const values = Array.from(raw.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*(kg|km)\b/gi));
  let load: number | null = null;
  let dist: number | null = null;
  for (const match of values) {
    if (match[2].toLowerCase() === "kg") load = Number(match[1]);
    if (match[2].toLowerCase() === "km") dist = Number(match[1]);
  }
  return { load, dist };
}

export function normaliseAssessment(value: unknown): FitnessAssessment | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const id = String(input.id || "").trim();
  const t = String(input.t || "").trim();
  const d = String(input.d || "").trim();
  const raw = String(input.raw || "").trim().slice(0, 300);
  const meta = TEST_META[t];
  const v = cleanNumber(input.v);
  const load = input.load === null || input.load === undefined ? null : cleanNumber(input.load);
  const dist = input.dist === null || input.dist === undefined ? null : cleanNumber(input.dist);
  const scoreValue = cleanNumber(input.score);
  const tsValue = cleanNumber(input.ts);
  const level = String(input.level || "");
  const validLevels = ["Below L1", "L1", "L2", "L3"];

  if (!id || id.length > 180 || !/^[A-Za-z0-9:_-]+$/.test(id)) return null;
  if (!meta || !validDateKey(d) || v === null || v < 0 || v > 1_000_000) return null;
  if (!raw || scoreValue === null || scoreValue < 10 || scoreValue > 99) return null;
  if (validLevels.indexOf(level) < 0) return null;
  if (meta.loads && (load === null || meta.loads.indexOf(load) < 0)) return null;
  if (t === "ruck" && (load === null || load <= 0 || dist === null || dist <= 0)) return null;

  const sourceWorkoutId = String(input.sourceWorkoutId || "").trim().slice(0, 180);
  return {
    id,
    t,
    d,
    v,
    load,
    dist,
    raw,
    ts: tsValue && tsValue > 0 ? Math.round(tsValue) : Date.now(),
    score: Math.round(scoreValue),
    level: level as FitnessAssessment["level"],
    ...(sourceWorkoutId ? { sourceWorkoutId } : {}),
  };
}

export function assessmentFingerprint(item: Pick<FitnessAssessment, "t" | "d" | "v" | "load" | "dist">): string {
  const numberKey = (value: number | null): string =>
    value === null ? "" : Number(value).toFixed(4);
  return [item.t, item.d, numberKey(item.v), numberKey(item.load), numberKey(item.dist)].join("|");
}

function richText(content: string): { type: "text"; text: { content: string } }[] {
  return [{ type: "text", text: { content: content.slice(0, 1900) } }];
}

export function toNotionProperties(item: FitnessAssessment): Record<string, unknown> {
  const meta = TEST_META[item.t];
  const testName = resolvedTestName(item.t, item.load);
  return {
    Entry: { title: richText(`${testName} · ${item.d}`) },
    Test: { select: { name: testName } },
    Category: { select: { name: meta.category } },
    Component: { select: { name: meta.component } },
    Date: { date: { start: item.d, end: null } },
    Result: { rich_text: richText(item.raw) },
    Value: { number: item.v },
    Unit: { select: { name: meta.unit } },
    "Level / Tier": { select: { name: item.level } },
    "Athlete score": { number: item.score },
    "Widget Entry ID": { rich_text: richText(item.id) },
  };
}

export function fromNotionPage(page: NotionPage): FitnessAssessment | null {
  const properties = page.properties || {};
  const testName = properties.Test?.select?.name || "";
  const test = testFromNotionName(testName);
  const d = properties.Date?.date?.start || "";
  const v = properties.Value?.number;
  const raw = propertyText(properties.Result);
  if (!test || !validDateKey(d) || typeof v !== "number" || !Number.isFinite(v) || !raw) return null;

  const ruck = test.t === "ruck" ? parseRuckDetails(raw) : { load: null, dist: null };
  const id = propertyText(properties["Widget Entry ID"]) || `notion:${page.id}`;
  const score = properties["Athlete score"]?.number;
  const levelName = properties["Level / Tier"]?.select?.name || "Below L1";
  const level = ["L1", "L2", "L3"].includes(levelName) ? levelName : "Below L1";
  const editedAt = Date.parse(page.last_edited_time || "");

  return {
    id,
    t: test.t,
    d,
    v,
    load: test.load ?? ruck.load,
    dist: ruck.dist,
    raw,
    ts: Number.isFinite(editedAt) ? editedAt : Date.now(),
    score: typeof score === "number" && Number.isFinite(score) ? Math.round(score) : 10,
    level: level as FitnessAssessment["level"],
  };
}

async function notionFetch<T>(
  env: Env,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch("https:" + "//api.notion.com/v1" + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Notion ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return response.json() as Promise<T>;
}

async function queryAllPages(env: Env, databaseId: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | null = null;
  for (let batch = 0; batch < 4; batch += 1) {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const data = await notionFetch<NotionQueryResponse>(
      env,
      `/databases/${databaseId}/query`,
      { method: "POST", body: JSON.stringify(body) },
    );
    pages.push(...(data.results || []));
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return pages;
}

async function patchPage(env: Env, pageId: string, item: FitnessAssessment): Promise<NotionPage> {
  return notionFetch<NotionPage>(env, `/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: toNotionProperties(item) }),
  });
}

async function createPage(env: Env, databaseId: string, item: FitnessAssessment): Promise<NotionPage> {
  return notionFetch<NotionPage>(env, "/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: toNotionProperties(item),
    }),
  });
}

function pageWidgetId(page: NotionPage): string {
  return propertyText(page.properties?.["Widget Entry ID"]);
}

async function upsertAssessments(
  env: Env,
  databaseId: string,
  items: FitnessAssessment[],
): Promise<FitnessAssessment[]> {
  const pages = await queryAllPages(env, databaseId);
  const byId = new Map<string, NotionPage>();
  const byFingerprint = new Map<string, NotionPage>();
  for (const page of pages) {
    const widgetId = pageWidgetId(page);
    const assessment = fromNotionPage(page);
    if (widgetId) byId.set(widgetId, page);
    if (assessment) byFingerprint.set(assessmentFingerprint(assessment), page);
  }

  const saved: FitnessAssessment[] = [];
  for (const item of items) {
    const existing = byId.get(item.id) || byFingerprint.get(assessmentFingerprint(item));
    const page = existing
      ? await patchPage(env, existing.id, item)
      : await createPage(env, databaseId, item);
    const mapped = fromNotionPage(page) || item;
    saved.push({ ...mapped, id: item.id });
    byId.set(item.id, page);
    byFingerprint.set(assessmentFingerprint(item), page);
  }
  return saved;
}

async function archiveAssessments(
  env: Env,
  databaseId: string,
  ids: string[],
): Promise<string[]> {
  const pages = await queryAllPages(env, databaseId);
  const byId = new Map<string, NotionPage>();
  for (const page of pages) {
    const widgetId = pageWidgetId(page);
    if (widgetId) byId.set(widgetId, page);
    byId.set(`notion:${page.id}`, page);
  }

  const removed: string[] = [];
  for (const id of ids) {
    const page = byId.get(id);
    if (!page) {
      removed.push(id);
      continue;
    }
    await notionFetch<NotionPage>(env, `/pages/${page.id}`, {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
    });
    removed.push(id);
  }
  return removed;
}

export async function handleFitnessTests(request: Request, env: Env): Promise<Response> {
  if (!env.NOTION_TOKEN) {
    return json(
      { configured: false, error: "Notion integration not configured", items: [] },
      501,
    );
  }

  const configuredEnv = env as Env & { FITNESS_TEST_DB_ID?: string };
  const databaseId = configuredEnv.FITNESS_TEST_DB_ID || DEFAULT_FITNESS_TEST_DB_ID;

  try {
    if (request.method === "GET") {
      const pages = await queryAllPages(env, databaseId);
      const items = pages
        .map(fromNotionPage)
        .filter((item): item is FitnessAssessment => !!item);
      return json({ configured: true, items });
    }

    if (request.method === "POST") {
      const body = (await request.json()) as { items?: unknown[] };
      const input = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
      const items = input.map(normaliseAssessment);
      if (!input.length || items.some((item) => !item)) {
        return json({ error: "One or more fitness assessments are invalid" }, 400);
      }
      const saved = await upsertAssessments(
        env,
        databaseId,
        items.filter((item): item is FitnessAssessment => !!item),
      );
      return json({ configured: true, items: saved });
    }

    if (request.method === "DELETE") {
      const body = (await request.json()) as { ids?: unknown[] };
      const ids = Array.isArray(body.ids)
        ? body.ids
            .slice(0, MAX_ITEMS)
            .map((id) => String(id || "").trim())
            .filter((id) => !!id && id.length <= 180 && /^[A-Za-z0-9:_-]+$/.test(id))
        : [];
      if (!ids.length) return json({ error: "At least one valid assessment ID is required" }, 400);
      const removed = await archiveAssessments(env, databaseId, ids);
      return json({ configured: true, removed });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    return json(
      {
        configured: true,
        error: "Notion fitness sync failed",
        detail: (error as Error).message,
        items: [],
      },
      502,
    );
  }
}

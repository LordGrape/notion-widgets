import { getCorsHeaders } from "../cors";
import type { Env } from "../types";

const DEFAULT_UPCOMING_DB_ID = "ffcd7479-a64b-4766-89ae-f8a1dc900742";
const DEFAULT_ACTION_BLOCKS_DB_ID = "67fdab55-eb09-4a59-a54d-0503ba4efeda";
const NOTION_VERSION = "2022-06-28";
const ASSIGNMENT_OPTION = "assignment 📑";
const MAX_ASSIGNMENTS = 5;

type RichTextItem = {
  plain_text?: string;
  text?: { content?: string };
};

type NotionProperty = {
  title?: RichTextItem[];
  rich_text?: RichTextItem[];
  date?: { start?: string | null; end?: string | null } | null;
  status?: { name?: string } | null;
  select?: { name?: string } | null;
  checkbox?: boolean;
  relation?: Array<{ id: string }>;
};

interface NotionPage {
  id: string;
  url?: string;
  created_time?: string;
  last_edited_time?: string;
  properties?: Record<string, NotionProperty>;
}

interface NotionQueryResponse {
  results?: NotionPage[];
}

export interface AssignmentPhase {
  notionPageId: string;
  occurrenceId: string;
  action: string;
  status: string;
  scheduledStart: string | null;
  contextPageId: string | null;
  lastEdited: string | null;
}

export interface UpcomingAssignment {
  id: string;
  title: string;
  due: string;
  url: string;
  phases: AssignmentPhase[];
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

export function validDateKey(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function assignmentFilter(
  from: string,
  to: string,
): Record<string, unknown> {
  return {
    and: [
      { property: "assignment", select: { equals: ASSIGNMENT_OPTION } },
      { property: "progress", status: { does_not_equal: "done" } },
      { property: "date", date: { on_or_after: from } },
      { property: "date", date: { on_or_before: to } },
      { property: "hide from calendar", checkbox: { equals: false } },
    ],
  };
}

export function fromAssignmentPage(
  page: NotionPage,
): UpcomingAssignment | null {
  const properties = page.properties || {};
  const due = properties.date?.date?.start || "";
  const title = propertyText(properties["lecture/assignment"]);
  if (!title || !due) return null;
  return {
    id: page.id,
    title,
    due,
    url: page.url || "https:" + "//www.notion.so/" + page.id.replace(/-/g, ""),
    phases: [],
  };
}

export function fromPhasePage(page: NotionPage): AssignmentPhase | null {
  const properties = page.properties || {};
  const occurrenceId = propertyText(properties["Occurrence ID"]);
  const action = propertyText(properties.Action);
  if (!occurrenceId || !action) return null;
  return {
    notionPageId: page.id,
    occurrenceId,
    action,
    status: properties.Status?.status?.name || "Scheduled",
    scheduledStart: properties.Scheduled?.date?.start || null,
    contextPageId: properties.Context?.relation?.[0]?.id || null,
    lastEdited: page.last_edited_time || null,
  };
}

export function sortPhases(phases: AssignmentPhase[]): AssignmentPhase[] {
  return phases.slice().sort((a, b) => {
    const aDate = a.scheduledStart || "9999-12-31";
    const bDate = b.scheduledStart || "9999-12-31";
    return aDate.localeCompare(bDate) || a.action.localeCompare(b.action);
  });
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
    throw new Error(
      `Notion ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
  }
  return response.json() as Promise<T>;
}

async function queryAssignments(
  env: Env,
  databaseId: string,
  from: string,
  to: string,
): Promise<UpcomingAssignment[]> {
  const data = await notionFetch<NotionQueryResponse>(
    env,
    `/databases/${databaseId}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        filter: assignmentFilter(from, to),
        sorts: [{ property: "date", direction: "ascending" }],
        page_size: MAX_ASSIGNMENTS,
      }),
    },
  );
  return (data.results || [])
    .map(fromAssignmentPage)
    .filter((item): item is UpcomingAssignment => !!item)
    .slice(0, MAX_ASSIGNMENTS);
}

async function queryPhases(
  env: Env,
  databaseId: string,
  assignmentId: string,
): Promise<AssignmentPhase[]> {
  const data = await notionFetch<NotionQueryResponse>(
    env,
    `/databases/${databaseId}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        filter: {
          and: [
            { property: "Context", relation: { contains: assignmentId } },
            {
              property: "Occurrence ID",
              rich_text: { starts_with: `assignment:${assignmentId}:` },
            },
            { property: "Status", status: { does_not_equal: "Skipped" } },
          ],
        },
        page_size: 50,
      }),
    },
  );
  return sortPhases(
    (data.results || [])
      .map(fromPhasePage)
      .filter((item): item is AssignmentPhase => !!item),
  );
}

export async function handleUpcomingAssignments(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!env.NOTION_TOKEN) {
    return json(
      {
        configured: false,
        error: "Notion integration not configured",
        assignments: [],
      },
      501,
    );
  }
  if (request.method !== "GET")
    return json({ error: "Method not allowed" }, 405);

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!validDateKey(from) || !validDateKey(to) || from > to) {
    return json({ error: "A valid inclusive date window is required" }, 400);
  }

  const configuredEnv = env as Env & {
    UPCOMING_DB_ID?: string;
    ACTION_BLOCKS_DB_ID?: string;
  };
  const assignmentDbId = configuredEnv.UPCOMING_DB_ID || DEFAULT_UPCOMING_DB_ID;
  const actionBlocksDbId =
    configuredEnv.ACTION_BLOCKS_DB_ID || DEFAULT_ACTION_BLOCKS_DB_ID;

  try {
    const assignments = await queryAssignments(env, assignmentDbId, from, to);
    await Promise.all(
      assignments.map(async (assignment) => {
        assignment.phases = await queryPhases(
          env,
          actionBlocksDbId,
          assignment.id,
        );
      }),
    );
    return json({ configured: true, from, to, assignments });
  } catch (error) {
    return json(
      {
        configured: true,
        error: "Notion upcoming assignment sync failed",
        detail: (error as Error).message,
        assignments: [],
      },
      502,
    );
  }
}

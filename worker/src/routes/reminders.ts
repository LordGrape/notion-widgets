import type { Env } from "../types";

const DEFAULT_ACTION_BLOCKS_DB_ID = "67fdab55-eb09-4a59-a54d-0503ba4efeda";
const NOTION_VERSION = "2022-06-28";
const RETRY_AFTER_MS = 4 * 60 * 1000;
const SENT_TTL_SECONDS = 60 * 60 * 24 * 30;

type ReminderEnv = Env & {
  ACTION_BLOCKS_DB_ID?: string;
  NOTION_REMINDER_USER_ID?: string;
  NOTION_REMINDER_USER_EMAIL?: string;
};

type StateEntry = { value?: unknown; _ts?: number };
type TodoState = Record<string, StateEntry | unknown>;

export interface ReminderTask {
  id?: string;
  occurrenceId?: string;
  notionPageId?: string;
  text?: string;
  category?: string;
  pri?: string | null;
  source?: string;
  done?: boolean;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  reminderAt?: string | null;
  reminderTimezone?: string;
  reminderVersion?: number;
  reminderState?: string;
  reminderSentAt?: number;
  reminderSentFor?: string;
  reminderLastAttemptAt?: number;
  reminderLastError?: string;
  updatedAt?: number;
  startNudgedAt?: number;
}

interface NotionUser {
  id: string;
  type?: string;
  person?: { email?: string };
}

function richText(value: string) {
  return value ? [{ type: "text", text: { content: value.slice(0, 1900) } }] : [];
}

async function notionFetch(env: ReminderEnv, path: string, init: RequestInit = {}) {
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
    throw new Error(`Notion ${response.status}: ${(await response.text()).slice(0, 400)}`);
  }
  return response.json() as Promise<any>;
}

function unwrapTasks(state: TodoState | null): ReminderTask[] {
  if (!state || typeof state !== "object") return [];
  const entry = state.tasks;
  const value = entry && typeof entry === "object" && "value" in entry
    ? (entry as StateEntry).value
    : entry;
  if (Array.isArray(value)) return value as ReminderTask[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function writeTasks(state: TodoState, tasks: ReminderTask[], timestamp: number) {
  state.tasks = { value: JSON.stringify(tasks), _ts: timestamp };
}

export function reminderFingerprint(task: ReminderTask): string {
  const raw = `${task.id || task.occurrenceId || "task"}|${task.reminderAt || ""}|${task.reminderVersion || 0}`;
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function sentKey(task: ReminderTask) {
  return `todo-reminder-sent:${reminderFingerprint(task)}`;
}

function occurrenceId(task: ReminderTask) {
  return task.occurrenceId || `todo:${task.id || reminderFingerprint(task)}`;
}

function categoryName(value?: string) {
  if (value === "study") return "Study";
  if (value === "training") return "Training";
  return "Personal";
}

function priorityName(value?: string | null) {
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

async function findActionPage(env: ReminderEnv, id: string): Promise<string | null> {
  const dbId = env.ACTION_BLOCKS_DB_ID || DEFAULT_ACTION_BLOCKS_DB_ID;
  const data = await notionFetch(env, `/databases/${dbId}/query`, {
    method: "POST",
    body: JSON.stringify({
      filter: { property: "Occurrence ID", rich_text: { equals: id } },
      page_size: 1,
    }),
  });
  return data.results?.[0]?.id || null;
}

async function ensureActionPage(env: ReminderEnv, task: ReminderTask): Promise<string> {
  if (task.notionPageId) return task.notionPageId;
  const id = occurrenceId(task);
  const existing = await findActionPage(env, id);
  if (existing) return existing;
  const start = task.scheduledStart || task.reminderAt;
  const properties: Record<string, unknown> = {
    Action: { title: richText(task.text || "To-do reminder") },
    Status: { status: { name: "Scheduled" } },
    Category: { select: { name: categoryName(task.category) } },
    Scheduled: start ? { date: { start, end: task.scheduledEnd || null } } : { date: null },
    "Planned minutes": { number: null },
    "Actual minutes": { number: null },
    Source: { select: { name: task.source === "timetable" ? "Schedule" : "Manual" } },
    "Occurrence ID": { rich_text: richText(id) },
    "Schedule ID": { rich_text: [] },
    Notes: { rich_text: richText("Exact reminder from the to-do widget") },
  };
  const priority = priorityName(task.pri);
  if (priority) properties.Priority = { select: { name: priority } };
  const dbId = env.ACTION_BLOCKS_DB_ID || DEFAULT_ACTION_BLOCKS_DB_ID;
  const page = await notionFetch(env, "/pages", {
    method: "POST",
    body: JSON.stringify({ parent: { database_id: dbId }, properties }),
  });
  return page.id as string;
}

async function resolveReminderUser(env: ReminderEnv): Promise<string> {
  if (env.NOTION_REMINDER_USER_ID) return env.NOTION_REMINDER_USER_ID;
  const people: NotionUser[] = [];
  let cursor: string | undefined;
  do {
    const suffix = cursor ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}` : "?page_size=100";
    const data = await notionFetch(env, `/users${suffix}`);
    people.push(...(data.results || []).filter((user: NotionUser) => user.type === "person"));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor && people.length < 300);
  if (env.NOTION_REMINDER_USER_EMAIL) {
    const target = env.NOTION_REMINDER_USER_EMAIL.toLowerCase();
    const matched = people.find((user) => user.person?.email?.toLowerCase() === target);
    if (matched) return matched.id;
    throw new Error("Configured Notion reminder user was not found");
  }
  if (people.length === 1) return people[0].id;
  throw new Error("Set NOTION_REMINDER_USER_ID when the integration can see multiple people");
}

async function sendMention(env: ReminderEnv, pageId: string, userId: string, task: ReminderTask) {
  await notionFetch(env, "/comments", {
    method: "POST",
    body: JSON.stringify({
      parent: { page_id: pageId },
      rich_text: [
        { type: "mention", mention: { type: "user", user: { id: userId } } },
        { type: "text", text: { content: ` Reminder: ${(task.text || "To-do item").slice(0, 1700)}` } },
      ],
    }),
  });
}

export function dueReminderTasks(tasks: ReminderTask[], nowMs: number): ReminderTask[] {
  return tasks.filter((task) => {
    if (!task || task.done || !task.reminderAt) return false;
    if (task.reminderSentFor === task.reminderAt) return false;
    const due = Date.parse(task.reminderAt);
    if (!Number.isFinite(due) || due > nowMs) return false;
    const attempted = Number(task.reminderLastAttemptAt) || 0;
    return !attempted || nowMs - attempted >= RETRY_AFTER_MS;
  });
}

export async function processDueReminders(env: Env, nowMs = Date.now()) {
  const reminderEnv = env as ReminderEnv;
  if (!reminderEnv.NOTION_TOKEN) {
    return { configured: false, sent: 0, failed: 0, due: 0 };
  }
  const state = await env.WIDGET_KV.get("todo", "json") as TodoState | null;
  if (!state || typeof state !== "object") {
    return { configured: true, sent: 0, failed: 0, due: 0 };
  }
  const tasks = unwrapTasks(state);
  const due = dueReminderTasks(tasks, nowMs);
  if (!due.length) return { configured: true, sent: 0, failed: 0, due: 0 };

  let sent = 0;
  let failed = 0;
  let changed = false;
  let userId: string | null = null;

  for (const task of due.slice(0, 25)) {
    const markerKey = sentKey(task);
    const alreadySent = await env.WIDGET_KV.get(markerKey);
    if (alreadySent) {
      task.reminderSentFor = task.reminderAt || undefined;
      task.reminderSentAt = Number(alreadySent) || nowMs;
      task.reminderState = "sent";
      delete task.reminderLastError;
      changed = true;
      continue;
    }

    task.reminderLastAttemptAt = nowMs;
    task.reminderState = "sending";
    changed = true;
    try {
      if (!userId) userId = await resolveReminderUser(reminderEnv);
      const pageId = await ensureActionPage(reminderEnv, task);
      await sendMention(reminderEnv, pageId, userId, task);
      task.notionPageId = pageId;
      task.reminderSentFor = task.reminderAt || undefined;
      task.reminderSentAt = nowMs;
      task.reminderState = "sent";
      task.startNudgedAt = task.startNudgedAt || nowMs;
      delete task.reminderLastError;
      await env.WIDGET_KV.put(markerKey, String(nowMs), { expirationTtl: SENT_TTL_SECONDS });
      sent += 1;
    } catch (error) {
      task.reminderState = "error";
      task.reminderLastError = (error as Error).message.slice(0, 300);
      failed += 1;
    }
  }

  if (changed) {
    writeTasks(state, tasks, nowMs);
    await env.WIDGET_KV.put("todo", JSON.stringify(state));
  }
  return { configured: true, sent, failed, due: due.length };
}

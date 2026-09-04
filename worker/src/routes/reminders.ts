import type { Env } from "../types";

const DEFAULT_ACTION_BLOCKS_DB_ID = "67fdab55-eb09-4a59-a54d-0503ba4efeda";
const NOTION_VERSION = "2022-06-28";
const RETRY_AFTER_MS = 4 * 60 * 1000;
const SENT_TTL_SECONDS = 60 * 60 * 24 * 30;
const HEALTH_KEY = "todo-reminder-health";
const HEALTH_WRITE_INTERVAL_MS = 5 * 60 * 1000;

type ReminderEnv = Env & {
  ACTION_BLOCKS_DB_ID?: string;
  NOTION_REMINDER_USER_ID?: string;
  NOTION_REMINDER_USER_EMAIL?: string;
};

type StateEntry = { value?: unknown; _ts?: number };
type TodoState = Record<string, StateEntry | unknown>;
type DeliveryMethod = "comment" | "page_mention";

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
  reminderDeliveryMethod?: DeliveryMethod;
  updatedAt?: number;
  startNudgedAt?: number;
}

interface NotionUser {
  id: string;
  type?: string;
  name?: string;
  person?: { email?: string };
  bot?: { owner?: { type?: string; user?: { id?: string } } };
}

interface ReminderCounts {
  taskCount: number;
  activeReminderCount: number;
  dueReminderCount: number;
  scheduledCount: number;
  sentCount: number;
  errorCount: number;
  errorCodes: string[];
}

interface StoredHealth extends ReminderCounts {
  version: 2;
  lastRunAt: number;
  configured: boolean;
  stateFound: boolean;
  sentLastRun: number;
  failedLastRun: number;
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

function classifyError(message?: string): string {
  const value = String(message || "").toLowerCase();
  if (!value) return "unknown";
  if (value.includes("multiple people") || value.includes("reminder user") || value.includes("recipient")) return "recipient_not_resolved";
  if (value.includes("notion 401") || value.includes("unauthorized")) return "notion_auth";
  if (value.includes("notion 403") || value.includes("restricted_resource") || value.includes("permission")) return "notion_permission";
  if (value.includes("object_not_found") || value.includes("database")) return "action_database_access";
  if (value.includes("comment")) return "comment_delivery";
  return "notion_delivery";
}

function rawDue(task: ReminderTask, nowMs: number) {
  if (!task || task.done || !task.reminderAt || task.reminderSentFor === task.reminderAt) return false;
  const due = Date.parse(task.reminderAt);
  return Number.isFinite(due) && due <= nowMs;
}

function countReminders(tasks: ReminderTask[], nowMs: number): ReminderCounts {
  const active = tasks.filter((task) => task && !task.done && !!task.reminderAt);
  const codes = Array.from(new Set(active
    .filter((task) => task.reminderState === "error" || task.reminderLastError)
    .map((task) => classifyError(task.reminderLastError))));
  return {
    taskCount: tasks.length,
    activeReminderCount: active.length,
    dueReminderCount: active.filter((task) => rawDue(task, nowMs)).length,
    scheduledCount: active.filter((task) => task.reminderSentFor !== task.reminderAt && task.reminderState !== "error").length,
    sentCount: active.filter((task) => task.reminderSentFor === task.reminderAt).length,
    errorCount: active.filter((task) => task.reminderState === "error" || !!task.reminderLastError).length,
    errorCodes: codes,
  };
}

async function persistHealth(env: Env, health: StoredHealth, force = false) {
  const previous = await env.WIDGET_KV.get(HEALTH_KEY, "json") as StoredHealth | null;
  const changed = !previous
    || previous.configured !== health.configured
    || previous.stateFound !== health.stateFound
    || previous.activeReminderCount !== health.activeReminderCount
    || previous.dueReminderCount !== health.dueReminderCount
    || previous.sentCount !== health.sentCount
    || previous.errorCount !== health.errorCount
    || (previous.errorCodes || []).join("|") !== health.errorCodes.join("|");
  if (force || changed || !previous || health.lastRunAt - previous.lastRunAt >= HEALTH_WRITE_INTERVAL_MS) {
    await env.WIDGET_KV.put(HEALTH_KEY, JSON.stringify(health));
  }
}

function makeHealth(configured: boolean, stateFound: boolean, tasks: ReminderTask[], nowMs: number, sent = 0, failed = 0): StoredHealth {
  return {
    version: 2,
    lastRunAt: nowMs,
    configured,
    stateFound,
    sentLastRun: sent,
    failedLastRun: failed,
    ...countReminders(tasks, nowMs),
  };
}

export async function getReminderHealth(env: Env, nowMs = Date.now()) {
  const stored = await env.WIDGET_KV.get(HEALTH_KEY, "json") as StoredHealth | null;
  const state = await env.WIDGET_KV.get("todo", "json") as TodoState | null;
  const tasks = unwrapTasks(state);
  const current = makeHealth(Boolean(env.NOTION_TOKEN), Boolean(state && typeof state === "object"), tasks, nowMs);
  return {
    ok: true,
    version: 2,
    lastRunAt: stored?.lastRunAt || null,
    configured: current.configured,
    stateFound: current.stateFound,
    taskCount: current.taskCount,
    activeReminderCount: current.activeReminderCount,
    dueReminderCount: current.dueReminderCount,
    scheduledCount: current.scheduledCount,
    sentCount: current.sentCount,
    errorCount: current.errorCount,
    errorCodes: current.errorCodes,
    sentLastRun: stored?.sentLastRun || 0,
    failedLastRun: stored?.failedLastRun || 0,
  };
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

function candidateId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" && id ? id : null;
}

async function ownerCandidateIds(env: ReminderEnv): Promise<string[]> {
  const dbId = env.ACTION_BLOCKS_DB_ID || DEFAULT_ACTION_BLOCKS_DB_ID;
  const database = await notionFetch(env, `/databases/${dbId}`);
  const ids: string[] = [];
  const parentPageId = database.parent?.type === "page_id" ? database.parent.page_id : null;
  if (parentPageId) {
    try {
      const parent = await notionFetch(env, `/pages/${parentPageId}`);
      const creator = candidateId(parent.created_by);
      const editor = candidateId(parent.last_edited_by);
      if (creator) ids.push(creator);
      if (editor) ids.push(editor);
    } catch {
      // A directly shared database can hide its parent. Database ownership is still useful below.
    }
  }
  const creator = candidateId(database.created_by);
  const editor = candidateId(database.last_edited_by);
  if (creator) ids.push(creator);
  if (editor) ids.push(editor);
  try {
    const me = await notionFetch(env, "/users/me");
    const ownerId = me.bot?.owner?.type === "user" ? me.bot.owner.user?.id : null;
    if (ownerId) ids.unshift(ownerId);
  } catch {
    // Older tokens may not expose the bot owner.
  }
  return Array.from(new Set(ids));
}

async function listPeople(env: ReminderEnv): Promise<NotionUser[]> {
  const people: NotionUser[] = [];
  let cursor: string | undefined;
  do {
    const suffix = cursor ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}` : "?page_size=100";
    const data = await notionFetch(env, `/users${suffix}`);
    people.push(...(data.results || []).filter((user: NotionUser) => user.type === "person"));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor && people.length < 300);
  return people;
}

export async function resolveReminderUser(env: ReminderEnv): Promise<string> {
  if (env.NOTION_REMINDER_USER_ID) return env.NOTION_REMINDER_USER_ID;
  const [ownerIds, people] = await Promise.all([
    ownerCandidateIds(env).catch(() => [] as string[]),
    listPeople(env),
  ]);
  if (env.NOTION_REMINDER_USER_EMAIL) {
    const target = env.NOTION_REMINDER_USER_EMAIL.toLowerCase();
    const matched = people.find((user) => user.person?.email?.toLowerCase() === target);
    if (matched) return matched.id;
  }
  for (const id of ownerIds) {
    if (people.some((person) => person.id === id)) return id;
  }
  if (people.length === 1) return people[0].id;
  if (ownerIds.length) return ownerIds[0];
  throw new Error("Reminder recipient could not be resolved from the Action Blocks owner");
}

async function sendMention(env: ReminderEnv, pageId: string, userId: string, task: ReminderTask): Promise<DeliveryMethod> {
  const mention = [
    { type: "mention", mention: { type: "user", user: { id: userId } } },
    { type: "text", text: { content: ` Reminder: ${(task.text || "To-do item").slice(0, 1700)}` } },
  ];
  try {
    await notionFetch(env, "/comments", {
      method: "POST",
      body: JSON.stringify({ parent: { page_id: pageId }, rich_text: mention }),
    });
    return "comment";
  } catch (commentError) {
    try {
      await notionFetch(env, `/blocks/${pageId}/children`, {
        method: "PATCH",
        body: JSON.stringify({
          children: [{
            object: "block",
            type: "paragraph",
            paragraph: { rich_text: mention, color: "default" },
          }],
        }),
      });
      return "page_mention";
    } catch (blockError) {
      throw new Error(`${(commentError as Error).message}; mention fallback: ${(blockError as Error).message}`);
    }
  }
}

export function dueReminderTasks(tasks: ReminderTask[], nowMs: number): ReminderTask[] {
  return tasks.filter((task) => {
    if (!rawDue(task, nowMs)) return false;
    const attempted = Number(task.reminderLastAttemptAt) || 0;
    return !attempted || nowMs - attempted >= RETRY_AFTER_MS;
  });
}

export async function processDueReminders(env: Env, nowMs = Date.now()) {
  const reminderEnv = env as ReminderEnv;
  if (!reminderEnv.NOTION_TOKEN) {
    await persistHealth(env, makeHealth(false, false, [], nowMs), true);
    return { configured: false, sent: 0, failed: 0, due: 0 };
  }
  const state = await env.WIDGET_KV.get("todo", "json") as TodoState | null;
  if (!state || typeof state !== "object") {
    await persistHealth(env, makeHealth(true, false, [], nowMs));
    return { configured: true, sent: 0, failed: 0, due: 0 };
  }
  const tasks = unwrapTasks(state);
  const due = dueReminderTasks(tasks, nowMs);
  if (!due.length) {
    await persistHealth(env, makeHealth(true, true, tasks, nowMs));
    return { configured: true, sent: 0, failed: 0, due: 0 };
  }

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
      const pageId = await ensureActionPage(reminderEnv, task);
      if (!userId) userId = await resolveReminderUser(reminderEnv);
      const deliveryMethod = await sendMention(reminderEnv, pageId, userId, task);
      task.notionPageId = pageId;
      task.reminderSentFor = task.reminderAt || undefined;
      task.reminderSentAt = nowMs;
      task.reminderState = "sent";
      task.reminderDeliveryMethod = deliveryMethod;
      task.startNudgedAt = task.startNudgedAt || nowMs;
      delete task.reminderLastError;
      await env.WIDGET_KV.put(markerKey, String(nowMs), { expirationTtl: SENT_TTL_SECONDS });
      sent += 1;
    } catch (error) {
      task.reminderState = "error";
      task.reminderLastError = (error as Error).message.slice(0, 500);
      failed += 1;
    }
  }

  if (changed) {
    writeTasks(state, tasks, nowMs);
    await env.WIDGET_KV.put("todo", JSON.stringify(state));
  }
  await persistHealth(env, makeHealth(true, true, tasks, nowMs, sent, failed), true);
  return { configured: true, sent, failed, due: due.length };
}

import { getCorsHeaders } from "../cors";
import type { Env } from "../types";
import { upsertActionBlock } from "./action-blocks";

type Priority = "must" | "should" | "could";
type Category = "study" | "training" | "personal";

interface CreateTodoTaskInput {
  idempotencyKey: string;
  text: string;
  reminderAt: string;
  timezone?: string;
  dueDate?: string;
  priority?: Priority | null;
  plannedMinutes?: number | null;
  category?: Category;
  notes?: string;
  contextPageId?: string | null;
}

interface TodoTask {
  id: string;
  occurrenceId: string;
  notionPageId?: string;
  text: string;
  pri: Priority | null;
  time: "quick" | "m30" | "m60" | "deep" | null;
  due: "today" | "tomorrow" | null;
  dueKey: string;
  setKey: string;
  done: boolean;
  doneAt: null;
  created: number;
  updatedAt: number;
  order: number;
  notes?: string;
  category: Category;
  source: "agent";
  scheduledStart: string;
  scheduledEnd: string | null;
  reminderAt: string;
  reminderTimezone: string;
  reminderVersion: number;
  reminderState: "scheduled";
  reminderOwnsDue: true;
}

type StateEntry = { value?: unknown; _ts?: number };
type TodoState = Record<string, StateEntry | unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...getCorsHeaders() },
  });
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dateKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function dayRelation(dueDate: string, timezone: string): "today" | "tomorrow" | null {
  const now = new Date();
  const today = dateKey(now, timezone);
  const tomorrowDate = new Date(now);
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrow = dateKey(tomorrowDate, timezone);
  if (dueDate === today) return "today";
  if (dueDate === tomorrow) return "tomorrow";
  return null;
}

function durationTag(minutes: number | null): TodoTask["time"] {
  if (!minutes) return null;
  if (minutes <= 15) return "quick";
  if (minutes <= 30) return "m30";
  if (minutes <= 60) return "m60";
  return "deep";
}

function priorityName(priority: Priority | null | undefined) {
  if (!priority) return null;
  return (priority.charAt(0).toUpperCase() + priority.slice(1)) as "Must" | "Should" | "Could";
}

function categoryName(category: Category) {
  if (category === "study") return "Study" as const;
  if (category === "training") return "Training" as const;
  return "Personal" as const;
}

function stableId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `agent-${(hash >>> 0).toString(36)}`;
}

function readTasks(state: TodoState | null): TodoTask[] {
  if (!state || typeof state !== "object") return [];
  const entry = state.tasks;
  const value = entry && typeof entry === "object" && "value" in entry
    ? (entry as StateEntry).value
    : entry;
  if (Array.isArray(value)) return value as TodoTask[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as TodoTask[] : [];
    } catch {
      return [];
    }
  }
  return [];
}

function writeTasks(state: TodoState, tasks: TodoTask[], timestamp: number) {
  state.tasks = { value: JSON.stringify(tasks), _ts: timestamp };
}

function parseInput(value: unknown): { input?: CreateTodoTaskInput; error?: string } {
  if (!value || typeof value !== "object") return { error: "Request body must be an object" };
  const body = value as Partial<CreateTodoTaskInput>;
  const idempotencyKey = String(body.idempotencyKey || "").trim();
  const text = String(body.text || "").trim();
  const reminderAt = String(body.reminderAt || "").trim();
  const timezone = String(body.timezone || "America/Toronto").trim();
  if (!idempotencyKey || idempotencyKey.length > 180) return { error: "A valid idempotencyKey is required" };
  if (!text || text.length > 500) return { error: "Task text must be between 1 and 500 characters" };
  const reminderDate = new Date(reminderAt);
  if (!reminderAt || !Number.isFinite(reminderDate.getTime())) return { error: "A valid reminderAt instant is required" };
  if (reminderDate.getTime() < Date.now() + 30_000) return { error: "Reminder time must be in the future" };
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(reminderDate);
  } catch {
    return { error: "Invalid IANA timezone" };
  }
  const dueDate = String(body.dueDate || dateKey(reminderDate, timezone));
  if (!isDateKey(dueDate)) return { error: "dueDate must use YYYY-MM-DD" };
  const priority = body.priority == null ? null : body.priority;
  if (priority && !["must", "should", "could"].includes(priority)) return { error: "Invalid priority" };
  const category = body.category || "personal";
  if (!["study", "training", "personal"].includes(category)) return { error: "Invalid category" };
  const plannedMinutes = body.plannedMinutes == null ? null : Number(body.plannedMinutes);
  if (plannedMinutes != null && (!Number.isFinite(plannedMinutes) || plannedMinutes < 1 || plannedMinutes > 720)) {
    return { error: "plannedMinutes must be between 1 and 720" };
  }
  return {
    input: {
      idempotencyKey,
      text,
      reminderAt: reminderDate.toISOString(),
      timezone,
      dueDate,
      priority,
      plannedMinutes,
      category,
      notes: String(body.notes || "").trim().slice(0, 1900),
      contextPageId: body.contextPageId ? String(body.contextPageId) : null,
    },
  };
}

export async function handleTodoTask(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!env.NOTION_TOKEN) return json({ configured: false, error: "Notion integration not configured" }, 501);

  const parsed = parseInput(await request.json());
  if (!parsed.input) return json({ error: parsed.error || "Invalid request" }, 400);
  const input = parsed.input;
  const now = Date.now();
  const occurrenceId = `agent:${input.idempotencyKey}`;
  const state = await env.WIDGET_KV.get("todo", "json") as TodoState | null;
  const nextState: TodoState = state && typeof state === "object" ? state : {};
  const tasks = readTasks(nextState);
  const existingIndex = tasks.findIndex((task) => task?.occurrenceId === occurrenceId);
  const existing = existingIndex >= 0 ? tasks[existingIndex] : null;
  const minutes = input.plannedMinutes ?? null;
  const end = minutes
    ? new Date(Date.parse(input.reminderAt) + minutes * 60_000).toISOString()
    : null;

  try {
    const actionBlock = await upsertActionBlock(env, {
      notionPageId: existing?.notionPageId,
      occurrenceId,
      action: input.text,
      category: categoryName(input.category || "personal"),
      status: existing?.done ? "Done" : "Scheduled",
      scheduledStart: input.reminderAt,
      scheduledEnd: end,
      contextPageId: input.contextPageId,
      plannedMinutes: minutes,
      priority: priorityName(input.priority),
      source: "Manual",
      notes: input.notes || "Created from a reminder request in Notion AI",
    });

    const task: TodoTask = {
      ...(existing || {}),
      id: existing?.id || stableId(occurrenceId),
      occurrenceId,
      notionPageId: actionBlock.notionPageId,
      text: input.text,
      pri: input.priority || null,
      time: durationTag(minutes),
      due: dayRelation(input.dueDate!, input.timezone!),
      dueKey: input.dueDate!,
      setKey: existing?.setKey || dateKey(new Date(), input.timezone!),
      done: existing?.done || false,
      doneAt: existing?.doneAt || null,
      created: existing?.created || now,
      updatedAt: now,
      order: existing?.order || now,
      notes: input.notes || undefined,
      category: input.category || "personal",
      source: "agent",
      scheduledStart: input.reminderAt,
      scheduledEnd: end,
      reminderAt: input.reminderAt,
      reminderTimezone: input.timezone!,
      reminderVersion: now,
      reminderState: "scheduled",
      reminderOwnsDue: true,
    };
    if (existingIndex >= 0) tasks[existingIndex] = task;
    else tasks.unshift(task);
    writeTasks(nextState, tasks, now);
    await env.WIDGET_KV.put("todo", JSON.stringify(nextState));

    return json({
      ok: true,
      created: existingIndex < 0,
      task: {
        id: task.id,
        occurrenceId: task.occurrenceId,
        notionPageId: task.notionPageId,
        reminderAt: task.reminderAt,
      },
    });
  } catch (error) {
    return json({ ok: false, error: "Task bridge failed", detail: (error as Error).message }, 502);
  }
}
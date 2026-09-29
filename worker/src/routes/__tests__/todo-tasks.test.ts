import { afterEach, describe, expect, it, vi } from "vitest";
import { handleTodoTask } from "../todo-tasks";

afterEach(() => {
  vi.unstubAllGlobals();
});

class MemoryKv {
  values = new Map<string, string>();
  async get(key: string, type?: string) {
    const value = this.values.get(key);
    if (value == null) return null;
    return type === "json" ? JSON.parse(value) : value;
  }
  async put(key: string, value: string) {
    this.values.set(key, value);
  }
}

function request(body: Record<string, unknown>) {
  return new Request("https://worker.example/notion/todo-task", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("agent to-do bridge", () => {
  it("creates one widget task and one scheduled Action Block", async () => {
    const kv = new MemoryKv();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/databases/action-db/query")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      if (url.endsWith("/pages")) {
        const body = JSON.parse(String(init?.body || "{}"));
        expect(body.properties.Action.title[0].text.content).toBe("Review contract notes");
        expect(body.properties.Scheduled.date.start).toBe("2027-01-02T18:00:00.000Z");
        return new Response(JSON.stringify({
          id: "notion-page-1",
          properties: body.properties,
        }), { status: 200 });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleTodoTask(request({
      idempotencyKey: "session-1:review-contract",
      text: "Review contract notes",
      reminderAt: "2027-01-02T18:00:00.000Z",
      timezone: "America/Toronto",
      dueDate: "2027-01-02",
      priority: "must",
      plannedMinutes: 60,
      category: "study",
    }), {
      WIDGET_KV: kv,
      NOTION_TOKEN: "token",
      ACTION_BLOCKS_DB_ID: "action-db",
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, created: true });
    const state = JSON.parse(kv.values.get("todo") || "{}");
    const tasks = JSON.parse(state.tasks.value);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      text: "Review contract notes",
      dueKey: "2027-01-02",
      reminderState: "scheduled",
      notionPageId: "notion-page-1",
      source: "agent",
    });
  });

  it("is idempotent across retries", async () => {
    const kv = new MemoryKv();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/databases/action-db/query")) {
        return new Response(JSON.stringify({ results: [{ id: "notion-page-1", properties: {} }] }), { status: 200 });
      }
      if (url.endsWith("/pages/notion-page-1")) {
        const body = JSON.parse(String(init?.body || "{}"));
        return new Response(JSON.stringify({ id: "notion-page-1", properties: body.properties }), { status: 200 });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const env = { WIDGET_KV: kv, NOTION_TOKEN: "token", ACTION_BLOCKS_DB_ID: "action-db" } as never;
    const body = {
      idempotencyKey: "same-request",
      text: "Repeat-safe task",
      reminderAt: "2027-01-02T18:00:00.000Z",
      timezone: "America/Toronto",
      dueDate: "2027-01-02",
    };
    await handleTodoTask(request(body), env);
    const second = await handleTodoTask(request(body), env);
    expect(await second.json()).toMatchObject({ ok: true, created: false });
    const state = JSON.parse(kv.values.get("todo") || "{}");
    expect(JSON.parse(state.tasks.value)).toHaveLength(1);
  });

  it("rejects a past reminder before writing either system", async () => {
    const kv = new MemoryKv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await handleTodoTask(request({
      idempotencyKey: "past",
      text: "Past task",
      reminderAt: "2020-01-01T18:00:00.000Z",
    }), { WIDGET_KV: kv, NOTION_TOKEN: "token" } as never);
    expect(response.status).toBe(400);
    expect(kv.values.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
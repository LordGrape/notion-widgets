import { afterEach, describe, expect, it, vi } from "vitest";
import { dueReminderTasks, getReminderHealth, processDueReminders, reminderFingerprint } from "../reminders";

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

function todoState(tasks: unknown[]) {
  return JSON.stringify({ tasks: { value: JSON.stringify(tasks), _ts: 1 } });
}

describe("to-do reminder selection", () => {
  it("selects only due, open, unsent reminders", () => {
    const now = Date.parse("2026-09-04T16:00:00.000Z");
    const due = { id: "due", reminderAt: "2026-09-04T15:59:00.000Z", done: false };
    const future = { id: "future", reminderAt: "2026-09-04T16:01:00.000Z", done: false };
    const done = { id: "done", reminderAt: "2026-09-04T15:59:00.000Z", done: true };
    const sent = { id: "sent", reminderAt: "2026-09-04T15:59:00.000Z", reminderSentFor: "2026-09-04T15:59:00.000Z" };
    expect(dueReminderTasks([due, future, done, sent], now)).toEqual([due]);
    expect(reminderFingerprint(due)).toBe(reminderFingerprint(due));
  });
});

describe("Notion reminder delivery", () => {
  it("posts a user mention and marks the reminder sent", async () => {
    const kv = new MemoryKv();
    kv.values.set("todo", todoState([{ id: "task-1", text: "Submit form", notionPageId: "page-1", reminderAt: "2026-09-04T15:59:00.000Z", reminderVersion: 1, done: false }]));
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.notion.com/v1/comments");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body || "{}"));
      expect(body.parent.page_id).toBe("page-1");
      expect(body.rich_text[0].mention.user.id).toBe("user-1");
      return new Response(JSON.stringify({ id: "comment-1" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await processDueReminders({ WIDGET_KV: kv, NOTION_TOKEN: "token", NOTION_REMINDER_USER_ID: "user-1" } as never, Date.parse("2026-09-04T16:00:00.000Z"));
    expect(result).toMatchObject({ sent: 1, failed: 0, due: 1 });
    const saved = JSON.parse(kv.values.get("todo") || "{}");
    const tasks = JSON.parse(saved.tasks.value);
    expect(tasks[0].reminderState).toBe("sent");
    expect(tasks[0].reminderDeliveryMethod).toBe("comment");
  });

  it("falls back to an in-page mention when comments are unavailable", async () => {
    const kv = new MemoryKv();
    kv.values.set("todo", todoState([{ id: "task-fallback", text: "Fallback", notionPageId: "page-2", reminderAt: "2026-09-04T15:59:00.000Z", done: false }]));
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/comments")) return new Response(JSON.stringify({ code: "restricted_resource" }), { status: 403 });
      if (url.endsWith("/blocks/page-2/children")) {
        const body = JSON.parse(String(init?.body || "{}"));
        expect(body.children[0].paragraph.rich_text[0].mention.user.id).toBe("user-1");
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await processDueReminders({ WIDGET_KV: kv, NOTION_TOKEN: "token", NOTION_REMINDER_USER_ID: "user-1" } as never, Date.parse("2026-09-04T16:00:00.000Z"));
    expect(result.sent).toBe(1);
    const saved = JSON.parse(kv.values.get("todo") || "{}");
    const tasks = JSON.parse(saved.tasks.value);
    expect(tasks[0].reminderDeliveryMethod).toBe("page_mention");
  });

  it("resolves the recipient from the Action Blocks parent owner", async () => {
    const kv = new MemoryKv();
    kv.values.set("todo", todoState([{ id: "task-owner", text: "Owner", notionPageId: "page-3", reminderAt: "2026-09-04T15:59:00.000Z", done: false }]));
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/databases/action-db")) return new Response(JSON.stringify({ parent: { type: "page_id", page_id: "hq" }, created_by: { id: "bot" } }), { status: 200 });
      if (url.endsWith("/pages/hq")) return new Response(JSON.stringify({ created_by: { id: "owner" } }), { status: 200 });
      if (url.endsWith("/users/me")) return new Response(JSON.stringify({ bot: { owner: { type: "workspace" } } }), { status: 200 });
      if (url.includes("/users?page_size=100")) return new Response(JSON.stringify({ results: [{ id: "other", type: "person" }, { id: "owner", type: "person" }], has_more: false }), { status: 200 });
      if (url.endsWith("/comments")) {
        const body = JSON.parse(String(init?.body || "{}"));
        expect(body.rich_text[0].mention.user.id).toBe("owner");
        return new Response(JSON.stringify({ id: "comment-owner" }), { status: 200 });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await processDueReminders({ WIDGET_KV: kv, NOTION_TOKEN: "token", ACTION_BLOCKS_DB_ID: "action-db" } as never, Date.parse("2026-09-04T16:00:00.000Z"));
    expect(result).toMatchObject({ sent: 1, failed: 0 });
  });

  it("creates an Action Block page before mentioning when needed", async () => {
    const kv = new MemoryKv();
    kv.values.set("todo", todoState([{ id: "task-2", text: "Read case", pri: "must", category: "study", reminderAt: "2026-09-04T15:59:00.000Z", reminderVersion: 2, done: false }]));
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/databases/action-db/query")) return new Response(JSON.stringify({ results: [] }), { status: 200 });
      if (url.endsWith("/pages")) return new Response(JSON.stringify({ id: "created-page" }), { status: 200 });
      if (url.endsWith("/comments")) return new Response(JSON.stringify({ id: "comment-2" }), { status: 200 });
      throw new Error(`Unexpected request ${init?.method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await processDueReminders({ WIDGET_KV: kv, NOTION_TOKEN: "token", NOTION_REMINDER_USER_ID: "user-1", ACTION_BLOCKS_DB_ID: "action-db" } as never, Date.parse("2026-09-04T16:00:00.000Z"));
    expect(result.sent).toBe(1);
    const saved = JSON.parse(kv.values.get("todo") || "{}");
    const tasks = JSON.parse(saved.tasks.value);
    expect(tasks[0].notionPageId).toBe("created-page");
  });

  it("returns a sanitized reminder health snapshot", async () => {
    const kv = new MemoryKv();
    kv.values.set("todo", todoState([{ id: "private-id", text: "Private title", reminderAt: "2026-09-04T15:59:00.000Z", reminderState: "error", reminderLastError: "Notion 403: restricted_resource" }]));
    const health = await getReminderHealth({ WIDGET_KV: kv, NOTION_TOKEN: "token" } as never, Date.parse("2026-09-04T16:00:00.000Z"));
    expect(health).toMatchObject({ activeReminderCount: 1, dueReminderCount: 1, errorCount: 1, errorCodes: ["notion_permission"] });
    expect(JSON.stringify(health)).not.toContain("Private title");
    expect(JSON.stringify(health)).not.toContain("private-id");
  });
});

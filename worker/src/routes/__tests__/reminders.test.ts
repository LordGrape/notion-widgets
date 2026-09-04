import { afterEach, describe, expect, it, vi } from "vitest";
import { dueReminderTasks, processDueReminders, reminderFingerprint } from "../reminders";

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
      expect(body.rich_text[1].text.content).toContain("Submit form");
      return new Response(JSON.stringify({ id: "comment-1" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await processDueReminders({ WIDGET_KV: kv, NOTION_TOKEN: "token", NOTION_REMINDER_USER_ID: "user-1" } as never, Date.parse("2026-09-04T16:00:00.000Z"));
    expect(result).toMatchObject({ sent: 1, failed: 0, due: 1 });
    const saved = JSON.parse(kv.values.get("todo") || "{}");
    const tasks = JSON.parse(saved.tasks.value);
    expect(tasks[0].reminderState).toBe("sent");
    expect(tasks[0].reminderSentFor).toBe(tasks[0].reminderAt);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const saved = JSON.parse(kv.values.get("todo") || "{}");
    const tasks = JSON.parse(saved.tasks.value);
    expect(tasks[0].notionPageId).toBe("created-page");
  });
});

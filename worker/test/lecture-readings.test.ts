import { afterEach, describe, expect, it, vi } from "vitest";
import { fromLecturePage, handleLectureReadings, lectureFilter } from "../src/routes/lecture-readings";

const page = (over: Record<string, unknown> = {}) => ({
  id: "page-1",
  url: "https://notion.so/page-1",
  properties: {
    "lecture/assignment": { title: [{ plain_text: "W9Z: Sample Lecture" }] },
    date: { date: { start: "2026-10-05T18:30:00.000Z", end: null } },
    progress: { status: { name: "not started" } },
    notes: { rich_text: [{ plain_text: "READINGS\n• Sample Text, pp. 78–98" }] },
    course: { relation: [{ id: "course-1" }] },
    ...over,
  },
});

afterEach(() => vi.unstubAllGlobals());

describe("lecture readings route", () => {
  it("only asks Notion for open lectures in the window", () => {
    const filter = JSON.stringify(lectureFilter("2026-10-05", "2026-10-12"));
    expect(filter).toContain('"assignment","select":{"is_empty":true}');
    expect(filter).toContain('"does_not_equal":"done"');
    expect(filter).toContain("2026-10-05");
    expect(filter).toContain("2026-10-12");
  });

  it("maps a page and keeps the line breaks in the notes", () => {
    const row = fromLecturePage(page() as any)!;
    expect(row).toMatchObject({ id: "page-1", title: "W9Z: Sample Lecture", progress: "not started", courseId: "course-1" });
    expect(row.notes).toBe("READINGS\n• Sample Text, pp. 78–98");
  });

  it("skips rows without a date or title", () => {
    expect(fromLecturePage(page({ date: { date: null } }) as any)).toBeNull();
    expect(fromLecturePage(page({ "lecture/assignment": { title: [] } }) as any)).toBeNull();
  });

  it("rejects a bad window and a missing token", async () => {
    const env = { NOTION_TOKEN: "t" } as any;
    expect((await handleLectureReadings(new Request("https://w/notion/readings?from=2026-10-12&to=2026-10-05"), env)).status).toBe(400);
    expect((await handleLectureReadings(new Request("https://w/notion/readings?from=a&to=b"), env)).status).toBe(400);
    expect((await handleLectureReadings(new Request("https://w/notion/readings?from=2026-10-05&to=2026-10-12"), {} as any)).status).toBe(501);
  });

  it("returns lectures with course names", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: string) => {
      calls.push(String(input));
      if (String(input).includes("/query")) return new Response(JSON.stringify({ results: [page()] }), { status: 200 });
      return new Response(JSON.stringify({ properties: { name: { title: [{ plain_text: "Sample Course" }] } } }), { status: 200 });
    });
    const res = await handleLectureReadings(new Request("https://w/notion/readings?from=2026-10-05&to=2026-10-12"), { NOTION_TOKEN: "t" } as any);
    const body = (await res.json()) as any;
    expect(body.lectures).toHaveLength(1);
    expect(body.courses).toEqual({ "course-1": "Sample Course" });
    expect(calls.some((c) => c.endsWith("/pages/course-1"))).toBe(true);
  });

  it("reports a Notion failure without throwing", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 403 }));
    const res = await handleLectureReadings(new Request("https://w/notion/readings?from=2026-10-05&to=2026-10-12"), { NOTION_TOKEN: "t" } as any);
    expect(res.status).toBe(502);
    expect(((await res.json()) as any).lectures).toEqual([]);
  });
});

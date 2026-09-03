import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assessmentFingerprint,
  fromNotionPage,
  handleFitnessTests,
  normaliseAssessment,
  toNotionProperties,
} from "../fitness-tests";

afterEach(() => {
  vi.unstubAllGlobals();
});

const sample = {
  id: "e-assessment-1",
  t: "run2400",
  d: "2026-06-26",
  v: 551,
  load: null,
  dist: null,
  raw: "9:11",
  ts: 1_750_953_600_000,
  score: 54,
  level: "Below L1" as const,
};

function manualPage() {
  return {
    id: "manual-page-1",
    last_edited_time: "2026-09-03T12:00:00.000Z",
    properties: {
      Entry: { title: [{ plain_text: "2400 m run · 2026-06-26" }] },
      Test: { select: { name: "2400 m run" } },
      Category: { select: { name: "SOA" } },
      Component: { select: { name: "Aerobic Power" } },
      Date: { date: { start: "2026-06-26", end: null } },
      Result: { rich_text: [{ plain_text: "9:11" }] },
      Value: { number: 551 },
      Unit: { select: { name: "s" } },
      "Level / Tier": { select: { name: "Below L1" } },
      "Athlete score": { number: 54 },
      "Widget Entry ID": { rich_text: [] },
    },
  };
}

describe("fitness assessment mapping", () => {
  it("validates the bounded widget payload", () => {
    expect(normaliseAssessment(sample)).toEqual(sample);
    expect(normaliseAssessment({ ...sample, t: "unknown" })).toBeNull();
    expect(normaliseAssessment({ ...sample, d: "2026-9-3" })).toBeNull();
    expect(normaliseAssessment({ ...sample, score: 200 })).toBeNull();
  });

  it("maps an assessment to the existing Test Log schema", () => {
    const properties = toNotionProperties(sample) as Record<
      string,
      { select?: { name: string }; number?: number; date?: { start: string } }
    >;
    expect(properties.Test.select?.name).toBe("2400 m run");
    expect(properties.Category.select?.name).toBe("SOA");
    expect(properties.Component.select?.name).toBe("Aerobic Power");
    expect(properties.Date.date?.start).toBe("2026-06-26");
    expect(properties["Athlete score"].number).toBe(54);
  });

  it("imports compatible manual Notion rows with a stable page identity", () => {
    const mapped = fromNotionPage(manualPage());
    expect(mapped).not.toBeNull();
    expect(mapped?.id).toBe("notion:manual-page-1");
    expect(mapped?.t).toBe("run2400");
    expect(mapped?.v).toBe(551);
    expect(assessmentFingerprint(mapped!)).toBe(
      assessmentFingerprint(sample),
    );
  });
});

describe("fitness assessment route", () => {
  it("adopts a matching manual row instead of creating a duplicate", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/databases/") && url.endsWith("/query")) {
        return new Response(
          JSON.stringify({ results: [manualPage()], has_more: false }),
          { status: 200 },
        );
      }
      if (url.endsWith("/pages/manual-page-1") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body || "{}"));
        return new Response(
          JSON.stringify({
            id: "manual-page-1",
            last_edited_time: "2026-09-03T13:00:00.000Z",
            properties: body.properties,
          }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected Notion request: ${init?.method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleFitnessTests(
      new Request("https://worker.example/notion/fitness-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [sample] }),
      }),
      {
        NOTION_TOKEN: "test-token",
        FITNESS_TEST_DB_ID: "test-log",
      } as never,
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      configured: boolean;
      items: Array<{ id: string }>;
    };
    expect(payload.configured).toBe(true);
    expect(payload.items[0].id).toBe(sample.id);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const patchBody = JSON.parse(
      String((fetchMock.mock.calls[1][1] as RequestInit).body),
    );
    expect(
      patchBody.properties["Widget Entry ID"].rich_text[0].text.content,
    ).toBe(sample.id);
  });

  it("rejects malformed assessments before contacting Notion", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await handleFitnessTests(
      new Request("https://worker.example/notion/fitness-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ ...sample, id: "bad id" }] }),
      }),
      { NOTION_TOKEN: "test-token" } as never,
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

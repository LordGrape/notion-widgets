/**
 * Tests for gemini.ts pure surfaces: text extraction, finish reasons, SSE
 * event framing, and the usage/cost math that feeds budget reporting.
 * KV is faked in memory; no network. Added in Phase V4-ii (2026-08-18).
 */
import { describe, expect, it } from "vitest";
import type { Env } from "./types";
import {
  buildGeminiUsageEvent,
  extractGeminiText,
  findSseEventSeparatorForTest,
  getFinishReason,
  recordGeminiUsage
} from "./gemini";
import type { GeminiUsageDay, GeminiUsageEvent } from "./gemini";

describe("extractGeminiText", () => {
  it("returns an empty string for empty responses or missing parts", () => {
    expect(extractGeminiText({})).toBe("");
    expect(extractGeminiText({ candidates: [{ content: { parts: [] } }] })).toBe("");
  });

  it("skips thought parts and returns the last text part", () => {
    const data = {
      candidates: [
        {
          content: {
            parts: [
              { thought: true, text: "chain of thought" },
              { text: "first" },
              { text: "final answer" }
            ]
          }
        }
      ]
    };
    expect(extractGeminiText(data)).toBe("final answer");
  });
});

describe("getFinishReason", () => {
  it("reads the finish reason when present", () => {
    expect(getFinishReason({ candidates: [{ finishReason: "STOP" }] })).toBe("STOP");
  });

  it("returns undefined when absent", () => {
    expect(getFinishReason({})).toBeUndefined();
  });
});

describe("findSseEventSeparatorForTest", () => {
  it("finds an LF blank-line separator", () => {
    expect(findSseEventSeparatorForTest("data: x\n\ndata: y")).toEqual({ index: 7, length: 2 });
  });

  it("finds a CRLF blank-line separator", () => {
    expect(findSseEventSeparatorForTest("a\r\n\r\nb")).toEqual({ index: 1, length: 4 });
  });

  it("prefers whichever separator comes first", () => {
    expect(findSseEventSeparatorForTest("x\n\ny\r\n\r\nz")).toEqual({ index: 1, length: 2 });
  });

  it("returns null when no separator exists", () => {
    expect(findSseEventSeparatorForTest("no separator")).toBeNull();
  });
});

describe("buildGeminiUsageEvent", () => {
  const ts = Date.UTC(2026, 7, 18, 12);

  it("returns null for missing or all-zero usage", () => {
    expect(buildGeminiUsageEvent("gemini-2.5-flash", undefined, ts)).toBeNull();
    expect(buildGeminiUsageEvent("gemini-2.5-flash", {}, ts)).toBeNull();
  });

  it("dates the event by UTC day and classifies the model family", () => {
    const evt = buildGeminiUsageEvent(
      "gemini-2.5-flash-lite",
      { promptTokenCount: 1000, candidatesTokenCount: 200, totalTokenCount: 1200 },
      ts
    );
    expect(evt?.date).toBe("2026-08-18");
    expect(evt?.family).toBe("flash-lite");
  });

  it("falls back to input plus output when no total is provided", () => {
    const evt = buildGeminiUsageEvent("gemini-2.5-flash", { promptTokenCount: 100, candidatesTokenCount: 50 }, ts);
    expect(evt?.totalTokens).toBe(150);
  });

  it("prices flash with cached tokens deducted from billable input", () => {
    const evt = buildGeminiUsageEvent(
      "gemini-2.5-flash",
      { promptTokenCount: 500000, candidatesTokenCount: 100000, totalTokenCount: 600000, cachedContentTokenCount: 200000 },
      ts
    );
    expect(evt?.costUsd).toBeCloseTo(0.34, 10);
  });

  it("applies the pro over-200k pricing tier", () => {
    const evt = buildGeminiUsageEvent(
      "gemini-2.5-pro",
      { promptTokenCount: 250000, candidatesTokenCount: 10000, totalTokenCount: 260000 },
      ts
    );
    expect(evt?.costUsd).toBeCloseTo(0.775, 10);
  });

  it("applies the pro under-200k pricing tier", () => {
    const evt = buildGeminiUsageEvent(
      "gemini-2.5-pro",
      { promptTokenCount: 100000, candidatesTokenCount: 10000, totalTokenCount: 110000 },
      ts
    );
    expect(evt?.costUsd).toBeCloseTo(0.225, 10);
  });

  it("prices unknown model families at zero", () => {
    const evt = buildGeminiUsageEvent("unknown-model", { promptTokenCount: 1000, candidatesTokenCount: 100 }, ts);
    expect(evt?.family).toBe("other");
    expect(evt?.costUsd).toBe(0);
  });
});

type KvPut = { key: string; value: string; options?: { expirationTtl?: number } };

function makeKvEnv(initial?: Record<string, unknown>) {
  const store = new Map<string, unknown>(Object.entries(initial || {}));
  const puts: KvPut[] = [];
  const env = {
    WIDGET_KV: {
      async get(key: string, _format?: string) {
        return store.has(key) ? store.get(key) : null;
      },
      async put(key: string, value: string, options?: { expirationTtl?: number }) {
        store.set(key, JSON.parse(value));
        puts.push({ key, value, options });
      }
    }
  } as unknown as Env;
  return { env, puts, store };
}

describe("recordGeminiUsage", () => {
  const usage = { promptTokenCount: 1000, candidatesTokenCount: 200, totalTokenCount: 1200 };

  it("does nothing for missing usage", async () => {
    const { env, puts } = makeKvEnv();
    await recordGeminiUsage(env, "gemini-2.5-flash", undefined);
    expect(puts).toHaveLength(0);
  });

  it("creates a new day row with family rollup and a 120-day TTL", async () => {
    const { env, puts } = makeKvEnv();
    await recordGeminiUsage(env, "gemini-2.5-flash", usage);
    const today = new Date().toISOString().slice(0, 10);
    expect(puts).toHaveLength(1);
    expect(puts[0].key).toBe(`studyengine:ai-usage:${today}`);
    expect(puts[0].options?.expirationTtl).toBe(60 * 60 * 24 * 120);
    const day = JSON.parse(puts[0].value) as GeminiUsageDay;
    expect(day.calls).toBe(1);
    expect(day.byFamily.flash.calls).toBe(1);
    expect(day.events).toHaveLength(1);
    expect(day.costUsd).toBeCloseTo(0.0008, 10);
  });

  it("aggregates into an existing day row", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const priorEvent: GeminiUsageEvent = {
      date: today,
      ts: Date.UTC(2026, 7, 18, 8),
      model: "gemini-2.5-flash",
      family: "flash",
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      cachedTokens: 0,
      costUsd: 0.1
    };
    const existing: GeminiUsageDay = {
      date: today,
      calls: 1,
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      cachedTokens: 0,
      costUsd: 0.1,
      byFamily: {
        flash: { calls: 1, inputTokens: 100, outputTokens: 50, totalTokens: 150, cachedTokens: 0, costUsd: 0.1 }
      },
      events: [priorEvent]
    };
    const { env, puts } = makeKvEnv({ [`studyengine:ai-usage:${today}`]: existing });
    await recordGeminiUsage(env, "gemini-2.5-flash", usage);
    const day = JSON.parse(puts[0].value) as GeminiUsageDay;
    expect(day.calls).toBe(2);
    expect(day.inputTokens).toBe(1100);
    expect(day.byFamily.flash.calls).toBe(2);
    expect(day.events).toHaveLength(2);
  });
});

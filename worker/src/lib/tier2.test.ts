/**
 * Tests for lib/tier2.ts: the tier-2 usage telemetry write path.
 * KV is faked in memory; no network. Added in Phase V4-ii (2026-08-18).
 */
import { describe, expect, it } from "vitest";
import type { Env } from "../types";
import { emitTier2Event } from "./tier2";

type Tier2Event = { route: string; model: string; ts: number };

function makeKvEnv(initial?: Record<string, Tier2Event[]>) {
  const store = new Map<string, unknown>(Object.entries(initial || {}));
  const puts: Array<{ key: string; value: string; options?: { expirationTtl?: number } }> = [];
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

describe("emitTier2Event", () => {
  const evt = { route: "/studyengine/tutor", model: "gemini-2.5-pro", ts: Date.UTC(2026, 0, 15, 23, 30) };

  it("creates a new day bucket keyed by UTC date with a 90-day TTL", async () => {
    const { env, puts } = makeKvEnv();
    await emitTier2Event(env, evt);
    expect(puts).toHaveLength(1);
    expect(puts[0].key).toBe("tier2:2026-01-15");
    expect(puts[0].options?.expirationTtl).toBe(60 * 60 * 24 * 90);
    expect(JSON.parse(puts[0].value)).toEqual([evt]);
  });

  it("appends to an existing day bucket", async () => {
    const prior = { route: "/studyengine/learn-plan", model: "gemini-2.5-flash", ts: Date.UTC(2026, 0, 15, 10) };
    const { env, puts } = makeKvEnv({ "tier2:2026-01-15": [prior] });
    await emitTier2Event(env, evt);
    expect(puts).toHaveLength(1);
    expect(JSON.parse(puts[0].value)).toEqual([prior, evt]);
  });
});

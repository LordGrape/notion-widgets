import { getCorsHeaders } from "../cors";
import type { Env } from "../types";
import type { GeminiUsageDay } from "../gemini";

interface UsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens: number;
  costUsd: number;
}

function emptyTotals(): UsageTotals {
  return { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0, costUsd: 0 };
}

function addTotals(target: UsageTotals, source: Partial<UsageTotals> | undefined): void {
  if (!source) return;
  target.calls += Number(source.calls || 0);
  target.inputTokens += Number(source.inputTokens || 0);
  target.outputTokens += Number(source.outputTokens || 0);
  target.totalTokens += Number(source.totalTokens || 0);
  target.cachedTokens += Number(source.cachedTokens || 0);
  target.costUsd += Number(source.costUsd || 0);
}

function isoDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export async function handleAiUsage(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...getCorsHeaders() }
    });
  }

  const url = new URL(request.url);
  const days = Math.max(1, Math.min(90, Math.floor(Number(url.searchParams.get("days") || 31))));
  const today = new Date();
  const monthKey = today.toISOString().slice(0, 7);
  const daily: GeminiUsageDay[] = [];
  const total = emptyTotals();
  const month = emptyTotals();
  const byFamily: Record<string, UsageTotals> = {};
  const events: GeminiUsageDay["events"] = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const day = isoDay(Date.now() - i * 24 * 60 * 60 * 1000);
    const row = await env.WIDGET_KV.get(`studyengine:ai-usage:${day}`, "json") as GeminiUsageDay | null;
    if (!row) continue;
    daily.push(row);
    addTotals(total, row);
    if (String(row.date || "").startsWith(monthKey)) addTotals(month, row);
    for (const [family, familyRow] of Object.entries(row.byFamily || {})) {
      if (!byFamily[family]) byFamily[family] = emptyTotals();
      addTotals(byFamily[family], familyRow);
    }
    events.push(...(Array.isArray(row.events) ? row.events : []));
  }

  return new Response(JSON.stringify({
    ok: true,
    source: "worker-kv",
    pricing: {
      currency: "USD",
      basis: "Google Gemini API paid-tier text token pricing per 1M tokens",
      models: {
        "gemini-2.5-flash-lite": { inputPerMillion: 0.10, outputPerMillion: 0.40 },
        "gemini-2.5-flash": { inputPerMillion: 0.30, outputPerMillion: 2.50 },
        "gemini-2.5-pro": { inputPerMillionUnder200k: 1.25, outputPerMillionUnder200k: 10.00, inputPerMillionOver200k: 2.50, outputPerMillionOver200k: 15.00 }
      }
    },
    days,
    total,
    month,
    byFamily,
    daily,
    recentEvents: events.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0)).slice(0, 50)
  }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...getCorsHeaders() }
  });
}

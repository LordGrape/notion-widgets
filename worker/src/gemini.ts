import type { Env } from "./types";
import { parseJsonResponse } from "./utils/json";

export interface GeminiGenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: GeminiJsonValue;
  thinkingConfig?: GeminiThinkingConfig;
  [key: string]: unknown;
}

export interface GeminiThinkingConfig {
  thinkingBudget?: number;
  includeThoughts?: boolean;
}

export type GeminiJsonPrimitive = string | number | boolean | null;
export type GeminiJsonObject = { [key: string]: GeminiJsonValue };
export type GeminiJsonArray = GeminiJsonValue[];
export type GeminiJsonValue = GeminiJsonPrimitive | GeminiJsonObject | GeminiJsonArray;

export interface GeminiPart {
  thought?: boolean;
  text?: string;
}

export interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
    finishReason?: string;
  }>;
  usageMetadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface GeminiCallOptions {
  serviceTier?: "default" | "flex";
  cachedContent?: string;
}

export interface GeminiUsageEvent {
  date: string;
  ts: number;
  model: string;
  family: "flash" | "flash-lite" | "pro" | "other";
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens: number;
  costUsd: number;
}

interface UsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens: number;
  costUsd: number;
}

export interface GeminiUsageDay extends UsageTotals {
  date: string;
  byFamily: Record<string, UsageTotals>;
  events: GeminiUsageEvent[];
}

function emptyUsageTotals(): UsageTotals {
  return { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0, costUsd: 0 };
}

function emptyUsageDay(date: string): GeminiUsageDay {
  return { date, ...emptyUsageTotals(), byFamily: {}, events: [] };
}

function modelFamily(model: string): GeminiUsageEvent["family"] {
  const raw = String(model || "").toLowerCase();
  if (raw.includes("flash-lite")) return "flash-lite";
  if (raw.includes("flash")) return "flash";
  if (raw.includes("pro")) return "pro";
  return "other";
}

function tokenNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function buildGeminiUsageEvent(model: string, usage: Record<string, unknown> | undefined, ts = Date.now()): GeminiUsageEvent | null {
  if (!usage || typeof usage !== "object") return null;
  const inputTokens = tokenNumber(usage.promptTokenCount ?? usage.promptTokens ?? usage.inputTokens);
  const outputTokens = tokenNumber(usage.candidatesTokenCount ?? usage.candidateTokens ?? usage.outputTokens);
  const totalTokens = tokenNumber(usage.totalTokenCount ?? usage.totalTokens) || inputTokens + outputTokens;
  const cachedTokens = tokenNumber(usage.cachedContentTokenCount ?? usage.cachedTokens);
  if (!inputTokens && !outputTokens && !totalTokens) return null;

  const family = modelFamily(model);
  const effectiveInput = Math.max(0, inputTokens - cachedTokens);
  let inputPerMillion = 0;
  let outputPerMillion = 0;
  if (family === "flash-lite") {
    inputPerMillion = 0.10;
    outputPerMillion = 0.40;
  } else if (family === "flash") {
    inputPerMillion = 0.30;
    outputPerMillion = 2.50;
  } else if (family === "pro") {
    const over200k = inputTokens > 200000;
    inputPerMillion = over200k ? 2.50 : 1.25;
    outputPerMillion = over200k ? 15.00 : 10.00;
  }
  const costUsd = (effectiveInput / 1000000) * inputPerMillion + (outputTokens / 1000000) * outputPerMillion;
  return {
    date: new Date(ts).toISOString().slice(0, 10),
    ts,
    model,
    family,
    inputTokens,
    outputTokens,
    totalTokens,
    cachedTokens,
    costUsd
  };
}

function addUsage(row: UsageTotals, event: GeminiUsageEvent): void {
  row.calls += 1;
  row.inputTokens += event.inputTokens;
  row.outputTokens += event.outputTokens;
  row.totalTokens += event.totalTokens;
  row.cachedTokens += event.cachedTokens;
  row.costUsd += event.costUsd;
}

export async function recordGeminiUsage(env: Env, model: string, usage: Record<string, unknown> | undefined): Promise<void> {
  const event = buildGeminiUsageEvent(model, usage);
  if (!event) return;
  try {
    const key = `studyengine:ai-usage:${event.date}`;
    const existing = await env.WIDGET_KV.get(key, "json") as GeminiUsageDay | null;
    const day = existing && typeof existing === "object" ? existing : emptyUsageDay(event.date);
    const familyRow = day.byFamily[event.family] || emptyUsageTotals();
    addUsage(day, event);
    addUsage(familyRow, event);
    day.byFamily[event.family] = familyRow;
    day.events = [...(Array.isArray(day.events) ? day.events : []), event].slice(-200);
    await env.WIDGET_KV.put(key, JSON.stringify(day), { expirationTtl: 60 * 60 * 24 * 120 });
  } catch (err) {
    console.warn("[gemini-usage] record failed", err);
  }
}

/**
 * Calls Gemini generateContent.
 * Keep stable instructions in `systemInstruction` (best cache prefix reuse),
 * and put volatile turn-specific content in `contents`.
 */
export async function callGemini(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  generationConfig: GeminiGenerationConfig,
  env: Env,
  options?: GeminiCallOptions
): Promise<GeminiResponse> {
  const serviceTierQuery = options?.serviceTier === "flex" ? "&serviceTier=flex" : "";
  const geminiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}${serviceTierQuery}`;

  const response = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig,
      ...(options?.cachedContent ? { cachedContent: options.cachedContent } : {}),
      // Flex inference docs show REST body field `service_tier`.
      // https://ai.google.dev/gemini-api/docs/flex-inference
      ...(options?.serviceTier === "flex" ? { service_tier: "flex" } : {})
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini API error: ${detail}`);
  }

  const data = (await response.json()) as GeminiResponse;
  await recordGeminiUsage(env, model, data.usageMetadata);
  return data;
}

export function extractGeminiText(geminiData: GeminiResponse): string {
  const parts = geminiData?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return "";
  const textParts = parts.filter((part) => !part.thought && typeof part.text === "string");
  if (textParts.length === 0) {
    return "";
  }
  return textParts[textParts.length - 1]?.text ?? "";
}

export function getFinishReason(geminiData: GeminiResponse): string | undefined {
  return geminiData?.candidates?.[0]?.finishReason;
}

export function parseGeminiJson<T>(geminiData: GeminiResponse): T | null {
  const rawText = extractGeminiText(geminiData);
  return parseJsonResponse<T>(rawText);
}

/**
 * Open a streaming Gemini generation. Yields plain-text chunks as Gemini
 * emits them (JSON deltas, accumulated by caller). Fully consumes the
 * upstream SSE stream. Throws on non-2xx.
 *
 * Uses `:streamGenerateContent?alt=sse`, which returns `data: {...}\n\n`
 * lines whose payload is a partial `GeminiResponse` containing a single
 * candidates[0].content.parts[0].text slice.
 *
 * The optional `signal` is forwarded to the upstream fetch so aborting
 * the caller closes the Gemini connection (frees tokens).
 */
export async function* streamGemini(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  generationConfig: GeminiGenerationConfig,
  env: Env,
  optionsOrSignal?: GeminiCallOptions | AbortSignal,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const options = optionsOrSignal instanceof AbortSignal ? undefined : optionsOrSignal;
  const streamSignal = optionsOrSignal instanceof AbortSignal ? optionsOrSignal : signal;
  const serviceTierQuery = options?.serviceTier === "flex" ? "&serviceTier=flex" : "";
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${env.GEMINI_API_KEY}${serviceTierQuery}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig,
      ...(options?.cachedContent ? { cachedContent: options.cachedContent } : {}),
      // Flex inference docs show REST body field `service_tier`.
      // https://ai.google.dev/gemini-api/docs/flex-inference
      ...(options?.serviceTier === "flex" ? { service_tier: "flex" } : {})
    }),
    signal: streamSignal
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gemini stream error: ${response.status} ${detail}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let latestUsage: Record<string, unknown> | undefined;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events separated by blank line.
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        // Collect all `data: ...` lines (may be multi-line for one event).
        const dataLines: string[] = [];
        for (const line of rawEvent.split(/\r?\n/)) {
          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).replace(/^ /, ""));
          }
        }
        if (!dataLines.length) continue;
        const payload = dataLines.join("\n");
        if (payload === "[DONE]") return;
        try {
          const parsed = JSON.parse(payload) as GeminiResponse;
          if (parsed && typeof parsed.usageMetadata === "object") latestUsage = parsed.usageMetadata;
          const parts = parsed?.candidates?.[0]?.content?.parts;
          if (Array.isArray(parts)) {
            for (const part of parts) {
              if (part && !part.thought && typeof part.text === "string" && part.text.length) {
                yield part.text;
              }
            }
          }
        } catch {
          // Ignore malformed partial JSON; upstream will resend complete.
        }
      }
    }
    // Flush any trailing event without terminator.
    const tail = buffer.trim();
    if (tail.startsWith("data:")) {
      const payload = tail.slice(5).replace(/^ /, "");
      if (payload && payload !== "[DONE]") {
        try {
          const parsed = JSON.parse(payload) as GeminiResponse;
          if (parsed && typeof parsed.usageMetadata === "object") latestUsage = parsed.usageMetadata;
          const parts = parsed?.candidates?.[0]?.content?.parts;
          if (Array.isArray(parts)) {
            for (const part of parts) {
              if (part && !part.thought && typeof part.text === "string" && part.text.length) {
                yield part.text;
              }
            }
          }
        } catch {
          // Ignore.
        }
      }
    }
  } finally {
    await recordGeminiUsage(env, model, latestUsage);
    try { reader.releaseLock(); } catch { /* noop */ }
  }
}

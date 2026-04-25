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
  [key: string]: unknown;
}

export interface GeminiCallOptions {
  serviceTier?: "default" | "flex";
  cachedContent?: string;
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

  return (await response.json()) as GeminiResponse;
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
    try { reader.releaseLock(); } catch { /* noop */ }
  }
}

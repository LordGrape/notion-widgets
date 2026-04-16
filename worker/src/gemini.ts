import type { Env } from "./types";
import { parseJsonResponse } from "./utils/json";

export interface GeminiGenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: GeminiJsonValue;
  [key: string]: GeminiJsonValue | undefined;
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

export async function callGemini(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  generationConfig: GeminiGenerationConfig,
  env: Env
): Promise<GeminiResponse> {
  const geminiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

  const response = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        { parts: [{ text: systemPrompt }] },
        { parts: [{ text: userPrompt }] }
      ],
      generationConfig
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
  if (!Array.isArray(parts) || parts.length === 0) return "{}";
  const textParts = parts.filter((part) => !part.thought && typeof part.text === "string");
  if (textParts.length === 0) {
    const last = parts[parts.length - 1];
    return last && typeof last.text === "string" ? last.text : "{}";
  }
  return textParts[textParts.length - 1]?.text ?? "{}";
}

export function parseGeminiJson<T>(geminiData: GeminiResponse): T | null {
  const rawText = extractGeminiText(geminiData);
  return parseJsonResponse<T>(rawText);
}

import { getCorsHeaders } from "../cors";
import { extractGeminiText } from "../gemini";
import type { DistillRequest, DistillResponse, Env } from "../types";
import { parseJsonResponse } from "../utils/json";
import { hashString } from "../utils/helpers";

const DISTILL_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...DISTILL_CORS_HEADERS
    }
  });
}

interface DistillRawChunk {
  topic?: string;
  keyTerms?: unknown;
  content?: string;
}

interface DistillRawResponse {
  courseDigestUpdate?: string;
  topicChunks?: DistillRawChunk[];
  suggestedCards?: DistillResponse["suggestedCards"];
}

export async function handleDistill(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await request.json()) as DistillRequest;
    const courseName = String(body.courseName || "").trim();
    const lectureTitle = String(body.lectureTitle || "").trim();
    let rawText = String(body.rawText || "").trim();
    const existingContext = String(body.existingSyllabusContext || "").trim();

    if (!courseName || !rawText) {
      return jsonResponse({ error: "courseName and rawText required" }, 400);
    }

    if (rawText.length > 30000) rawText = rawText.slice(0, 30000);

    const distillPrompt =
      `You are processing a university lecture for a spaced repetition study engine.\n\n` +
      `COURSE: ${courseName}\n` +
      `LECTURE: ${lectureTitle || "Untitled"}\n` +
      `EXISTING COURSE CONTEXT: ${existingContext || "None yet"}\n\n` +
      `RAW LECTURE TEXT:\n${rawText}\n\n` +
      `Produce THREE outputs:\n\n` +
      `1. courseDigestUpdate: Merge this lecture's key concepts into the existing course digest. ` +
      `Max ~800 tokens. Include: theoretical frameworks, key definitions, important arguments, professor emphasis areas, and how this lecture connects to broader course themes. ` +
      `If existing context is "None yet", create a fresh digest.\n\n` +
      `2. topicChunks: Split the lecture into 3-8 topic sections. Each chunk should be self-contained and roughly 200-500 tokens. ` +
      `Include a topic label, keyTerms array, and the essential content. Topic labels should match the granularity a flashcard's "topic" field would use.\n\n` +
      `3. suggestedCards: Generate 3-5 high-quality flashcard candidates from the lecture. ` +
      `Each with: prompt (a question), modelAnswer (comprehensive answer), topic (matching a topicChunks label), and tier ("quickfire", "explain", or "apply").\n\n` +
      `Respond in EXACT JSON:\n` +
      `{\n` +
      `  "courseDigestUpdate": "Updated course digest text...",\n` +
      `  "topicChunks": [\n` +
      `    { "topic": "Topic Label", "keyTerms": ["term1", "term2"], "content": "Chunk content..." }\n` +
      `  ],\n` +
      `  "suggestedCards": [\n` +
      `    { "prompt": "Question?", "modelAnswer": "Answer...", "topic": "Topic Label", "tier": "explain" }\n` +
      `  ]\n` +
      `}`;

    const distillRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: "You process university lectures into structured context for a spaced repetition study engine. Output JSON."
              }
            ]
          },
          contents: [{ parts: [{ text: distillPrompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4096,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!distillRes.ok) {
      const errText = await distillRes.text();
      return jsonResponse({ error: "Gemini API error", detail: errText }, 502);
    }

    const distillData = (await distillRes.json()) as import("../gemini").GeminiResponse;
    const distillRaw = extractGeminiText(distillData);
    const parsed = parseJsonResponse<DistillRawResponse>(distillRaw);

    if (!parsed || typeof parsed !== "object") {
      return jsonResponse({ error: "Failed to parse distill response", raw: distillRaw }, 500);
    }

    const courseKey = courseName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const chunks = Array.isArray(parsed.topicChunks) ? parsed.topicChunks : [];
    const storedChunkKeys: Array<{ topic: string; kvKey: string }> = [];

    for (const chunk of chunks) {
      if (!chunk || !chunk.topic || !chunk.content) continue;
      const topic = String(chunk.topic);
      const topicHash = hashString(topic.toLowerCase().trim());
      const kvKey = `lectureCtx:${courseKey}:${topicHash}`;
      try {
        await env.WIDGET_KV.put(
          kvKey,
          JSON.stringify({
            topic,
            keyTerms: Array.isArray(chunk.keyTerms) ? chunk.keyTerms.slice(0, 24) : [],
            content: String(chunk.content).slice(0, 12000)
          }),
          { expirationTtl: 180 * 24 * 60 * 60 }
        );
        storedChunkKeys.push({ topic, kvKey });
      } catch (kvErr) {
        console.error(
          "KV lecture chunk write error:",
          kvErr instanceof Error ? kvErr.message : String(kvErr)
        );
      }
    }

    const manifestKey = `lectureManifest:${courseKey}`;
    let manifest: Array<{ topic?: string; kvKey?: string }> = [];
    try {
      const existing = await env.WIDGET_KV.get(manifestKey, "json");
      if (Array.isArray(existing)) manifest = existing as Array<{ topic?: string; kvKey?: string }>;
    } catch {
      // no-op
    }

    for (const sk of storedChunkKeys) {
      if (!manifest.some((m) => m && m.kvKey === sk.kvKey)) manifest.push(sk);
    }

    try {
      await env.WIDGET_KV.put(manifestKey, JSON.stringify(manifest), {
        expirationTtl: 180 * 24 * 60 * 60
      });
    } catch {
      // no-op
    }

    return jsonResponse(
      {
        courseDigestUpdate: parsed.courseDigestUpdate || "",
        topicChunks: storedChunkKeys,
        suggestedCards: Array.isArray(parsed.suggestedCards) ? parsed.suggestedCards : [],
        totalChunksStored: storedChunkKeys.length
      } satisfies DistillResponse,
      200
    );
  } catch (e) {
    return jsonResponse(
      { error: "Distill failed", detail: e instanceof Error ? e.message : String(e) },
      500
    );
  }
}

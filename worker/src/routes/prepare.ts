import { getCorsHeaders } from "../cors";
import { extractGeminiText } from "../gemini";
import type { Env, PrepareRequest } from "../types";
import { parseJsonResponse } from "../utils/json";

const PREPARE_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...PREPARE_CORS_HEADERS
    }
  });
}

export async function handlePrepare(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await request.json()) as PrepareRequest;
    const courseName = body.courseName != null ? String(body.courseName).trim() : "";
    let cards = Array.isArray(body.cards) ? body.cards : [];
    const existingCourseContext =
      body.existingCourseContext && typeof body.existingCourseContext === "object"
        ? body.existingCourseContext
        : {};

    if (!courseName || cards.length < 1) {
      return jsonResponse({ error: "courseName and cards (min 1) required" }, 400);
    }

    cards = cards.slice(0, 50);
    const sampleBlock = cards
      .map((c, i) => {
        const p = String(c.prompt != null ? c.prompt : "").substring(0, 200);
        const top = c.topic != null ? String(c.topic) : "General";
        return `${i + 1}. [${top}] ${p}`;
      })
      .join("\n");

    const prepPrompt =
      `You are analysing a batch of study cards just imported into a spaced repetition study engine.\n\n` +
      `COURSE: ${courseName}\n` +
      `NUMBER OF CARDS: ${cards.length}\n` +
      `EXISTING COURSE CONTEXT: ${existingCourseContext.syllabusContext || "None yet"}\n\n` +
      `SAMPLE CARDS (up to 50):\n${sampleBlock}\n\n` +
      `Analyse this batch and produce:\n` +
      `1. If no existing syllabusContext: infer a 2-3 sentence course scope summary from the card topics and prompts.\n` +
      `2. Identify the key topics/themes present in this batch.\n` +
      `3. Generate 1-2 initial learner observations useful for an AI tutor (e.g., "This batch is heavily weighted toward application questions" or "Cards span 6 topics — initial sessions should reveal weak areas").\n` +
      `4. A one-line summary for the user.\n\n` +
      `Respond in EXACT JSON:\n` +
      `{\n` +
      `  "syllabusContext": "2-3 sentence inferred scope, or null if existing is adequate",\n` +
      `  "keyTopics": ["topic1", "topic2"],\n` +
      `  "initialMemories": [\n` +
      `    { "type": "pattern", "content": "under 200 chars", "scope": "course", "confidence": 0.3 }\n` +
      `  ],\n` +
      `  "userSummary": "Imported X cards across Y topics. Key themes: ..."\n` +
      `}\n`;

    const prepRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: "You are analysing a batch of study cards imported into a spaced repetition study engine. Infer course scope, key topics, and initial learner observations. Respond in JSON."
              }
            ]
          },
          contents: [{ parts: [{ text: prepPrompt }] }],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 1024,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!prepRes.ok) {
      const errText = await prepRes.text();
      return jsonResponse({ error: "Gemini API error", detail: errText }, 502);
    }

    const prepData = (await prepRes.json()) as import("../gemini").GeminiResponse;
    const prepRaw = extractGeminiText(prepData);
    const parsedPrep = parseJsonResponse<Record<string, unknown>>(prepRaw);

    if (!parsedPrep || typeof parsedPrep !== "object") {
      return jsonResponse({ error: "Failed to parse prepare response" }, 500);
    }

    return jsonResponse(parsedPrep, 200);
  } catch (e) {
    return jsonResponse({ error: "Prepare failed", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
}

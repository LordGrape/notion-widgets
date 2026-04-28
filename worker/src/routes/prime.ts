import { getCorsHeaders } from "../cors";
import { extractGeminiText } from "../gemini";
import { resolveUtilityModel } from "../ai-models";
import type { Env, PrimeRequest, PrimeResponse } from "../types";
import { parseJsonResponse } from "../utils/json";

const PRIME_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...PRIME_CORS_HEADERS
    }
  });
}

export async function handlePrime(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await request.json()) as PrimeRequest;
    const courseName = body.courseName || "";
    const topicName = body.topicName || "";
    const syllabusContext = body.syllabusContext || "";
    const existingCards = Array.isArray(body.existingCards) ? body.existingCards.slice(0, 20) : [];

    if (!courseName && !topicName) {
      return jsonResponse({ error: "courseName or topicName required" }, 400);
    }

    const cardContext = existingCards
      .map((c, i) => `${i + 1}. ${String(c.prompt || "").substring(0, 100)}`)
      .join("\n");

    const primePrompt =
      `Generate 2-3 prequestions for a student about to study ${topicName || courseName}.\n\n` +
      `COURSE: ${courseName}\n` +
      `TOPIC: ${topicName}\n` +
      `COURSE SCOPE: ${syllabusContext || "Not specified"}\n\n` +
      (cardContext ? `EXISTING CARDS ON THIS TOPIC (for context, not repetition):\n${cardContext}\n\n` : "") +
      `PREQUESTION RULES:\n` +
      `- Questions should be answerable from the upcoming material but the student likely cannot answer them yet\n` +
      `- They should prime the student's attention toward KEY concepts, not trivia\n` +
      `- Mix difficulty: one factual recall, one conceptual "why" question\n` +
      `- Keep questions concise (1-2 sentences each)\n\n` +
      `Respond in EXACT JSON:\n` +
      `{\n` +
      `  "prequestions": [\n` +
      `    { "question": "...", "type": "factual" | "conceptual" | "application" }\n` +
      `  ]\n` +
      `}`;

    const model = resolveUtilityModel(env);
    const primeRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: "Generate prequestions to prime a student's encoding before they study new material. Output JSON."
              }
            ]
          },
          contents: [{ parts: [{ text: primePrompt }] }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 512,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!primeRes.ok) {
      const errText = await primeRes.text();
      return jsonResponse({ error: "Gemini API error", detail: errText }, 502);
    }

    const primeData = (await primeRes.json()) as import("../gemini").GeminiResponse;
    const primeRaw = extractGeminiText(primeData);
    const parsed = parseJsonResponse<PrimeResponse>(primeRaw);

    if (!parsed || !Array.isArray(parsed.prequestions)) {
      return jsonResponse({ prequestions: [] } satisfies PrimeResponse, 200);
    }

    return jsonResponse(parsed, 200);
  } catch (e) {
    return jsonResponse(
      { error: "Prime failed", detail: e instanceof Error ? e.message : String(e) },
      500
    );
  }
}

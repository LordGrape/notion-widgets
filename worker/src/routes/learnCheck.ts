import { getCorsHeaders } from "../cors";
import { extractGeminiText, type GeminiPart, type GeminiResponse } from "../gemini";
import type { Env, LearnCheckRequest } from "../types";
import { parseJsonResponse } from "../utils/json";

const LEARN_CHECK_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...LEARN_CHECK_CORS_HEADERS
    }
  });
}

interface LearnCheckResponse {
  verdict?: "strong" | "partial" | "weak";
  feedback?: string;
  followUp?: string | null;
  isComplete?: boolean;
}

export async function handleLearnCheck(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const body = (await request.json()) as LearnCheckRequest;
  if (!body.checkQuestion || !body.userResponse) {
    return jsonResponse({ error: "Missing checkQuestion or userResponse" }, 400);
  }

  const systemPrompt = `You are evaluating a student's response to a comprehension check during an initial learning session. The student is learning this material for the first time.

CONCEPT: ${body.concept || ""}
CHECK QUESTION: ${body.checkQuestion}
EXPECTED ANSWER: ${body.checkAnswer || ""}
STUDENT RESPONSE: ${body.userResponse}

Evaluate the response and return JSON:
{
  "verdict": "strong" | "partial" | "weak",
  "feedback": "1-2 sentences: what they got right, what's missing",
  "followUp": "If partial/weak: one Socratic question to close the gap. If strong: null",
  "isComplete": true if verdict is "strong" or no follow-up needed, false if follow-up provided
}

Rules:
- "strong": student hit the key points, even if wording differs
- "partial": core idea present but missing an important element
- "weak": fundamental misunderstanding or mostly wrong
- Feedback must cite specific claims from the student's response
- Never reveal the full answer directly — guide via questioning
- Be concise: max 3 sentences for feedback`;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1024,
          responseMimeType: "application/json"
        }
      })
    }
  );

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    return jsonResponse({ error: "Gemini API error", detail: errText }, 502);
  }

  const geminiData = (await geminiRes.json()) as GeminiResponse;
  const parts = (geminiData?.candidates?.[0]?.content?.parts || []) as GeminiPart[];
  console.log("[learn-check] Part count:", parts.length, "types:", JSON.stringify(parts.map((p) => ({ thought: !!p.thought, len: (p.text || "").length }))));

  const rawText = extractGeminiText(geminiData);
  console.log("[learn-check] extractGeminiText len:", rawText.length, "preview:", rawText.slice(0, 300));

  let parsed = parseJsonResponse<LearnCheckResponse>(rawText);

  if (!parsed || !parsed.verdict) {
    console.log("[learn-check] First parse failed, trying brute-force concatenation");
    const allText = parts
      .filter((p) => !p.thought && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("");
    console.log("[learn-check] Brute-force text len:", allText.length, "preview:", allText.slice(0, 300));
    parsed = parseJsonResponse<LearnCheckResponse>(allText);
  }

  if (!parsed || !parsed.verdict) {
    console.log("[learn-check] Brute-force failed, trying all parts including thought");
    for (const part of parts) {
      if (typeof part.text === "string" && part.text.includes('"verdict"')) {
        parsed = parseJsonResponse<LearnCheckResponse>(part.text);
        if (parsed && parsed.verdict) {
          console.log(`[learn-check] Found verdict in part with thought=${!!part.thought}`);
          break;
        }
      }
    }
  }

  console.log("[learn-check] Final result:", parsed ? `verdict=${parsed.verdict || "none"}` : "NULL");

  return jsonResponse(parsed || { verdict: "partial", feedback: "Could not evaluate.", isComplete: true }, 200);
}

import { getCorsHeaders } from "../cors";
import { extractGeminiText } from "../gemini";
import { resolveUtilityModel } from "../ai-models";
import type { Env, ReformulateRequest } from "../types";
import { parseJsonResponse } from "../utils/json";

const REFORMULATE_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...REFORMULATE_CORS_HEADERS
    }
  });
}

interface ReformulateResponse {
  reformulatedPrompt?: string;
  reformulatedTier?: "quickfire" | "explain" | "apply" | "distinguish";
  rationale?: string;
}

export async function handleReformulate(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await request.json()) as ReformulateRequest;
    const originalPrompt = String(body.originalPrompt || "").trim();
    const modelAnswer = String(body.modelAnswer || "").trim();
    const tier = String(body.tier || "explain");
    const course = String(body.course || "");
    const topic = String(body.topic || "");
    const lapses = Number(body.lapses) || 3;
    const diagnosisHistory = Array.isArray(body.diagnosisHistory) ? body.diagnosisHistory.slice(-5) : [];

    if (!originalPrompt || !modelAnswer) {
      return jsonResponse({ error: "originalPrompt and modelAnswer required" }, 400);
    }

    let diagnosisBlock = "";
    if (diagnosisHistory.length > 0) {
      const typeCounts: Record<string, number> = {};
      for (const d of diagnosisHistory) {
        if (d && d.type) typeCounts[d.type] = (typeCounts[d.type] || 0) + 1;
      }
      const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];
      if (topType) {
        diagnosisBlock = `\nThe student's most common error type on this card is "${topType[0]}" (${topType[1]} of ${diagnosisHistory.length} attempts).` +
          "Design the reformulated prompt to specifically target this error pattern.\n";
      }
    }

    const reformulatePrompt =
      `A student has failed this study card ${lapses} times. The same prompt keeps triggering the same failed retrieval.` +
      `Your job is to create an ALTERNATIVE prompt that tests the SAME knowledge from a DIFFERENT angle.\n\n` +
      `ORIGINAL PROMPT: ${originalPrompt}\n` +
      `MODEL ANSWER: ${modelAnswer}\n` +
      `CURRENT TIER: ${tier}\n` +
      `COURSE: ${course}\n` +
      `TOPIC: ${topic}\n` +
      diagnosisBlock +
      `\nRULES:\n` +
      `1. The reformulated prompt MUST test the same core knowledge as the original.\n` +
      `2. The model answer should remain substantially the same (the student needs to recall the same information).\n` +
      `3. Change the ANGLE of approach. Examples:\n` +
      `- If original asks "What is X?", reformulate as "Why does X matter for Y?" or "Compare X to Z"\n` +
      `- If original asks for a definition, reformulate as an application scenario\n` +
      `- If original asks "Explain X", reformulate as "A student says [common misconception]. What's wrong with this?"\n` +
      `- If original is a comparison, reformulate as "Given [scenario], which concept applies and why?"\n` +
      `4. The reformulated prompt should be approximately the same length as the original.\n` +
      `5. Do NOT make it easier. The goal is a different retrieval pathway, not a lower bar.\n` +
      `6. If the original has a task or scenario field, generate a new scenario that tests the same principle.\n\n` +
      `Respond in EXACT JSON:\n` +
      `{\n` +
      `  "reformulatedPrompt": "The new prompt text",\n` +
      `  "reformulatedTier": "The suggested tier for this reformulation (quickfire|explain|apply|distinguish)",\n` +
      `  "rationale": "One sentence explaining what angle you changed and why"\n` +
      `}`;

    const model = resolveUtilityModel(env);
    const refRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: "You are a study card designer. You reformulate failed flashcard prompts to create alternative retrieval pathways while testing the same knowledge. Output JSON."
              }
            ]
          },
          contents: [{ parts: [{ text: reformulatePrompt }] }],
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 512,
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                reformulatedPrompt: { type: "string" },
                reformulatedTier: {
                  type: "string",
                  enum: ["quickfire", "explain", "apply", "distinguish"]
                },
                rationale: { type: "string" }
              },
              required: ["reformulatedPrompt", "reformulatedTier", "rationale"]
            }
          }
        })
      }
    );

    if (!refRes.ok) {
      const errText = await refRes.text();
      return jsonResponse({ error: "Gemini API error", detail: errText }, 502);
    }

    const refData = (await refRes.json()) as import("../gemini").GeminiResponse;
    const refRaw = extractGeminiText(refData);
    const parsedRef = parseJsonResponse<ReformulateResponse>(refRaw);

    if (!parsedRef || !parsedRef.reformulatedPrompt) {
      return jsonResponse({ error: "Failed to parse reformulation" }, 500);
    }

    return jsonResponse(parsedRef, 200);
  } catch (e) {
    return jsonResponse({ error: "Reformulate failed", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
}

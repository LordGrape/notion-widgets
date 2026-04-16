import { getCorsHeaders } from "../cors";
import { extractGeminiText, type GeminiPart, type GeminiResponse } from "../gemini";
import type { Env, LearnRequest, LearnResponse } from "../types";
import { parseJsonResponse } from "../utils/json";
import { buildFallbackLearnPlan } from "../utils/helpers";

const LEARN_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...LEARN_CORS_HEADERS
    }
  });
}

function hasSegments(input: unknown): input is LearnResponse {
  return !!input && typeof input === "object" && Array.isArray((input as LearnResponse).segments) && (input as LearnResponse).segments.length > 0;
}

export async function handleLearn(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: LearnRequest | null = null;

  try {
    body = (await request.json()) as LearnRequest;

    if (!body.course || !body.topics || !body.topics.length || !body.cards || !body.cards.length) {
      return jsonResponse({ error: "Missing required fields: course, topics, cards" }, 400);
    }

    const cardSummaries = body.cards
      .slice(0, 20)
      .map((c) => `PROMPT: ${c.prompt}\nANSWER: ${c.modelAnswer}`)
      .join("\n---\n");
    const syllabusCtx = body.courseContext && body.courseContext.syllabusContext ? body.courseContext.syllabusContext : "";
    const profValues = body.courseContext && body.courseContext.professorValues ? body.courseContext.professorValues : "";

    const systemPrompt = `You are designing a teaching sequence for a university student who has NOT yet learned this material. Build understanding from the ground up, one concept at a time.

COURSE: ${body.course}
TOPICS: ${body.topics.join(", ")}
${syllabusCtx ? `SYLLABUS CONTEXT: ${syllabusCtx}` : ""}
${profValues ? `PROFESSOR VALUES: ${profValues}` : ""}

CARDS TO TEACH FROM:
${cardSummaries}

RULES:
- Order concepts from foundational to complex (prerequisite logic)
- Each segment teaches ONE concept — never more
- Explanations: 2-4 sentences, precise academic language, no filler
- Elaborations: concrete example, analogy, or connection to prior knowledge
- Check questions must force the student to PRODUCE, never just recognise
- Two check types: "elaborative" (explain in own words) or "predict" (predict what happens next)
- Consolidation questions should span all segments and test recall + connections
- Use the card model answers as content backbone — do not contradict them
- If cards are insufficient, supplement from your knowledge grounded in the course context
- Never reuse phrasing from card prompts in check questions (avoid pattern matching)
- linkedCardIds should reference the "id" field of relevant input cards

Return JSON with this exact structure:
{
  "segments": [
    {
      "id": "seg-1",
      "concept": "Concept Title",
      "explanation": "2-4 sentence explanation",
      "elaboration": "Concrete example or analogy",
      "checkType": "elaborative" or "predict",
      "checkQuestion": "Question forcing student to produce",
      "checkAnswer": "Expected answer",
      "linkedCardIds": ["card-id-1"]
    }
  ],
  "consolidationQuestions": [
    {
      "question": "Retrieval question spanning segments",
      "answer": "Expected answer",
      "linkedCardIds": ["card-id-1"]
    }
  ]
}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
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
    console.log("[learn-plan] Part count:", parts.length, "types:", JSON.stringify(parts.map((p) => ({ thought: !!p.thought, len: (p.text || "").length }))));

    const rawText = extractGeminiText(geminiData);
    console.log("[learn-plan] extractGeminiText len:", rawText.length, "preview:", rawText.slice(0, 300));

    let parsed = parseJsonResponse<LearnResponse>(rawText);

    if (!hasSegments(parsed)) {
      console.log("[learn-plan] First parse failed, trying brute-force concatenation");
      const allText = parts
        .filter((p) => !p.thought && typeof p.text === "string")
        .map((p) => p.text as string)
        .join("");
      console.log("[learn-plan] Brute-force text len:", allText.length, "preview:", allText.slice(0, 300));
      parsed = parseJsonResponse<LearnResponse>(allText);
    }

    if (!hasSegments(parsed)) {
      console.log("[learn-plan] Brute-force failed, trying all parts including thought");
      for (const part of parts) {
        if (typeof part.text === "string" && part.text.includes('"segments"')) {
          const attempt = parseJsonResponse<LearnResponse>(part.text);
          if (hasSegments(attempt)) {
            parsed = attempt;
            console.log("[learn-plan] Found segments in part with thought=" + !!part.thought);
            break;
          }
        }
      }
    }

    if (!hasSegments(parsed)) {
      parsed = buildFallbackLearnPlan(body);
    }

    if (!hasSegments(parsed)) {
      parsed = buildFallbackLearnPlan(body);
    }

    console.log("[learn-plan] Final result: segments=", parsed.segments.length);

    return jsonResponse(parsed, 200);
  } catch (e) {
    console.error("[learn-plan] Error:", e instanceof Error ? e.message : String(e));
    const fallback = buildFallbackLearnPlan((body || {}) as LearnRequest);
    return jsonResponse(fallback, 200);
  }
}

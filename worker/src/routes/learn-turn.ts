import { getCorsHeaders } from "../cors";
import { callGemini, extractGeminiText } from "../gemini";
import { parseJsonResponse } from "../utils/json";
import type { Env, LearnTurnRequest, LearnTurnResponse } from "../types";

const LEARN_TURN_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const TURN_MODEL = "gemini-2.5-flash";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...LEARN_TURN_CORS_HEADERS
    }
  });
}

function validateRequest(body: LearnTurnRequest): string | null {
  if (!body || typeof body !== "object") return "Invalid JSON body";
  if (!body.segment || typeof body.segment !== "object") return "Missing segment";
  if (!body.segment.tutorPrompt) return "Missing segment.tutorPrompt";
  if (!body.mechanism) return "Missing mechanism";
  return null;
}

function buildPrompts(body: LearnTurnRequest): { system: string; user: string } {
  const system = [
    "You are running a first-exposure learning turn.",
    "Mechanisms: worked_example, elaborative_interrogation, self_explanation, predictive_question, test_closure.",
    "Respond in concise Canadian English.",
    "Return JSON only."
  ].join("\n");

  const user = [
    `MECHANISM: ${body.mechanism}`,
    `SEGMENT_TITLE: ${body.segment.title || ""}`,
    `OBJECTIVE: ${body.segment.objective || ""}`,
    `TUTOR_PROMPT: ${body.segment.tutorPrompt || ""}`,
    `EXPECTED_ANSWER: ${body.segment.expectedAnswer || ""}`,
    `STUDENT_INPUT: ${body.userInput || ""}`,
    `USER_NAME: ${body.userName || "student"}`,
    "",
    "Return schema:",
    "{",
    '  "feedback": "1-3 short paragraphs",',
    '  "nextPrompt": "short follow-up prompt",',
    '  "isSegmentComplete": true or false,',
    '  "suggestedStatus": "taught" or "consolidated" or null',
    "}"
  ].join("\n");

  return { system, user };
}

function logUsage(tag: string, model: string, response: Record<string, unknown>): void {
  const usage = (response && typeof response === "object") ? (response.usageMetadata as Record<string, unknown> | undefined) : undefined;
  console.log(`[${tag}] model=${model} usage=${JSON.stringify(usage || {})}`);
}

export async function handleLearnTurn(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = (await request.json()) as LearnTurnRequest;
    const validationError = validateRequest(body);
    if (validationError) return jsonResponse({ error: validationError }, 400);

    const { system, user } = buildPrompts(body);
    const responseSchema = {
      type: "object",
      properties: {
        feedback: { type: "string" },
        nextPrompt: { type: "string" },
        isSegmentComplete: { type: "boolean" },
        suggestedStatus: { type: "string", nullable: true }
      },
      required: ["feedback", "nextPrompt", "isSegmentComplete"]
    };

    const geminiData = await callGemini(
      TURN_MODEL,
      system,
      user,
      {
        temperature: 0.35,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
        responseSchema
      },
      env
    );
    logUsage("learn-turn", TURN_MODEL, geminiData as unknown as Record<string, unknown>);

    const raw = extractGeminiText(geminiData);
    const parsed = parseJsonResponse<LearnTurnResponse>(raw);
    if (!parsed || !parsed.feedback) {
      return jsonResponse({ error: "learn_turn_parse_failed" }, 502);
    }
    return jsonResponse(parsed, 200);
  } catch (error) {
    console.error("[learn-turn] error", error);
    return jsonResponse({ error: "learn_turn_failed", detail: error instanceof Error ? error.message : String(error) }, 500);
  }
}

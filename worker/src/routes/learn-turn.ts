import { getCorsHeaders } from "../cors";
import { callGemini, extractGeminiText } from "../gemini";
import { parseJsonResponse } from "../utils/json";
import type { Env, LearnTurnRequest, LearnTurnResponse } from "../types";

const LEARN_TURN_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const TURN_MODEL = "gemini-2.5-flash";

const LEARN_GATE_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "is", "are", "was", "were", "be", "been", "being",
  "in", "on", "at", "to", "of", "for", "with", "by", "from", "as", "that", "this", "these", "those",
  "it", "its", "which", "who", "whom", "whose", "what", "when", "where", "why", "how"
]);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...LEARN_TURN_CORS_HEADERS
    }
  });
}

function tokenizeForLearnGate(input: string): string[] {
  return String(input || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !LEARN_GATE_STOPWORDS.has(token));
}

function computeCopyRatio(sourceText: string, targetText: string): number {
  const sourceTokens = Array.from(new Set(tokenizeForLearnGate(sourceText)));
  const targetTokens = Array.from(new Set(tokenizeForLearnGate(targetText)));
  if (sourceTokens.length === 0) return 1;
  const targetSet = new Set(targetTokens);
  const overlap = sourceTokens.filter((token) => targetSet.has(token)).length;
  return overlap / sourceTokens.length;
}

function validateRequest(body: LearnTurnRequest): string | null {
  if (!body || typeof body !== "object") return "Invalid JSON body";
  if (!body.segment || typeof body.segment !== "object") return "Missing segment";
  if (!body.segment.tutorPrompt) return "Missing segment.tutorPrompt";
  if (!body.segment.teach) return "Missing segment.teach";
  if (!body.mechanism) return "Missing mechanism";
  return null;
}

function buildPrompts(body: LearnTurnRequest): { system: string; user: string } {
  const system = [
    "You are grading a first-exposure Learn mode response during encoding.",
    "The teach block remains visible for novice support, but copying it must not pass.",
    "Ground your judgement in the learner text, teach block, and expected answer.",
    "Return JSON only.",
    "Verdict definitions:",
    "- surface: response is substantially a paraphrase or direct lift of teach tokens with no added reasoning.",
    "- partial: response paraphrases teach but adds at least one causal connector, inference step, or application not stated in teach.",
    "- deep: response constructs a mechanism, predicts a downstream consequence, applies the concept to a novel case, or explains WHY in terms not present in teach.",
    "Set advance=true only if verdict is deep, or verdict is partial and missingConcepts is empty.",
    "When advance=false, followUp must be exactly one specific Socratic question targeting the gap. Not generic. Not multi-part.",
    "feedback must reference something the learner actually wrote.",
    "Use concise Canadian English."
  ].join("\n");

  const user = [
    `MECHANISM: ${body.mechanism}`,
    `SEGMENT_TITLE: ${body.segment.title || ""}`,
    `OBJECTIVE: ${body.segment.objective || ""}`,
    `TEACH: ${body.segment.teach || ""}`,
    `TUTOR_PROMPT: ${body.segment.tutorPrompt || ""}`,
    `EXPECTED_ANSWER: ${body.segment.expectedAnswer || ""}`,
    `STUDENT_INPUT: ${body.userInput || ""}`,
    `USER_NAME: ${body.userName || "student"}`,
    "",
    "Return schema:",
    "{",
    '  "verdict": "surface" | "partial" | "deep",',
    '  "understandingScore": 0-100 number,',
    '  "copyRatio": 0-1 number,',
    '  "missingConcepts": ["named concept"],',
    '  "feedback": "1-2 sentences tied to learner text",',
    '  "followUp": "single Socratic question" or null,',
    '  "advance": true or false',
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
        verdict: { type: "string", enum: ["surface", "partial", "deep"] },
        understandingScore: { type: "number", minimum: 0, maximum: 100 },
        copyRatio: { type: "number", minimum: 0, maximum: 1 },
        missingConcepts: { type: "array", items: { type: "string" } },
        feedback: { type: "string" },
        followUp: { type: "string", nullable: true },
        advance: { type: "boolean" }
      },
      required: ["verdict", "understandingScore", "copyRatio", "missingConcepts", "feedback", "followUp", "advance"]
    };

    const geminiData = await callGemini(
      TURN_MODEL,
      system,
      user,
      {
        temperature: 0.25,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
        responseSchema
      },
      env
    );
    logUsage("learn-turn", TURN_MODEL, geminiData as unknown as Record<string, unknown>);

    const raw = extractGeminiText(geminiData);
    const parsed = parseJsonResponse<LearnTurnResponse>(raw);
    if (!parsed || typeof parsed.feedback !== "string") {
      return jsonResponse({ error: "learn_turn_parse_failed" }, 502);
    }

    const serverCopyRatio = computeCopyRatio(body.userInput || "", body.segment.teach || "");
    parsed.copyRatio = serverCopyRatio;
    const missingConcepts = Array.isArray(parsed.missingConcepts) ? parsed.missingConcepts : [];
    parsed.missingConcepts = missingConcepts;
    parsed.advance = parsed.verdict === "deep" || (parsed.verdict === "partial" && missingConcepts.length === 0);

    if (serverCopyRatio > 0.7) {
      parsed.verdict = "surface";
      parsed.advance = false;
      parsed.followUp = "That response reads as a paraphrase of the teach. Close or look away from the teach block and answer again in your own words, focusing on WHY rather than WHAT.";
    }

    return jsonResponse(parsed, 200);
  } catch (error) {
    console.error("[learn-turn] error", error);
    return jsonResponse({ error: "learn_turn_failed", detail: error instanceof Error ? error.message : String(error) }, 500);
  }
}

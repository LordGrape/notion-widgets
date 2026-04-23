import { getCorsHeaders } from "../cors";
import { callGemini, extractGeminiText, type GeminiGenerationConfig } from "../gemini";
import { parseJsonResponse } from "../utils/json";
import type {
  Env,
  LearnTurnErrorCode,
  LearnTurnFailure,
  LearnTurnRequest,
  LearnTurnResponse,
  LearnTurnSuccess
} from "../types";

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

/** Shape of a successfully-parsed Gemini turn body, before the envelope wrap. */
type LearnTurnPayload = Omit<LearnTurnSuccess, "ok">;

const UPSTREAM_FAILED_MESSAGE = "The Learn Mode service is temporarily unavailable. Please retry.";
const SCHEMA_INVALID_MESSAGE = "The Learn Mode service returned an unexpected response. Please retry.";
const INTERNAL_ERROR_MESSAGE = "Learn Mode hit an internal error. Please retry.";

/**
 * Copy shown as `followUp` when the copyRatio > 0.7 backstop force-demotes
 * the turn to "surface". Extracted so the skip branch added below references
 * the same literal the original backstop did; no drift possible if the copy
 * is tweaked later.
 */
const SURFACE_COPY_FOLLOWUP =
  "That response reads as a paraphrase of the teach. Close or look away from the teach block and answer again in your own words, focusing on WHY rather than WHAT.";

/**
 * Mirror of BANNED_TUTOR_PROMPT_RECALL_PATTERNS in worker/src/routes/learn-plan.ts.
 * Kept in sync intentionally as a duplicate to avoid cross-route imports.
 * When modifying, update both files.
 */
const BANNED_TUTOR_PROMPT_RECALL_PATTERNS: readonly RegExp[] = [
  /^(on\s+)?what\s+(date|year|month|day)\b/i,
  /^when\s+(was|were|did|is|are)\b/i,
  /^who\s+(was|is|were|are|led|founded|commanded|signed|wrote|built)\b/i,
  /^where\s+(was|is|were|are)\b/i,
  /^which\s+\w+\s+(was|is|were|are|led|founded|commanded)\b/i,
  /^what\s+(is|was|are|were)\s+the\s+(name|date|year|title|location|role|number)\b/i,
  /^what\s+(is|was)\s+\w+'s\s+(name|date|year|title|location|role)\b/i,
  /^how\s+many\b/i,
  /^name\s+(the|a|an|one|two|three|all)\b/i,
  /^list\s+(the|a|an|one|two|three|all)\b/i,
  /^identify\s+(the|a|an|one|two|three|all)\b/i
] as const;

const LEARNER_RESPONSE_MAX_SHORT_TOKENS = 8;
const UNDERSTANDING_SCORE_TRUST_FLOOR = 80;

/**
 * Returns true when the tutor prompt matches one of the banned recall
 * patterns. Mirrors the stripping logic in verifySegmentTutorPrompt so a
 * prompt prefixed with markdown / quote chars still matches.
 */
function tutorPromptMatchesRecallPattern(tutorPrompt: string): boolean {
  const stripped = String(tutorPrompt || "").trim().replace(/^[\s>#*_\-`]+/, "");
  return BANNED_TUTOR_PROMPT_RECALL_PATTERNS.some((re) => re.test(stripped));
}

/**
 * Append a subtle note to Gemini's feedback telling the learner that deeper
 * probing is coming. Used only on the backstop-skip path. Keeps the feedback
 * tidy: strips trailing whitespace and collapses any double-full-stop that
 * would arise from Gemini terminating with a period already.
 */
function appendDeeperProbeNote(feedback: string): string {
  const base = String(feedback || "").trim().replace(/\s+$/g, "");
  const separator = /[.!?]$/.test(base) ? "" : ".";
  const joined = `${base}${separator} The next question on this topic will probe understanding more deeply.`;
  return joined.replace(/\s{2,}/g, " ").trim();
}

function failureEnvelope(errorCode: LearnTurnErrorCode, message: string): LearnTurnFailure {
  return { ok: false, errorCode, message };
}

function successEnvelope(payload: LearnTurnPayload): LearnTurnSuccess {
  return { ok: true, ...payload };
}

const LEARN_TURN_RESPONSE_SCHEMA = {
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
} as const;

function buildGenerationConfig(maxOutputTokens: number): GeminiGenerationConfig {
  return {
    temperature: 0.25,
    maxOutputTokens,
    responseMimeType: "application/json",
    responseSchema: LEARN_TURN_RESPONSE_SCHEMA as unknown as GeminiGenerationConfig["responseSchema"]
  };
}

/**
 * Call Gemini once and attempt to parse a valid LearnTurnPayload. Returns null
 * on any failure (upstream throw, empty body, parse miss, or missing required
 * `feedback` string). Logs a truncated raw-body preview for debuggability.
 *
 * Caller owns the retry policy. Upstream-throw is distinguished from
 * parse-failure by the `outcome` return field so the route can branch on
 * errorCode.
 */
async function tryGradeTurn(
  system: string,
  user: string,
  maxOutputTokens: number,
  env: Env,
  attempt: number
): Promise<
  | { outcome: "ok"; payload: LearnTurnPayload }
  | { outcome: "upstream_failed"; detail: string }
  | { outcome: "schema_invalid"; detail: string }
> {
  let geminiData;
  try {
    geminiData = await callGemini(TURN_MODEL, system, user, buildGenerationConfig(maxOutputTokens), env);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`[learn-turn] upstream attempt=${attempt} maxTokens=${maxOutputTokens} failed: ${detail}`);
    return { outcome: "upstream_failed", detail };
  }
  logUsage("learn-turn", TURN_MODEL, geminiData as unknown as Record<string, unknown>);

  const raw = extractGeminiText(geminiData);
  const parsed = parseJsonResponse<LearnTurnPayload>(raw);
  if (!parsed || typeof parsed.feedback !== "string") {
    const preview = typeof raw === "string" ? raw.slice(0, 400) : "";
    console.warn(`[learn-turn] schema attempt=${attempt} maxTokens=${maxOutputTokens} parse failed; rawPreview=${JSON.stringify(preview)}`);
    return { outcome: "schema_invalid", detail: preview };
  }
  return { outcome: "ok", payload: parsed };
}

export async function handleLearnTurn(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = (await request.json()) as LearnTurnRequest;
    const validationError = validateRequest(body);
    if (validationError) return jsonResponse({ error: validationError }, 400);

    const { system, user } = buildPrompts(body);

    // First attempt at the historical token budget. On schema_invalid the most
    // frequent root cause is the 1024-token cap truncating the JSON mid-value
    // for long learner responses, so the retry doubles the budget. Upstream
    // throws also get one retry (Gemini transient 5xx / network blips).
    let attempt1 = await tryGradeTurn(system, user, 1024, env, 1);
    let payload: LearnTurnPayload | null = attempt1.outcome === "ok" ? attempt1.payload : null;
    let lastFailure: "upstream_failed" | "schema_invalid" | null =
      attempt1.outcome === "ok" ? null : attempt1.outcome;

    if (!payload) {
      const retryMaxTokens = attempt1.outcome === "schema_invalid" ? 2048 : 1024;
      const attempt2 = await tryGradeTurn(system, user, retryMaxTokens, env, 2);
      if (attempt2.outcome === "ok") {
        payload = attempt2.payload;
        lastFailure = null;
      } else {
        lastFailure = attempt2.outcome;
      }
    }

    if (!payload) {
      const code: LearnTurnErrorCode = lastFailure ?? "schema_invalid";
      const message = code === "upstream_failed" ? UPSTREAM_FAILED_MESSAGE : SCHEMA_INVALID_MESSAGE;
      return jsonResponse(failureEnvelope(code, message), 200);
    }

    // Server-side backstops — MUST run after regeneration too (17:54 depth-graded
    // schema invariant). copyRatio > 0.7 force-demotes to surface regardless of
    // what Gemini said.
    const serverCopyRatio = computeCopyRatio(body.userInput || "", body.segment.teach || "");
    payload.copyRatio = serverCopyRatio;
    const missingConcepts = Array.isArray(payload.missingConcepts) ? payload.missingConcepts : [];
    payload.missingConcepts = missingConcepts;
    payload.advance = payload.verdict === "deep" || (payload.verdict === "partial" && missingConcepts.length === 0);

    if (serverCopyRatio > 0.7) {
      const tokenCount = tokenizeForLearnGate(body.userInput || "").length;
      const isShortResponse = tokenCount <= LEARNER_RESPONSE_MAX_SHORT_TOKENS;
      const geminiGradedHigh =
        (payload.verdict === "partial" || payload.verdict === "deep")
        && typeof payload.understandingScore === "number"
        && payload.understandingScore >= UNDERSTANDING_SCORE_TRUST_FLOOR;
      const questionIsBannedRecall = tutorPromptMatchesRecallPattern(body.segment.tutorPrompt || "");
      const shouldSkipBackstop = questionIsBannedRecall && isShortResponse && geminiGradedHigh;

      if (shouldSkipBackstop) {
        // Planner shipped a banned recall question (fix A's validator missed
        // it, or this is a cached plan from before fix A shipped). Trust
        // Gemini's grade, advance the learner, append a subtle note that
        // deeper probing is coming.
        payload.advance =
          payload.verdict === "deep"
          || (payload.verdict === "partial" && missingConcepts.length === 0);
        payload.feedback = appendDeeperProbeNote(payload.feedback);
        console.info(
          `[learn-turn] backstop skipped: planner recall-violation; verdict=${payload.verdict} score=${payload.understandingScore} tokens=${tokenCount}`
        );
      } else {
        payload.verdict = "surface";
        payload.advance = false;
        payload.followUp = SURFACE_COPY_FOLLOWUP;
      }
    }

    const response: LearnTurnResponse = successEnvelope(payload);
    return jsonResponse(response, 200);
  } catch (error) {
    console.error("[learn-turn] internal error", error);
    const detail = error instanceof Error ? error.message : String(error);
    return jsonResponse(failureEnvelope("internal_error", `${INTERNAL_ERROR_MESSAGE} (${detail})`), 200);
  }
}

import { getCorsHeaders } from "../cors";
import { callGemini, extractGeminiText } from "../gemini";
import type { Env, LearnPlanRequest, LearnPlanResponse, LearnPlanSegment, StudyCardInput } from "../types";
import { parseJsonResponse } from "../utils/json";

const LEARN_PLAN_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const PLAN_MODEL = "gemini-2.5-pro";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...LEARN_PLAN_CORS_HEADERS
    }
  });
}

function normalizeText(input: string): string {
  return String(input || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function textHasAnchor(cardText: string, anchor: string): boolean {
  const hay = normalizeText(cardText);
  const needle = normalizeText(anchor);
  if (!needle || needle.length < 10) return false;
  return hay.includes(needle);
}

function collectCardCorpus(cards: StudyCardInput[]): Record<string, string> {
  const map: Record<string, string> = {};
  cards.forEach((card, idx) => {
    const key = String(card.id || `card-${idx + 1}`);
    map[key] = `PROMPT: ${String(card.prompt || "")}\nANSWER: ${String(card.modelAnswer || "")}`;
  });
  return map;
}

function verifySegmentGrounding(segment: LearnPlanSegment, corpus: Record<string, string>): boolean {
  if (!Array.isArray(segment.groundingSnippets) || segment.groundingSnippets.length === 0) return false;
  for (const snippet of segment.groundingSnippets) {
    if (!snippet || typeof snippet !== "object") return false;
    const cardId = String(snippet.cardId || "");
    const quote = String(snippet.quote || "");
    if (!cardId || !quote) return false;
    const source = corpus[cardId];
    if (!source) return false;
    if (!textHasAnchor(source, quote)) return false;
  }
  return true;
}

function filterVerifiedSegments(segments: LearnPlanSegment[], corpus: Record<string, string>): LearnPlanSegment[] {
  return (segments || []).filter((seg) => verifySegmentGrounding(seg, corpus));
}

function buildDensityFallback(cards: StudyCardInput[]): LearnPlanResponse {
  const maxCards = cards.slice(0, 5);
  const segments = maxCards.map((card, idx) => {
    const prompt = String(card.prompt || "").trim();
    const answer = String(card.modelAnswer || "").trim();
    return {
      id: `fallback-${idx + 1}`,
      title: prompt ? prompt.slice(0, 80) : `Card ${idx + 1}`,
      mechanism: "worked_example",
      objective: "Ground first exposure using this card's core content.",
      tutorPrompt: `Let's encode this card from first principles. What is the core claim in your own words?`,
      expectedAnswer: answer || "",
      linkedCardIds: [String(card.id || `card-${idx + 1}`)],
      groundingSnippets: [
        {
          cardId: String(card.id || `card-${idx + 1}`),
          quote: (answer || prompt || "").slice(0, 160)
        }
      ]
    } as LearnPlanSegment;
  });
  return { segments, planMode: "card_density_fallback" };
}

function validateRequest(body: LearnPlanRequest): string | null {
  if (!body || typeof body !== "object") return "Invalid JSON body";
  if (!body.course || !body.subDeck) return "Missing required fields: course, subDeck";
  if (!Array.isArray(body.cards) || body.cards.length < 1) return "Missing required field: cards";
  const malformed = body.cards.some((card) => !card || !String(card.prompt || "").trim() || !String(card.modelAnswer || "").trim());
  if (malformed) return "Malformed cards: each card must include prompt and modelAnswer";
  return null;
}

function buildSystemPrompt(): string {
  return [
    "You generate a grounded first-exposure learning plan for one sub-deck.",
    "Return JSON only.",
    "Use only content from provided cards.",
    "Each segment must include groundingSnippets with exact substrings copied from card prompt/modelAnswer.",
    "Use mechanisms from: worked_example, elaborative_interrogation, self_explanation, predictive_question, test_closure.",
    "At least 2 segments unless card count is 1.",
    "No markdown."
  ].join("\n");
}

function buildUserPrompt(body: LearnPlanRequest): string {
  const cardsBlock = body.cards.map((card, idx) => {
    const id = String(card.id || `card-${idx + 1}`);
    return `CARD_ID: ${id}\nPROMPT: ${String(card.prompt || "")}\nMODEL_ANSWER: ${String(card.modelAnswer || "")}`;
  }).join("\n\n---\n\n");

  return [
    `COURSE: ${body.course}`,
    `SUB_DECK: ${body.subDeck}`,
    `USER_NAME: ${body.userName || "student"}`,
    `LEARNER_CONTEXT: ${body.learnerContext || ""}`,
    "",
    "CARDS:",
    cardsBlock,
    "",
    "Return this schema:",
    "{",
    '  "segments": [',
    "    {",
    '      "id": "seg-1",',
    '      "title": "...",',
    '      "mechanism": "worked_example",',
    '      "objective": "...",',
    '      "tutorPrompt": "...",',
    '      "expectedAnswer": "...",',
    '      "linkedCardIds": ["card-id"],',
    '      "groundingSnippets": [{ "cardId": "card-id", "quote": "exact substring" }]',
    "    }",
    "  ]",
    "}"
  ].join("\n");
}

function logUsage(tag: string, model: string, response: Record<string, unknown>): void {
  const usage = (response && typeof response === "object") ? (response.usageMetadata as Record<string, unknown> | undefined) : undefined;
  console.log(`[${tag}] model=${model} usage=${JSON.stringify(usage || {})}`);
}

async function requestPlan(body: LearnPlanRequest, env: Env): Promise<LearnPlanResponse | null> {
  const responseSchema = {
    type: "object",
    properties: {
      segments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            mechanism: { type: "string" },
            objective: { type: "string" },
            tutorPrompt: { type: "string" },
            expectedAnswer: { type: "string" },
            linkedCardIds: { type: "array", items: { type: "string" } },
            groundingSnippets: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  cardId: { type: "string" },
                  quote: { type: "string" }
                },
                required: ["cardId", "quote"]
              }
            }
          },
          required: ["id", "title", "mechanism", "objective", "tutorPrompt", "expectedAnswer", "linkedCardIds", "groundingSnippets"]
        }
      }
    },
    required: ["segments"]
  };

  const geminiData = await callGemini(
    PLAN_MODEL,
    buildSystemPrompt(),
    buildUserPrompt(body),
    {
      temperature: 0.3,
      maxOutputTokens: 2560,
      responseMimeType: "application/json",
      responseSchema,
      thinkingConfig: { thinkingBudget: 512 }
    },
    env
  );

  logUsage("learn-plan", PLAN_MODEL, geminiData as unknown as Record<string, unknown>);
  const raw = extractGeminiText(geminiData);
  return parseJsonResponse<LearnPlanResponse>(raw);
}

export async function handleLearnPlan(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = (await request.json()) as LearnPlanRequest;
    const validationError = validateRequest(body);
    if (validationError) return jsonResponse({ error: validationError }, 400);

    const cardCorpus = collectCardCorpus(body.cards);

    const firstAttempt = await requestPlan(body, env);
    const verifiedFirst = filterVerifiedSegments(firstAttempt?.segments || [], cardCorpus);
    if (verifiedFirst.length >= 2) {
      return jsonResponse({ segments: verifiedFirst, planMode: "verified" }, 200);
    }

    console.warn("[learn-plan] first attempt failed grounding threshold", {
      requested: (firstAttempt?.segments || []).length,
      verified: verifiedFirst.length
    });

    const secondAttempt = await requestPlan(body, env);
    const verifiedSecond = filterVerifiedSegments(secondAttempt?.segments || [], cardCorpus);
    if (verifiedSecond.length >= 2) {
      return jsonResponse({ segments: verifiedSecond, planMode: "retry_verified" }, 200);
    }

    console.warn("[learn-plan] retry failed, using card-density fallback", {
      requested: (secondAttempt?.segments || []).length,
      verified: verifiedSecond.length
    });

    const fallback = buildDensityFallback(body.cards);
    return jsonResponse({ ...fallback, warning: "Grounding verification failed. Used card-density fallback." }, 200);
  } catch (error) {
    console.error("[learn-plan] error", error);
    return jsonResponse({ error: "learn_plan_failed", detail: error instanceof Error ? error.message : String(error) }, 500);
  }
}

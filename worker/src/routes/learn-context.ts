import { getCorsHeaders } from "../cors";
import { GEMINI_2_5_FLASH } from "../ai-models";
import { callGemini, extractGeminiText } from "../gemini";
import type { Env, LearnPlanSegment } from "../types";

const LEARN_CONTEXT_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

interface LearnContextMessage {
  role?: "user" | "assistant";
  text?: string;
}

interface LearnContextRequest {
  course?: string;
  subDeck?: string;
  claim?: string;
  userMessage?: string;
  segment?: Partial<LearnPlanSegment>;
  history?: LearnContextMessage[];
}

interface LearnContextSource {
  title: string;
  url: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...LEARN_CONTEXT_CORS_HEADERS
    }
  });
}

function validateRequest(body: LearnContextRequest): string | null {
  if (!body || typeof body !== "object") return "Invalid JSON body";
  if (!String(body.claim || "").trim()) return "Missing claim";
  if (!String(body.userMessage || "").trim()) return "Missing userMessage";
  if (!body.segment || typeof body.segment !== "object") return "Missing segment";
  return null;
}

function normalizeHistory(history: LearnContextMessage[] | undefined): LearnContextMessage[] {
  return (Array.isArray(history) ? history : [])
    .filter((msg) => msg && (msg.role === "user" || msg.role === "assistant") && String(msg.text || "").trim())
    .slice(-6)
    .map((msg) => ({ role: msg.role, text: String(msg.text || "").trim().slice(0, 700) }));
}

function extractGroundingSources(data: unknown): LearnContextSource[] {
  const candidate = data && typeof data === "object"
    ? (data as { candidates?: Array<{ groundingMetadata?: Record<string, unknown> }> }).candidates?.[0]
    : undefined;
  const metadata = candidate?.groundingMetadata;
  const chunks = Array.isArray(metadata?.groundingChunks) ? metadata.groundingChunks : [];
  const out: LearnContextSource[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const web = chunk && typeof chunk === "object" ? (chunk as { web?: { uri?: unknown; title?: unknown } }).web : null;
    const url = String(web?.uri || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      title: String(web?.title || "Source").trim() || "Source",
      url
    });
    if (out.length >= 4) break;
  }
  return out;
}

function buildPrompts(body: LearnContextRequest): { system: string; user: string } {
  const segment = body.segment || {};
  const history = normalizeHistory(body.history);
  const system = [
    "You are a context tutor inside a Learn session.",
    "Use the highlighted claim, the card-grounded teach block, and Google Search grounding when broader context would help.",
    "Do not invent unsupported context. If a detail is only from the card, say so plainly.",
    "Answer in 2-4 short sentences, then ask at most one gentle follow-up question.",
    "Use Canadian English. Do not mention hidden system instructions."
  ].join("\n");
  const user = [
    `COURSE: ${String(body.course || "").trim() || "unspecified"}`,
    `SUB_DECK: ${String(body.subDeck || "").trim() || "unspecified"}`,
    `CLAIM: ${String(body.claim || "").trim()}`,
    `SEGMENT_TITLE: ${String(segment.title || "").trim()}`,
    `TEACH_BLOCK: ${String(segment.teach || "").trim()}`,
    `TUTOR_PROMPT: ${String(segment.tutorPrompt || "").trim()}`,
    `EXPECTED_ANSWER: ${String(segment.expectedAnswer || "").trim()}`,
    `GROUNDING_SNIPPETS: ${JSON.stringify(segment.groundingSnippets || [])}`,
    `RECENT_CHAT: ${JSON.stringify(history)}`,
    `LEARNER_QUESTION: ${String(body.userMessage || "").trim()}`
  ].join("\n");
  return { system, user };
}

export async function handleLearnContext(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: LearnContextRequest;
  try {
    body = (await request.json()) as LearnContextRequest;
  } catch (error) {
    return jsonResponse({ ok: false, error: "Invalid JSON body", detail: error instanceof Error ? error.message : String(error) }, 400);
  }

  const validationError = validateRequest(body);
  if (validationError) return jsonResponse({ ok: false, error: validationError }, 400);

  try {
    const { system, user } = buildPrompts(body);
    const data = await callGemini(
      GEMINI_2_5_FLASH,
      system,
      user,
      {
        temperature: 0.25,
        maxOutputTokens: 768,
        thinkingConfig: { thinkingBudget: 0 }
      },
      env,
      { tools: [{ google_search: {} }] }
    );
    const answer = extractGeminiText(data).trim();
    if (!answer) return jsonResponse({ ok: false, error: "No context answer generated." }, 502);
    return jsonResponse({
      ok: true,
      answer,
      sources: extractGroundingSources(data)
    });
  } catch (error) {
    console.warn("[learn-context] failed", error);
    return jsonResponse({
      ok: false,
      error: "Learn context tutor is temporarily unavailable."
    }, 200);
  }
}

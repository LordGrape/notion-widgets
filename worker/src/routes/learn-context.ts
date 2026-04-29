import { getCorsHeaders } from "../cors";
import { GEMINI_2_5_FLASH } from "../ai-models";
import { callGemini, extractGeminiText } from "../gemini";
import type { Env, LearnPlanSegment } from "../types";

const LEARN_CONTEXT_CACHE_VERSION = "v3";
const LEARN_CONTEXT_CACHE_TTL_SECONDS = 60 * 60 * 24 * 45;

const LEARN_CONTEXT_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

interface LearnContextMessage {
  role?: "user" | "assistant";
  text?: string;
}

interface LearnContextRequest {
  mode?: "preview" | "chat";
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

interface LearnContextCachedPreview {
  answer: string;
  sources: LearnContextSource[];
  cachedAt: string;
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
  if (body.mode !== "preview" && !String(body.userMessage || "").trim()) return "Missing userMessage";
  if (!body.segment || typeof body.segment !== "object") return "Missing segment";
  return null;
}

function normalizeHistory(history: LearnContextMessage[] | undefined): LearnContextMessage[] {
  return (Array.isArray(history) ? history : [])
    .filter((msg) => msg && (msg.role === "user" || msg.role === "assistant") && String(msg.text || "").trim())
    .slice(-6)
    .map((msg) => ({ role: msg.role, text: String(msg.text || "").trim().slice(0, 700) }));
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function sourceHostHint(source: LearnContextSource): string {
  const fromUrl = sourceHost(source.url);
  const title = String(source.title || "").trim().toLowerCase();
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(title)) return title.replace(/^www\./, "");
  return fromUrl;
}

function isBlockedSource(source: LearnContextSource): boolean {
  const host = sourceHostHint(source);
  return host === "grokipedia.com" || host.endsWith(".grokipedia.com");
}

function sourcePriority(source: LearnContextSource): number {
  const host = sourceHostHint(source);
  if (host.endsWith("canada.ca") || host.endsWith("forces.gc.ca") || host.endsWith("gc.ca")) return 0;
  if (host.endsWith("ekscot.org")) return 1;
  if (host.endsWith("wikipedia.org")) return 1;
  if (host.endsWith(".edu") || host.endsWith(".ac.uk") || host.endsWith(".ca")) return 2;
  return 3;
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
    const source = {
      title: String(web?.title || "Source").trim() || "Source",
      url
    };
    if (isBlockedSource(source)) continue;
    seen.add(url);
    out.push(source);
  }
  return out
    .sort((a, b) => sourcePriority(a) - sourcePriority(b))
    .slice(0, 4);
}

function getPreviewQuestion(): string {
  return [
    "Give a concise context brief for the highlighted claim.",
    "Add background, significance, or definitions that are not already obvious from the card.",
    "Do not repeat the claim as the whole answer; explain why it matters or what it implies."
  ].join(" ");
}

function buildPrompts(body: LearnContextRequest): { system: string; user: string } {
  const segment = body.segment || {};
  const history = normalizeHistory(body.history);
  const isPreview = body.mode === "preview";
  const system = [
    "You are a context tutor inside a Learn session.",
    "Use the highlighted claim, the card-grounded teach block, and Google Search grounding when broader context would help.",
    "Prefer official, academic, museum, government, and Wikipedia sources. Avoid AI encyclopedia clones or low-quality mirrors.",
    "Do not invent unsupported context. If a detail is only from the card, say so plainly.",
    "Avoid restating the same card fact unless it is needed for orientation; prioritize new explanatory context.",
    "When the learner asks what something means, translate the fact into plain significance instead of repeating the original wording.",
    isPreview
      ? "For preview mode, answer with 2-3 compact sentences. Include context, not a quiz question."
      : "For chat mode, answer in 2-4 short sentences. Ask a follow-up only when it would naturally help the learner continue.",
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
    `LEARNER_QUESTION: ${isPreview ? getPreviewQuestion() : String(body.userMessage || "").trim()}`
  ].join("\n");
  return { system, user };
}

async function sha256Hex(payload: string): Promise<string> {
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function previewCacheKey(body: LearnContextRequest): Promise<string> {
  const segment = body.segment || {};
  const payload = JSON.stringify({
    v: LEARN_CONTEXT_CACHE_VERSION,
    course: String(body.course || "").trim(),
    subDeck: String(body.subDeck || "").trim(),
    claim: String(body.claim || "").trim(),
    title: String(segment.title || "").trim(),
    teach: String(segment.teach || "").trim().slice(0, 1400),
    expectedAnswer: String(segment.expectedAnswer || "").trim().slice(0, 900),
    groundingSnippets: Array.isArray(segment.groundingSnippets) ? segment.groundingSnippets.slice(0, 6) : []
  });
  return `studyengine:learn-context:${LEARN_CONTEXT_CACHE_VERSION}:${await sha256Hex(payload)}`;
}

async function readPreviewCache(env: Env, key: string): Promise<LearnContextCachedPreview | null> {
  try {
    const cached = await env.WIDGET_KV.get(key, "json") as LearnContextCachedPreview | null;
    if (!cached || typeof cached !== "object" || !String(cached.answer || "").trim()) return null;
    return {
      answer: String(cached.answer || "").trim(),
      sources: Array.isArray(cached.sources) ? cached.sources.slice(0, 4) : [],
      cachedAt: String(cached.cachedAt || "")
    };
  } catch (err) {
    console.warn("[learn-context] preview cache read failed", err);
    return null;
  }
}

async function writePreviewCache(env: Env, key: string, preview: LearnContextCachedPreview): Promise<void> {
  try {
    await env.WIDGET_KV.put(key, JSON.stringify(preview), { expirationTtl: LEARN_CONTEXT_CACHE_TTL_SECONDS });
  } catch (err) {
    console.warn("[learn-context] preview cache write failed", err);
  }
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
    const isPreview = body.mode === "preview";
    const cacheKey = isPreview ? await previewCacheKey(body) : null;
    if (cacheKey) {
      const cached = await readPreviewCache(env, cacheKey);
      if (cached) {
        return jsonResponse({
          ok: true,
          answer: cached.answer,
          sources: cached.sources,
          cached: true
        });
      }
    }

    const { system, user } = buildPrompts(body);
    const data = await callGemini(
      GEMINI_2_5_FLASH,
      system,
      user,
      {
        temperature: 0.25,
        maxOutputTokens: isPreview ? 384 : 768,
        thinkingConfig: { thinkingBudget: 0 }
      },
      env,
      { tools: [{ google_search: {} }] }
    );
    const answer = extractGeminiText(data).trim();
    if (!answer) return jsonResponse({ ok: false, error: "No context answer generated." }, 502);
    const sources = extractGroundingSources(data);
    if (cacheKey) {
      await writePreviewCache(env, cacheKey, {
        answer,
        sources,
        cachedAt: new Date().toISOString()
      });
    }
    return jsonResponse({
      ok: true,
      answer,
      sources,
      cached: false
    });
  } catch (error) {
    console.warn("[learn-context] failed", error);
    return jsonResponse({
      ok: false,
      error: "Learn context tutor is temporarily unavailable."
    }, 200);
  }
}

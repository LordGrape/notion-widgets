import { getCorsHeaders } from "../cors";
import { callGemini, getFinishReason, parseGeminiJson } from "../gemini";
import { emitTier2Event } from "../lib/tier2";
import type { ExtractedDraft, Env, IngestExtractRequest, IngestExtractResponse } from "../types";

const INGEST_EXTRACT_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const PLAN_ESCALATION_MODEL = "gemini-2.5-pro";
const PRO_DAILY_CAP = 5;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...INGEST_EXTRACT_CORS_HEADERS
    }
  });
}

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function nextUtcMidnightIso(ts: number): string {
  const d = new Date(ts);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
  return new Date(next).toISOString();
}

function resetAtTtlSeconds(ts: number): number {
  const next = new Date(nextUtcMidnightIso(ts)).getTime();
  return Math.max(60, Math.ceil((next - ts) / 1000));
}

function toCount(value: string | null): number {
  const n = Number(value || "0");
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function isExtractedDraft(value: unknown): value is ExtractedDraft {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  const range = rec.sourceLineRange;
  if (!range || typeof range !== "object") return false;
  const rangeRec = range as Record<string, unknown>;
  const confidence = rec.confidence;
  return (
    typeof rec.prompt === "string" &&
    typeof rec.modelAnswer === "string" &&
    typeof rec.sourceParagraphSnippet === "string" &&
    typeof rangeRec.start === "number" &&
    typeof rangeRec.end === "number" &&
    (confidence === "high" || confidence === "medium" || confidence === "low")
  );
}

function validateExtractedDrafts(value: unknown): ExtractedDraft[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((entry) => isExtractedDraft(entry))) return null;
  return value.map((entry) => ({
    prompt: entry.prompt.trim(),
    modelAnswer: entry.modelAnswer.trim(),
    sourceParagraphSnippet: entry.sourceParagraphSnippet.trim(),
    sourceLineRange: {
      start: Math.max(1, Math.floor(entry.sourceLineRange.start || 1)),
      end: Math.max(1, Math.floor(entry.sourceLineRange.end || 1))
    },
    confidence: entry.confidence
  }));
}

function extractionSystemPrompt(strictJson: boolean): string {
  return [
    "You extract atomic flashcards from lecture notes.",
    "Return a JSON array of objects matching this schema:",
    "[{ prompt: string, modelAnswer: string, sourceParagraphSnippet: string, sourceLineRange: { start: number, end: number }, confidence: 'high'|'medium'|'low' }]",
    "Rules:",
    "- One card per discrete fact or concept.",
    "- prompt should be concise and unambiguous.",
    "- modelAnswer should be concise and directly answer prompt.",
    "- sourceParagraphSnippet must be a verbatim excerpt (~80 chars) from input markdown.",
    "- sourceLineRange must be 1-indexed and refer to the source lines for the snippet.",
    "- Output at most 40 cards.",
    strictJson ? "You MUST return valid JSON matching the schema; do NOT include prose." : "Return JSON only."
  ].join("\n");
}

function extractionUserPrompt(body: IngestExtractRequest): string {
  return [
    `courseId: ${body.courseId || ""}`,
    `subDeckId: ${body.subDeckId || ""}`,
    `originDocUrl: ${body.originDocUrl || ""}`,
    `lectureAttended: ${body.lectureAttended ? "true" : "false"}`,
    `chunkIndex: ${body.chunkIndex}`,
    `chunkCount: ${body.chunkCount}`,
    "markdown:",
    body.markdown
  ].join("\n");
}

const EXTRACTED_DRAFTS_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    required: ["prompt", "modelAnswer", "sourceParagraphSnippet", "sourceLineRange", "confidence"],
    properties: {
      prompt: { type: "string" },
      modelAnswer: { type: "string" },
      sourceParagraphSnippet: { type: "string" },
      sourceLineRange: {
        type: "object",
        required: ["start", "end"],
        properties: {
          start: { type: "number" },
          end: { type: "number" }
        }
      },
      confidence: { type: "string", enum: ["high", "medium", "low"] }
    }
  }
};

export async function handleIngestExtract(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await request.json()) as IngestExtractRequest;
    const markdown = String(body.markdown || "").trim();
    if (!markdown) return jsonResponse({ error: "markdown required" }, 400);
    if (!body.requestId || typeof body.requestId !== "string") {
      return jsonResponse({ error: "requestId required" }, 400);
    }

    const now = Date.now();
    const day = dayKey(now);
    const ttl = resetAtTtlSeconds(now);
    const planKey = `tier2:plan-pro:${day}`;
    const ingestKey = `tier2:ingest:${day}`;
    const reqSetKey = `tier2:ingest:reqs:${day}`;

    const [planCountRaw, ingestCountRaw, reqsRaw] = await Promise.all([
      env.WIDGET_KV.get(planKey),
      env.WIDGET_KV.get(ingestKey),
      env.WIDGET_KV.get(reqSetKey, "json") as Promise<string[] | null>
    ]);

    const planCount = toCount(planCountRaw);
    const ingestCount = toCount(ingestCountRaw);
    const combinedCount = planCount + ingestCount;
    if (combinedCount >= PRO_DAILY_CAP) {
      return jsonResponse({ error: "pro_budget_exhausted", resetAt: nextUtcMidnightIso(now) }, 429);
    }

    const seenRequestIds = new Set(Array.isArray(reqsRaw) ? reqsRaw.filter((id): id is string => typeof id === "string") : []);
    const requestAlreadyCounted = seenRequestIds.has(body.requestId);

    const warnings: IngestExtractResponse["warnings"] = [];

    const runExtraction = async (strictJson: boolean, maxOutputTokens: number): Promise<{ drafts: ExtractedDraft[] | null; finishReason?: string }> => {
      const geminiData = await callGemini(
        PLAN_ESCALATION_MODEL,
        extractionSystemPrompt(strictJson),
        extractionUserPrompt({ ...body, markdown }),
        {
          temperature: 0.15,
          maxOutputTokens,
          responseMimeType: "application/json",
          responseSchema: EXTRACTED_DRAFTS_SCHEMA
        },
        env
      );
      const parsed = parseGeminiJson<unknown>(geminiData);
      const drafts = validateExtractedDrafts(parsed);
      return {
        drafts,
        finishReason: getFinishReason(geminiData)
      };
    };

    let result = await runExtraction(false, 4096);
    if (result.finishReason === "MAX_TOKENS") {
      result = await runExtraction(false, 8192);
    }

    if (!result.drafts) {
      result = await runExtraction(true, 8192);
    }

    if (!result.drafts) {
      return jsonResponse({ error: "schema_invalid", message: "Ingest extraction returned invalid schema" }, 502);
    }

    let drafts = result.drafts;
    if (drafts.length > 40) {
      drafts = drafts.slice(0, 40);
      warnings.push({ severity: "warn", message: "Extraction capped at 40 drafts for this chunk." });
    }

    if (!requestAlreadyCounted) {
      seenRequestIds.add(body.requestId);
      await Promise.all([
        env.WIDGET_KV.put(ingestKey, String(ingestCount + 1), { expirationTtl: ttl }),
        env.WIDGET_KV.put(reqSetKey, JSON.stringify(Array.from(seenRequestIds).slice(-5000)), { expirationTtl: ttl })
      ]);
    }

    await emitTier2Event(env, { route: "ingest-extract", model: PLAN_ESCALATION_MODEL, ts: now });

    const combinedAfter = planCount + ingestCount + (requestAlreadyCounted ? 0 : 1);
    const response: IngestExtractResponse = {
      drafts,
      warnings,
      chunksRemaining: Math.max(0, Math.floor(body.chunkCount) - Math.floor(body.chunkIndex) - 1),
      budgetState: { proCallsRemainingToday: Math.max(0, PRO_DAILY_CAP - combinedAfter) }
    };

    return jsonResponse(response, 200);
  } catch (error) {
    return jsonResponse(
      { error: "ingest_extract_failed", detail: error instanceof Error ? error.message : String(error) },
      500
    );
  }
}

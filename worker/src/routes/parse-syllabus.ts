import { getCorsHeaders } from "../cors";
import { callGemini, extractGeminiText, getFinishReason } from "../gemini";
import { TutorJsonParseError, extractJsonFromModelOutput } from "../json-extract";
import type { GeminiJsonValue } from "../gemini";
import type { Env, FieldConfidence, ParseSyllabusRequest, ParseSyllabusResponse, ParsedSyllabus } from "../types";

const PARSE_SYLLABUS_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const PARSED_SYLLABUS_RESPONSE_SCHEMA: GeminiJsonValue = {
  type: "object",
  properties: {
    subjectType: { type: "string", enum: ["recall", "reasoning", "mixed"] },
    subjectTypeReason: { type: "string" },
    assessmentFormat: {
      type: "object",
      properties: {
        hasEssay: { type: "boolean" },
        hasShortAnswer: { type: "boolean" },
        hasMultipleChoice: { type: "boolean" },
        hasOralComponent: { type: "boolean" },
        hasPresentation: { type: "boolean" },
        hasParticipation: { type: "boolean" },
        weights: {
          type: "object",
          additionalProperties: { type: "number" }
        }
      },
      required: [
        "hasEssay",
        "hasShortAnswer",
        "hasMultipleChoice",
        "hasOralComponent",
        "hasPresentation",
        "hasParticipation",
        "weights"
      ]
    },
    allowedMaterials: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["closed_book", "open_book", "one_page_sheet", "take_home", "unknown"] },
        rawText: { type: "string", nullable: true }
      },
      required: ["mode"]
    },
    topicWeights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          week: { type: "integer", nullable: true },
          weight: { type: "number", nullable: true },
          readings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                citation: { type: "string" },
                week: { type: "integer", nullable: true },
                availability: { type: "string", enum: ["textbook", "brightspace", "library", "open", "unknown"] }
              },
              required: ["citation", "availability"]
            }
          }
        },
        required: ["topic"]
      }
    },
    professorValueHints: {
      type: "array",
      items: {
        type: "object",
        properties: {
          value: { type: "string" },
          evidence: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] }
        },
        required: ["value", "evidence", "confidence"]
      }
    },
    scopeTerms: {
      type: "array",
      items: { type: "string" }
    },
    aiPolicy: {
      type: "object",
      properties: {
        stance: { type: "string", enum: ["banned", "restricted", "permitted", "unspecified"] },
        verbatimQuote: { type: "string", nullable: true }
      },
      required: ["stance"]
    },
    academicIntegrityHints: {
      type: "array",
      items: { type: "string" }
    },
    rubricHints: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dimension: { type: "string" },
          weight: { type: "number", nullable: true },
          verbatim: { type: "string" }
        },
        required: ["dimension", "verbatim"]
      }
    },
    bloomProfile: {
      type: "object",
      properties: {
        remember: { type: "number" },
        understand: { type: "number" },
        apply: { type: "number" },
        analyze: { type: "number" },
        evaluate: { type: "number" },
        create: { type: "number" }
      },
      required: ["remember", "understand", "apply", "analyze", "evaluate", "create"]
    },
    textbooks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          citation: { type: "string" },
          required: { type: "boolean" },
          chapterMapping: {
            type: "object",
            additionalProperties: { type: "string" }
          }
        },
        required: ["citation", "required"]
      }
    },
    supplementaryReadings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          citation: { type: "string" },
          week: { type: "integer", nullable: true },
          availability: { type: "string", enum: ["textbook", "brightspace", "library", "open", "unknown"] }
        },
        required: ["citation", "availability"]
      }
    },
    confidence: {
      type: "object",
      additionalProperties: {
        type: "string",
        enum: ["high", "medium", "low"]
      }
    }
  },
  required: ["subjectType", "subjectTypeReason", "confidence"]
};

const CONFIDENCE_KEYS = [
  "subjectType",
  "subjectTypeReason",
  "assessmentFormat",
  "allowedMaterials",
  "topicWeights",
  "professorValueHints",
  "scopeTerms",
  "aiPolicy",
  "academicIntegrityHints",
  "rubricHints",
  "bloomProfile",
  "textbooks",
  "supplementaryReadings"
] as const;

const SYSTEM_PROMPT = `You extract structured course context from syllabus text to help a study app calibrate retrieval practice and feedback. You are not generating study materials, essays, or submittable content. Only descriptive extraction.

For every professorValueHints.evidence quote, rubricHints.verbatim, aiPolicy.verbatimQuote, and each academicIntegrityHints entry: use an exact substring from the source syllabus text. Do not paraphrase or reword. If no clean substring exists, omit that entry.

Confidence rules: high when explicitly stated verbatim, medium when strongly implied by assessment mix or rubric wording, low when weakly inferred. Return confidence entries for every field.

subjectType is based on dominant assessment style. subjectTypeReason must reference the concrete assessments that drove the classification.

aiPolicy.stance rules:
- banned only when generative AI is explicitly prohibited in submitted graded work
- restricted when AI is conditionally allowed with constraints
- permitted when explicitly allowed
- unspecified when not mentioned
If stance is not unspecified, verbatimQuote must be the exact policy sentence.

academicIntegrityHints must be short verbatim phrases about what counts as submittable work, originality standards, citation rules, or academic integrity policies.

bloomProfile proportions must sum to 1.0 (tolerance ±0.05).

professorValueHints should contain 3-7 entries, each explicitly emphasized by the professor (rubric dimensions, repeated priorities, methodological preferences). Do not infer from generic course outcomes.

rubricHints should contain explicit grading dimensions quoted verbatim. If repeated across assignments, keep one entry per dimension.

scopeTerms should contain 5-15 distinctive in-scope course terms.

Return all schema fields. Use empty arrays, sensible defaults, and low confidence where signal is missing.

Return only a JSON object. No markdown, code fences, or extra text.`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...PARSE_SYLLABUS_CORS_HEADERS
    }
  });
}

function sanitizeSyllabusText(raw: string): { text: string; truncated: boolean } {
  const normalized = raw.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim();
  if (normalized.length <= 40000) {
    return { text: normalized, truncated: false };
  }
  return { text: `${normalized.slice(0, 40000)} [truncated for parsing]`, truncated: true };
}

function normalizeForMatch(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasVerbatimMatch(sourceText: string, excerpt: string): boolean {
  const candidate = normalizeForMatch(excerpt);
  if (!candidate) return false;
  return normalizeForMatch(sourceText).includes(candidate);
}

function toConfidenceRecord(input: unknown): Record<string, FieldConfidence> {
  const result: Record<string, FieldConfidence> = {};
  if (!input || typeof input !== "object") return result;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (value === "high" || value === "medium" || value === "low") {
      result[key] = value;
    }
  }
  return result;
}

function normalizeBloomProfile(parsed: ParseSyllabusResponse): void {
  if (!parsed.bloomProfile) return;
  const raw = parsed.bloomProfile;
  const vals = [raw.remember, raw.understand, raw.apply, raw.analyze, raw.evaluate, raw.create].map((v) =>
    Number.isFinite(v) ? Number(v) : 0
  );
  const sum = vals.reduce((acc, v) => acc + Math.max(0, v), 0);
  if (sum <= 0) {
    parsed.bloomProfile = { remember: 0, understand: 0, apply: 0, analyze: 0, evaluate: 0, create: 0 };
    return;
  }
  parsed.bloomProfile = {
    remember: Math.max(0, vals[0]) / sum,
    understand: Math.max(0, vals[1]) / sum,
    apply: Math.max(0, vals[2]) / sum,
    analyze: Math.max(0, vals[3]) / sum,
    evaluate: Math.max(0, vals[4]) / sum,
    create: Math.max(0, vals[5]) / sum
  };
}

function clampAssessmentWeights(parsed: ParseSyllabusResponse): void {
  if (!parsed.assessmentFormat?.weights || typeof parsed.assessmentFormat.weights !== "object") return;
  const clamped: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed.assessmentFormat.weights)) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      clamped[key] = 0;
      continue;
    }
    clamped[key] = Math.min(1, Math.max(0, numeric));
  }
  parsed.assessmentFormat.weights = clamped;
}

function baseDefaults(): ParseSyllabusResponse {
  return {
    subjectType: "mixed",
    subjectTypeReason: "",
    assessmentFormat: {
      hasEssay: false,
      hasShortAnswer: false,
      hasMultipleChoice: false,
      hasOralComponent: false,
      hasPresentation: false,
      hasParticipation: false,
      weights: {}
    },
    allowedMaterials: {
      mode: "unknown"
    },
    topicWeights: [],
    professorValueHints: [],
    scopeTerms: [],
    aiPolicy: {
      stance: "unspecified"
    },
    academicIntegrityHints: [],
    rubricHints: [],
    bloomProfile: {
      remember: 0,
      understand: 0,
      apply: 0,
      analyze: 0,
      evaluate: 0,
      create: 0
    },
    textbooks: [],
    supplementaryReadings: [],
    confidence: {}
  };
}

function asBoolean(input: unknown, fallback = false): boolean {
  return typeof input === "boolean" ? input : fallback;
}

function asNumber(input: unknown, fallback = 0): number {
  const numeric = Number(input);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function coerceParsedSyllabus(input: unknown): ParseSyllabusResponse {
  const base = baseDefaults();
  if (!input || typeof input !== "object") {
    for (const key of CONFIDENCE_KEYS) {
      base.confidence[key] = "low";
    }
    return base;
  }

  const raw = input as Partial<ParsedSyllabus>;
  const merged: ParseSyllabusResponse = {
    ...base,
    ...raw,
    assessmentFormat: {
      hasEssay: asBoolean(raw.assessmentFormat?.hasEssay),
      hasShortAnswer: asBoolean(raw.assessmentFormat?.hasShortAnswer),
      hasMultipleChoice: asBoolean(raw.assessmentFormat?.hasMultipleChoice),
      hasOralComponent: asBoolean(raw.assessmentFormat?.hasOralComponent),
      hasPresentation: asBoolean(raw.assessmentFormat?.hasPresentation),
      hasParticipation: asBoolean(raw.assessmentFormat?.hasParticipation),
      weights: { ...(raw.assessmentFormat?.weights || {}) }
    },
    allowedMaterials: {
      mode: raw.allowedMaterials?.mode || "unknown",
      rawText: raw.allowedMaterials?.rawText
    },
    aiPolicy: {
      stance: raw.aiPolicy?.stance || "unspecified",
      verbatimQuote: raw.aiPolicy?.verbatimQuote
    },
    topicWeights: Array.isArray(raw.topicWeights) ? raw.topicWeights : [],
    professorValueHints: Array.isArray(raw.professorValueHints) ? raw.professorValueHints : [],
    scopeTerms: Array.isArray(raw.scopeTerms) ? raw.scopeTerms : [],
    academicIntegrityHints: Array.isArray(raw.academicIntegrityHints) ? raw.academicIntegrityHints : [],
    rubricHints: Array.isArray(raw.rubricHints) ? raw.rubricHints : [],
    textbooks: Array.isArray(raw.textbooks) ? raw.textbooks : [],
    supplementaryReadings: Array.isArray(raw.supplementaryReadings) ? raw.supplementaryReadings : [],
    bloomProfile: {
      remember: asNumber(raw.bloomProfile?.remember),
      understand: asNumber(raw.bloomProfile?.understand),
      apply: asNumber(raw.bloomProfile?.apply),
      analyze: asNumber(raw.bloomProfile?.analyze),
      evaluate: asNumber(raw.bloomProfile?.evaluate),
      create: asNumber(raw.bloomProfile?.create)
    },
    confidence: toConfidenceRecord(raw.confidence)
  };

  for (const key of CONFIDENCE_KEYS) {
    if (!merged.confidence[key]) {
      merged.confidence[key] = "low";
    }
  }

  return merged;
}

function setLowConfidence(parsed: ParseSyllabusResponse, key: (typeof CONFIDENCE_KEYS)[number]): void {
  parsed.confidence[key] = "low";
}

function validateVerbatimFields(parsed: ParseSyllabusResponse, sourceText: string): number {
  let dropped = 0;

  const originalProfessorHints = parsed.professorValueHints || [];
  const validProfessorHints = originalProfessorHints.filter((entry) => {
    const ok = typeof entry.evidence === "string" && hasVerbatimMatch(sourceText, entry.evidence);
    if (!ok) dropped += 1;
    return ok;
  });
  if (validProfessorHints.length !== originalProfessorHints.length) {
    parsed.professorValueHints = validProfessorHints;
    setLowConfidence(parsed, "professorValueHints");
  }

  const originalRubrics = parsed.rubricHints || [];
  const validRubrics = originalRubrics.filter((entry) => {
    const ok = typeof entry.verbatim === "string" && hasVerbatimMatch(sourceText, entry.verbatim);
    if (!ok) dropped += 1;
    return ok;
  });
  if (validRubrics.length !== originalRubrics.length) {
    parsed.rubricHints = validRubrics;
    setLowConfidence(parsed, "rubricHints");
  }

  if (parsed.aiPolicy?.verbatimQuote && !hasVerbatimMatch(sourceText, parsed.aiPolicy.verbatimQuote)) {
    delete parsed.aiPolicy.verbatimQuote;
    setLowConfidence(parsed, "aiPolicy");
    dropped += 1;
  }

  const originalIntegrityHints = parsed.academicIntegrityHints || [];
  const validIntegrityHints = originalIntegrityHints.filter((entry) => {
    const ok = typeof entry === "string" && hasVerbatimMatch(sourceText, entry);
    if (!ok) dropped += 1;
    return ok;
  });
  if (validIntegrityHints.length !== originalIntegrityHints.length) {
    parsed.academicIntegrityHints = validIntegrityHints;
    setLowConfidence(parsed, "academicIntegrityHints");
  }

  return dropped;
}

async function requestParsedSyllabus(
  userPrompt: string,
  env: Env
): Promise<{ parsed: unknown; finishReason: string | undefined; rawText: string }> {
  const geminiData = await callGemini(
    "gemini-2.5-flash",
    SYSTEM_PROMPT,
    userPrompt,
    {
      temperature: 0.2,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      responseSchema: PARSED_SYLLABUS_RESPONSE_SCHEMA,
      thinkingConfig: { thinkingBudget: 0 }
    },
    env
  );

  const finishReason = getFinishReason(geminiData);
  const rawText = extractGeminiText(geminiData);
  if (rawText === "") {
    return { parsed: null, finishReason, rawText };
  }
  const parsed = extractJsonFromModelOutput(rawText);
  return { parsed, finishReason, rawText };
}

export async function handleParseSyllabus(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await request.json()) as ParseSyllabusRequest;
    if (!body?.syllabusText || typeof body.syllabusText !== "string") {
      return jsonResponse({ error: "syllabusText required" }, 400);
    }

    const { text: syllabusText, truncated } = sanitizeSyllabusText(body.syllabusText);
    if (!syllabusText) {
      return jsonResponse({ error: "syllabusText required" }, 400);
    }
    if (truncated) {
      console.warn("[parse-syllabus] input truncated to 40000 chars");
    }

    const userPrompt = `SYLLABUS SOURCE:\n${syllabusText}`;
    let finishReason: string | undefined;
    let rawText = "";
    let parsed: unknown = null;

    try {
      const first = await requestParsedSyllabus(userPrompt, env);
      finishReason = first.finishReason;
      rawText = first.rawText;
      if (rawText === "") {
        return jsonResponse({ error: "syllabus_parse_failed", finishReason, rawPreview: rawText.slice(0, 500) }, 502);
      }
      parsed = first.parsed;
    } catch (error) {
      if (!(error instanceof TutorJsonParseError)) {
        throw error;
      }
      const retryPrompt = `${userPrompt}\n\nReturn ONLY a JSON object. No prose. No code fences.`;
      try {
        const retry = await requestParsedSyllabus(retryPrompt, env);
        finishReason = retry.finishReason;
        rawText = retry.rawText;
        if (rawText === "") {
          return jsonResponse({ error: "syllabus_parse_failed", finishReason, rawPreview: rawText.slice(0, 500) }, 502);
        }
        parsed = retry.parsed;
      } catch (retryError) {
        if (retryError instanceof TutorJsonParseError) {
          return jsonResponse({ error: "syllabus_parse_failed", finishReason, rawPreview: rawText.slice(0, 500) }, 502);
        }
        throw retryError;
      }
    }

    if (!parsed || typeof parsed !== "object") {
      return jsonResponse({ error: "syllabus_parse_failed", finishReason, rawPreview: rawText.slice(0, 500) }, 502);
    }

    const result = coerceParsedSyllabus(parsed);
    normalizeBloomProfile(result);
    clampAssessmentWeights(result);
    const droppedCount = validateVerbatimFields(result, syllabusText);
    if (droppedCount > 0) {
      console.warn(`[parse-syllabus] dropped ${droppedCount} unverifiable quotes`);
    }

    return jsonResponse(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("Gemini API error:")) {
      return jsonResponse({ error: "Gemini API error", detail: message.replace("Gemini API error: ", "") }, 502);
    }

    return jsonResponse({ error: "Internal error", detail: message }, 500);
  }
}

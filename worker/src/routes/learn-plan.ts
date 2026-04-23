import { getCorsHeaders } from "../cors";
import { callGemini, extractGeminiText, streamGemini } from "../gemini";
import type { ConsolidationQuestion, Env, LearnCheckType, LearnPlanRequest, LearnPlanResponse, LearnPlanSegment, StudyCardInput } from "../types";
import { parseJsonResponse } from "../utils/json";

const LEARN_PLAN_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const PLAN_MODEL = "gemini-2.5-pro";

const LEARN_CHECK_TYPES: readonly LearnCheckType[] = ["elaborative", "predictive", "self_explain"] as const;

function isLearnCheckType(value: unknown): value is LearnCheckType {
  return typeof value === "string" && LEARN_CHECK_TYPES.includes(value as LearnCheckType);
}

function verifySegmentCheckType(segment: LearnPlanSegment): boolean {
  return isLearnCheckType(segment?.checkType);
}

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

const LEARN_GATE_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "is", "are", "was", "were", "be", "been", "being",
  "in", "on", "at", "to", "of", "for", "with", "by", "from", "as", "that", "this", "these", "those",
  "it", "its", "which", "who", "whom", "whose", "what", "when", "where", "why", "how"
]);

function tokenizeForLearnGate(input: string): string[] {
  return String(input || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !LEARN_GATE_STOPWORDS.has(token));
}

function computeTokenOverlapRatio(sourceText: string, targetText: string): number {
  const sourceTokens = Array.from(new Set(tokenizeForLearnGate(sourceText)));
  const targetTokens = Array.from(new Set(tokenizeForLearnGate(targetText)));
  if (sourceTokens.length === 0) return 1;
  const targetSet = new Set(targetTokens);
  const overlapCount = sourceTokens.filter((token) => targetSet.has(token)).length;
  return overlapCount / sourceTokens.length;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Grounding token-overlap floors (Turn 4).
 *
 * verifySegmentGrounding originally required every groundingSnippet quote
 * to appear verbatim (normalized whitespace) in the card corpus. Gemini
 * legitimately paraphrases quotes, which caused the
 * "GROUNDING VERIFICATION FAILED. USED CARD-DENSITY FALLBACK." defect at
 * 2026-04-22 20:59. We retain the substring check as a fast-path accept
 * and, on miss, fall through to a segment-level token-overlap check
 * against the same card's corpus ({prompt}\n{modelAnswer}).
 *
 * Teach floor is higher because the teach block is long and should be
 * substantively anchored in the card content. Tutor floor is lower
 * because tutor prompts legitimately introduce framing tokens ("Using
 * only what you have just read...") that do not appear in the source.
 *
 * Exported to signal that these are the tuning knobs for grounding
 * sensitivity, not arbitrary magic numbers buried in the function body.
 * ──────────────────────────────────────────────────────────────────── */
export const GROUNDING_TEACH_OVERLAP_FLOOR = 0.55;
export const GROUNDING_TUTOR_OVERLAP_FLOOR = 0.35;

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
  const teach = String(segment.teach || "");
  const tutorPrompt = String(segment.tutorPrompt || "");
  for (const snippet of segment.groundingSnippets) {
    if (!snippet || typeof snippet !== "object") return false;
    const cardId = String(snippet.cardId || "");
    const quote = String(snippet.quote || "");
    if (!cardId || !quote) return false;
    const source = corpus[cardId];
    if (!source) return false;

    // Fast-path: exact-substring anchor match (original behaviour,
    // preserves green cases).
    if (textHasAnchor(source, quote)) continue;

    // Fallback: segment-level token overlap against this card's corpus.
    // Gemini may have paraphrased the quote rather than copying; the
    // segment as a whole still has to draw substantively from the card.
    const teachRatio = computeTokenOverlapRatio(teach, source);
    const tutorRatio = computeTokenOverlapRatio(tutorPrompt, source);
    const overlapAccepts = teachRatio >= GROUNDING_TEACH_OVERLAP_FLOOR && tutorRatio >= GROUNDING_TUTOR_OVERLAP_FLOOR;

    if (overlapAccepts) {
      console.info(
        '[learn-plan] grounding accepted via token-overlap',
        JSON.stringify({ cardId, teachRatio, tutorRatio })
      );
      continue;
    }

    console.info(
      '[learn-plan] grounding rejected',
      JSON.stringify({ cardId, teachRatio, tutorRatio, teachHead: teach.slice(0, 120) })
    );
    return false;
  }
  return true;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Defect 1 fix: teach-block validation.
 *
 * Gemini sometimes returns a stub or a question in the `teach` field. The
 * grounding gate alone does not catch that, because a meta-question is
 * trivially "grounded" in the card front. This validator enforces
 * pedagogical density:
 *   - >= 60 words after trimming
 *   - does not end with a question mark
 *   - does not start with a banned opener phrase (after stripping markdown
 *     formatting and whitespace)
 *
 * Segments that fail teach validation are dropped and routed through the
 * same three-tier fallback the grounding gate uses. The regex only matches
 * openers that are genuinely interrogative or second-person imperative;
 * legitimate teach openers such as "What follows is..." or "How this works:"
 * are intentionally allowed.
 * ──────────────────────────────────────────────────────────────────────── */
const BANNED_TEACH_OPENERS_RE =
  /^\s*(let['\u2019]?s|can you|what (is|are|do|does|was|were|did)\b|how (do|does|can|should) you|think about|consider|imagine|picture|recall|tell me|describe|explain to)\b/i;

/**
 * Phase A1: banned meta-phrases inside a teach block.
 *
 * After the 2026-04-22 teach-block leak report, production teach bodies
 * were found to contain pedagogy-describing prose like
 *   "Read the answer carefully before attempting retrieval; the tutor
 *    prompt below asks you to reconstruct it from memory using your own
 *    words."
 * That copy is legitimate English and passes every existing check
 * (word count, no question mark, no banned opener) but teaches nothing
 * about the card content. These substrings are matched case-insensitively
 * anywhere in the teach body and route the segment through the same
 * three-tier fallback as the banned-opener check.
 */
const BANNED_TEACH_META_PHRASES: string[] = [
  'tutor prompt',
  'prompt below',
  'question below',
  'attempt retrieval',
  'attempt recall',
  'reconstruct it from memory',
  'reconstruct from memory',
  'you will be asked',
  'asks you to'
];

function containsBannedTeachMetaPhrase(teach: string): boolean {
  const hay = teach.toLowerCase();
  for (const phrase of BANNED_TEACH_META_PHRASES) {
    if (hay.indexOf(phrase) >= 0) return true;
  }
  return false;
}

function countWords(s: string): number {
  const m = String(s || '').trim().match(/\S+/g);
  return m ? m.length : 0;
}

function verifySegmentTeach(seg: LearnPlanSegment): boolean {
  const teach = String(seg?.teach || '').trim();
  if (!teach) return false;
  if (countWords(teach) < 60) return false;
  // Trailing question mark after trimming trailing whitespace/punctuation-safe
  // check: if the last non-whitespace char is '?', reject.
  if (/\?\s*$/.test(teach)) return false;
  // Strip leading markdown formatting (asterisks, underscores, hashes, blockquote,
  // list markers, backticks) before applying the opener regex.
  const stripped = teach.replace(/^[\s>#*_\-`]+/, '');
  if (BANNED_TEACH_OPENERS_RE.test(stripped)) return false;
  // Phase A1: reject meta-instructional teach bodies (see constant above).
  if (containsBannedTeachMetaPhrase(teach)) return false;
  return true;
}

/**
 * Phase A3: tutor-prompt validator.
 *
 * Production tutor prompts were falling through to generic meta-summaries
 * ("What is the core claim of this card?") which are not retrieval practice.
 * A valid tutor prompt is a specific retrieval question that targets a
 * concrete fact from the card content.
 *
 * Rejection rules (all case-insensitive for substring matches):
 *   - trimmed length < 15 chars
 *   - does not end in `?`
 *   - contains any generic meta-summary phrase from the banlist
 *
 * Returns a discriminated object so callers can optionally log the reason
 * (useful for post-deploy telemetry in Phase B).
 */
const BANNED_TUTOR_PROMPT_PHRASES: string[] = [
  'core claim',
  'main point',
  'main idea',
  'key takeaway',
  'in your own words, what',
  'summarize this card',
  'summarise this card',
  'what is this card about',
  'what is the card about',
  'describe this card',
  'explain this card',
  'what does this card teach'
];

/**
 * Banned recall-pattern regexes on tutor prompts.
 *
 * The planner system prompt bans these in text but Gemini occasionally
 * ignores it. Enforced at runtime in verifySegmentTutorPrompt. Matched
 * case-insensitively after trimming whitespace and stripping leading
 * markdown. Segments whose tutorPrompt matches any of these patterns are
 * dropped and routed through the existing three-tier fallback.
 *
 * Also duplicated in worker/src/routes/learn-turn.ts (BANNED_TUTOR_PROMPT_RECALL_PATTERNS)
 * where the same regex array conditions the copyRatio backstop.
 * Keep the two arrays in sync.
 */
export const BANNED_TUTOR_PROMPT_RECALL_PATTERNS: readonly RegExp[] = [
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

export function verifySegmentTutorPrompt(tp: string): { ok: boolean; reason?: string } {
  const trimmed = String(tp || '').trim();
  if (trimmed.length < 15) return { ok: false, reason: 'too_short' };
  if (!/\?\s*$/.test(trimmed)) return { ok: false, reason: 'no_question_mark' };
  // Strip leading markdown / quote / whitespace noise so a planner emitting
  // "> When was X founded?" still gets caught by the recall patterns below.
  const stripped = trimmed.replace(/^[\s>#*_\-`]+/, '');
  for (const pattern of BANNED_TUTOR_PROMPT_RECALL_PATTERNS) {
    if (pattern.test(stripped)) return { ok: false, reason: `banned_recall_pattern:${pattern.source}` };
  }
  const lower = trimmed.toLowerCase();
  for (const phrase of BANNED_TUTOR_PROMPT_PHRASES) {
    if (lower.indexOf(phrase) >= 0) return { ok: false, reason: `banned_phrase:${phrase}` };
  }
  return { ok: true };
}

function filterVerifiedSegments(segments: LearnPlanSegment[], corpus: Record<string, string>): LearnPlanSegment[] {
  return (segments || []).filter((seg) => (
    verifySegmentGrounding(seg, corpus)
    && verifySegmentTeach(seg)
    && verifySegmentTutorPrompt(String(seg?.tutorPrompt || '')).ok
    && verifySegmentCheckType(seg)
  ));
}

function verifyConsolidationQuestion(
  question: ConsolidationQuestion,
  corpus: Record<string, string>
): boolean {
  if (!question || typeof question !== "object") return false;
  const q = String(question.question || "").trim();
  const a = String(question.answer || "").trim();
  if (!q || !a) return false;
  const linked = Array.isArray(question.linkedCardIds) ? question.linkedCardIds : [];
  if (linked.length === 0) return false;

  const anchor = a.length > 200 ? a.slice(0, 200) : a;
  for (const cardId of linked) {
    const source = corpus[String(cardId || "")];
    if (!source) continue;
    if (textHasAnchor(source, anchor)) return true;
    if (a.length >= 40) {
      const norm = normalizeText(a);
      const hay = normalizeText(source);
      if (norm.length >= 40 && hay.indexOf(norm.slice(0, Math.min(160, norm.length))) >= 0) return true;
    }
  }
  return false;
}

function filterVerifiedConsolidationQuestions(
  questions: ConsolidationQuestion[],
  corpus: Record<string, string>
): ConsolidationQuestion[] {
  return (questions || []).filter((q) => verifyConsolidationQuestion(q, corpus));
}

/**
 * Build a card-specific tutor prompt for the density fallback. The goal is
 * to produce a concrete retrieval question tied to the actual card front,
 * not a meta-summary. Behaviour:
 *   - If the front already ends in `?`, use it verbatim.
 *   - Otherwise, strip a trailing period and wrap it so the learner is
 *     prompted to answer from memory: "Using only what you have just read,
 *     ${front}?"
 * The result is guaranteed to end in `?` and avoids every banned phrase
 * in BANNED_TUTOR_PROMPT_PHRASES.
 */
function buildFallbackTutorPrompt(front: string): string {
  const trimmed = String(front || '').trim();
  if (!trimmed) return 'Using only what you have just read, what fact did the card state?';
  if (/\?\s*$/.test(trimmed)) return trimmed;
  const withoutTrailingPunct = trimmed.replace(/[\s.!,;:]+$/, '');
  return `Using only what you have just read, ${withoutTrailingPunct}?`;
}

function buildDensityFallback(cards: StudyCardInput[]): LearnPlanResponse {
  const maxCards = cards.slice(0, 5);
  const consolidationQuestions: ConsolidationQuestion[] = maxCards.slice(0, 3).map((card) => {
    const id = String(card.id || "");
    const answer = String(card.modelAnswer || card.prompt || "").trim().slice(0, 200);
    const front = String(card.prompt || "").trim();
    // Consolidation questions are separate from segment tutor prompts and are
    // not gated by verifySegmentTutorPrompt, but we still avoid the
    // "core claim" phrasing so the learner-facing copy stays consistent.
    return {
      question: buildFallbackTutorPrompt(front.slice(0, 120)),
      answer,
      linkedCardIds: id ? [id] : []
    };
  }).filter((q) => q.answer && q.linkedCardIds.length > 0);
  const segments = maxCards.map((card, idx) => {
    const prompt = String(card.prompt || "").trim();
    const answer = String(card.modelAnswer || "").trim();
    // Density-fallback teach (Turn 4): surface the card's own modelAnswer
    // unchanged. The prior scaffold ("This segment presents the card
    // titled \"${prompt}\"...") pretended to be narrative teach and leaked
    // to learners when grounding verification legitimately failed. This
    // form degrades gracefully: the learner sees the card's actual content,
    // not meta-prose about there being a card. If `answer` is empty,
    // `prompt` alone is degenerate but not misleading. Schema unchanged
    // (string in/out); fallback segments still bypass the >=60-word teach
    // validator because they are locally constructed, not Gemini output.
    const teachBody = answer ? answer : prompt;
    return {
      id: `fallback-${idx + 1}`,
      title: prompt ? prompt.slice(0, 80) : `Card ${idx + 1}`,
      mechanism: "worked_example",
      objective: "Ground first exposure using this card's core content.",
      teach: teachBody,
      tutorPrompt: buildFallbackTutorPrompt(prompt),
      checkType: "elaborative",
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
  return { segments, consolidationQuestions, planMode: "card_density_fallback" };
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
    "",
    "TEACH-BLOCK RULES (each segment's `teach` field):",
    "- Minimum 80 words of declarative instruction.",
    "- Must contain at least one concrete fact drawn from the grounding card set (date, name, event, mechanism, or relationship).",
    "- Must NOT be a question. Must NOT end with a question mark.",
    "- Must NOT open with 'Let's', 'Can you', 'What is/are/was/were/do/does/did', 'How do/does/can/should you', 'Think about', 'Consider', 'Imagine', 'Picture', 'Recall', 'Tell me', 'Describe', 'Explain to', or any second-person imperative or interrogative at the start.",
    "- Must teach BEFORE retrieval: state the facts clearly, then let the `tutorPrompt` field carry the Socratic question that asks the learner to reconstruct them.",
    "- The teach block must teach the content directly. Do NOT describe the upcoming retrieval step, the tutor prompt, or the pedagogical structure. Do NOT use meta-phrases like 'read carefully', 'attempt retrieval', 'reconstruct from memory', 'in your own words', 'the tutor prompt below', 'you will be asked'. The learner will see your teach block and then a separate retrieval question. They do not need to be told this is about to happen.",
    "- Positive example: 'The Essex and Kent Scottish Regiment traces its origin to 1885, when the 21st Essex Battalion of Infantry was formed in Windsor, Ontario. It was redesignated several times through the late 19th and 20th centuries, absorbing the Kent Regiment in 1954 to become the unified Essex and Kent Scottish. The regiment's modern role is as a primary reserve infantry unit of the Canadian Army, headquartered in Windsor, with subunits across southwestern Ontario.'",
    "- Negative example (DO NOT emit): 'Let's encode this card from first principles. What is the core claim?'",
    "",
    "YOUR TURN RULES (each segment's `tutorPrompt` + `checkType` fields):",
    "- This is the Socratic question the learner answers AFTER reading `teach`.",
    "- Keep it brief (one or two sentences).",
    "- It is the only field that may end with a question mark.",
    "- You must choose exactly one checkType for each segment:",
    "  - elaborative: 'In your own words, why does [concept] matter / work / apply?' or 'How does [concept] connect to [prior segment]?' — forces causal reasoning.",
    "  - predictive: 'Before the next segment: what would happen if [varied scenario]?' — builds anticipatory schema.",
    "  - self_explain: 'Explain [concept] as if teaching someone who has not read the segment.' — forces recoding in own words.",
    "- Never:",
    "  - Ask questions whose answer is a literal string from the teach (dates, names, places, numbers, titles, proper nouns).",
    "  - Ask 'When / who / where / which / what is' questions that target a fact stated in the teach.",
    "  - Ask yes/no questions.",
    "  - Ask questions answerable by scanning the teach for a single phrase.",
    "  - Ask the student to 'repeat' or 'state' or 'name' something just taught.",
    "- Worked counterexample:",
    "  - BAD: 'When was the regiment founded, and under what name?'",
    "  - GOOD: 'The regiment was founded in 1885 as an infantry battalion headquartered in Windsor. Why might Windsor specifically reflect late-nineteenth-century Canadian defensive priorities, and what would change if it had been headquartered in Halifax instead?'",
    "- Every segment MUST include `checkType` alongside `tutorPrompt`.",
    "",
    "Also generate 3-5 consolidationQuestions that span ALL segments taught. Each question tests recall OR conceptual connection between segments.",
    "Each consolidation answer MUST be grounded: copy a verbatim substring from a supplied card modelAnswer or prompt. Unverifiable answers will be dropped.",
    "Each consolidation question must list linkedCardIds referencing which cards the answer draws from.",
    "No markdown.",
    "IMPORTANT STREAM HINT: emit the JSON in source order so each \"segments\" object is complete before the next begins, and emit \"consolidationQuestions\" after all segments."
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
    '      "teach": "80+ words of declarative instruction with concrete facts; no questions; no banned openers.",',
    '      "tutorPrompt": "Socratic question for the learner to answer.",',
    '      "checkType": "elaborative",',
    '      "expectedAnswer": "...",',
    '      "linkedCardIds": ["card-id"],',
    '      "groundingSnippets": [{ "cardId": "card-id", "quote": "exact substring" }]',
    "    }",
    "  ],",
    '  "consolidationQuestions": [',
    "    {",
    '      "question": "...",',
    '      "answer": "verbatim substring from a linked card modelAnswer or prompt",',
    '      "linkedCardIds": ["card-id"]',
    "    }",
    "  ]",
    "}"
  ].join("\n");
}

function buildGenerationConfig(): Record<string, unknown> {
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
            teach: { type: "string" },
            tutorPrompt: { type: "string" },
            checkType: { type: "string", enum: ["elaborative", "predictive", "self_explain"] },
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
          required: ["id", "title", "mechanism", "objective", "teach", "tutorPrompt", "checkType", "expectedAnswer", "linkedCardIds", "groundingSnippets"]
        }
      },
      consolidationQuestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            answer: { type: "string" },
            linkedCardIds: { type: "array", items: { type: "string" } }
          },
          required: ["question", "answer", "linkedCardIds"]
        }
      }
    },
    required: ["segments", "consolidationQuestions"]
  };
  return {
    temperature: 0.3,
    maxOutputTokens: 2560,
    responseMimeType: "application/json",
    responseSchema,
    thinkingConfig: { thinkingBudget: 512 }
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * Incremental segment extractor.
 *
 * Scans a growing JSON buffer and emits complete segment objects from
 * inside the `segments` array as soon as their closing `}` lands at the
 * array's top depth. Tracks escape + string state so braces inside string
 * values are ignored.
 *
 * State survives across chunks. `consume(buffer)` returns any newly
 * completed segment JSON substrings since last call; caller tracks parse
 * cursor via `pos`.
 * ──────────────────────────────────────────────────────────────────────── */
interface IncrementalSegmentParser {
  consume: (buffer: string) => string[];
  /** True after we've seen the segments array close bracket `]`. */
  segmentsClosed: () => boolean;
  /** Cursor into buffer — caller does not touch, but exposes for tests. */
  cursor: () => number;
}

function createSegmentParser(): IncrementalSegmentParser {
  // Phases:
  //   0 — searching for `"segments"` key
  //   1 — searching for the opening `[` that starts the segments array
  //   2 — inside segments array, matching segment objects
  //   3 — done (segments array closed)
  let phase: 0 | 1 | 2 | 3 = 0;
  let pos = 0;
  let depth = 0;
  let inString = false;
  let escape = false;
  let segStart = -1;

  function advanceSearchKey(buffer: string): void {
    // Look for the literal "segments" (as a key). We accept either
    // `"segments"` followed by `:`.
    const re = /"segments"\s*:/g;
    re.lastIndex = pos;
    const m = re.exec(buffer);
    if (!m) {
      // Safe rollback: keep pos at last byte we might need to rescan from.
      pos = Math.max(pos, buffer.length - 16);
      return;
    }
    pos = m.index + m[0].length;
    phase = 1;
  }

  function advanceFindOpenBracket(buffer: string): void {
    while (pos < buffer.length) {
      const ch = buffer[pos];
      if (ch === "[") {
        pos++;
        phase = 2;
        return;
      }
      if (ch === "{" || ch === "\"") {
        // Unexpected — schema said array. Abort gracefully.
        phase = 3;
        return;
      }
      pos++;
    }
  }

  function advanceInArray(buffer: string, out: string[]): void {
    while (pos < buffer.length) {
      const ch = buffer[pos];

      if (inString) {
        if (escape) {
          escape = false;
        } else if (ch === "\\") {
          escape = true;
        } else if (ch === "\"") {
          inString = false;
        }
        pos++;
        continue;
      }

      if (ch === "\"") {
        inString = true;
        pos++;
        continue;
      }

      if (ch === "{") {
        if (depth === 0) {
          segStart = pos;
        }
        depth++;
        pos++;
        continue;
      }

      if (ch === "}") {
        depth--;
        pos++;
        if (depth === 0 && segStart >= 0) {
          const slice = buffer.slice(segStart, pos);
          out.push(slice);
          segStart = -1;
        }
        continue;
      }

      if (ch === "]" && depth === 0) {
        // End of segments array.
        phase = 3;
        pos++;
        return;
      }

      pos++;
    }
  }

  return {
    consume(buffer: string) {
      const out: string[] = [];
      // Loop to allow transitioning multiple phases per call.
      let guard = 0;
      while (guard++ < 8) {
        const before = pos;
        if (phase === 0) advanceSearchKey(buffer);
        if (phase === 1) advanceFindOpenBracket(buffer);
        if (phase === 2) advanceInArray(buffer, out);
        if (phase === 3) break;
        if (pos === before) break; // no progress
      }
      return out;
    },
    segmentsClosed() { return phase === 3; },
    cursor() { return pos; }
  };
}

interface StreamEmitter {
  event: (name: string, data: unknown) => Promise<void>;
  close: () => Promise<void>;
}

function makeSSEResponse(run: (emit: StreamEmitter, signal: AbortSignal) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const controllerAbort = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit: StreamEmitter = {
        async event(name, data) {
          if (closed) return;
          const payload = `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
          try {
            controller.enqueue(encoder.encode(payload));
          } catch {
            // Stream was cancelled by the client (abort) between the closed
            // flag check and the enqueue. Flip the flag so subsequent emits
            // short-circuit instead of re-throwing.
            closed = true;
          }
        },
        async close() {
          if (closed) return;
          closed = true;
          try { controller.close(); } catch { /* noop */ }
        }
      };
      try {
        await run(emit, controllerAbort.signal);
      } catch (err) {
        try {
          const message = err instanceof Error ? err.message : String(err);
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message })}\n\n`));
        } catch { /* noop */ }
      } finally {
        try { controller.close(); } catch { /* noop */ }
      }
    },
    cancel() {
      // Client disconnected — propagate abort to upstream Gemini fetch.
      try { controllerAbort.abort(); } catch { /* noop */ }
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      ...LEARN_PLAN_CORS_HEADERS
    }
  });
}

async function requestPlanOneShot(body: LearnPlanRequest, env: Env): Promise<LearnPlanResponse | null> {
  const geminiData = await callGemini(
    PLAN_MODEL,
    buildSystemPrompt(),
    buildUserPrompt(body),
    buildGenerationConfig() as Parameters<typeof callGemini>[3],
    env
  );
  const raw = extractGeminiText(geminiData);
  return parseJsonResponse<LearnPlanResponse>(raw);
}

async function regenerateRejectedSegment(
  body: LearnPlanRequest,
  currentPlan: LearnPlanResponse,
  segmentId: string,
  answerInTeachRatio: number,
  env: Env
): Promise<LearnPlanSegment | null> {
  const regenerationInstruction =
    `Segment ${segmentId} was rejected. Its expected answer is copyable from its teach (overlap ${answerInTeachRatio.toFixed(3)}). ` +
    `Regenerate ONLY segment ${segmentId}. The new expectedAnswer must require inference, mechanism construction, prediction, or transfer that is NOT stated verbatim in the teach. Keep all other segments unchanged.`;
  const regenUserPrompt = [
    buildUserPrompt(body),
    "",
    "CURRENT_PLAN_JSON:",
    JSON.stringify(currentPlan),
    "",
    regenerationInstruction
  ].join("\n");

  const geminiData = await callGemini(
    PLAN_MODEL,
    buildSystemPrompt(),
    regenUserPrompt,
    buildGenerationConfig() as Parameters<typeof callGemini>[3],
    env
  );
  const raw = extractGeminiText(geminiData);
  const parsed = parseJsonResponse<LearnPlanResponse>(raw);
  if (!parsed || !Array.isArray(parsed.segments)) return null;
  return parsed.segments.find((segment) => String(segment?.id) === segmentId) || null;
}

async function enforceUncopyableSegment(
  segment: LearnPlanSegment,
  currentPlan: LearnPlanResponse,
  body: LearnPlanRequest,
  env: Env
): Promise<LearnPlanSegment> {
  let workingSegment: LearnPlanSegment = { ...segment };
  const maxRetries = 2;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const answerInTeachRatio = computeTokenOverlapRatio(workingSegment.expectedAnswer, workingSegment.teach);
    if (answerInTeachRatio <= 0.6) {
      return workingSegment;
    }
    console.warn("[learn-plan] answer_copyable_from_teach", {
      segmentId: String(workingSegment.id || ""),
      answerInTeachRatio,
      tutorPrompt: String(workingSegment.tutorPrompt || ""),
      expectedAnswer: String(workingSegment.expectedAnswer || ""),
      retryAttemptCount: attempt
    });
    if (attempt > maxRetries) {
      return {
        ...workingSegment,
        questionQualityWarning: "answer_copyable_from_teach"
      };
    }
    const regenerated = await regenerateRejectedSegment(body, currentPlan, String(workingSegment.id || ""), answerInTeachRatio, env);
    if (!regenerated) continue;
    workingSegment = {
      ...workingSegment,
      ...regenerated
    };
  }
  return workingSegment;
}

export async function handleLearnPlan(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: LearnPlanRequest;
  try {
    body = (await request.json()) as LearnPlanRequest;
  } catch (error) {
    return jsonResponse({ error: "Invalid JSON body", detail: error instanceof Error ? error.message : String(error) }, 400);
  }
  const validationError = validateRequest(body);
  if (validationError) return jsonResponse({ error: validationError }, 400);

  const cardCorpus = collectCardCorpus(body.cards);

  return makeSSEResponse(async (emit, signal) => {
    // ── Attempt 1: stream.
    const parser = createSegmentParser();
    let fullBuffer = "";
    const emittedSegments: LearnPlanSegment[] = [];
    const emittedSegmentIds = new Set<string>();

    let streamFailed = false;
    try {
      for await (const chunk of streamGemini(
        PLAN_MODEL,
        buildSystemPrompt(),
        buildUserPrompt(body),
        buildGenerationConfig() as Parameters<typeof streamGemini>[3],
        env,
        signal
      )) {
        fullBuffer += chunk;
        const completed = parser.consume(fullBuffer);
        for (const slice of completed) {
          const seg = parseJsonResponse<LearnPlanSegment>(slice);
          if (!seg || typeof seg !== "object") continue;
          if (!verifySegmentGrounding(seg, cardCorpus)) continue;
          if (!verifySegmentTeach(seg)) continue;
          if (!verifySegmentTutorPrompt(String(seg.tutorPrompt || "")).ok) continue;
          if (!verifySegmentCheckType(seg)) continue;
          const copyCheckedSegment = await enforceUncopyableSegment(
            seg,
            { segments: [seg], consolidationQuestions: [] },
            body,
            env
          );
          if (emittedSegmentIds.has(String(copyCheckedSegment.id))) continue;
          emittedSegmentIds.add(String(copyCheckedSegment.id));
          emittedSegments.push(copyCheckedSegment);
          await emit.event("segment", copyCheckedSegment);
        }
      }
    } catch (err) {
      streamFailed = true;
      console.warn("[learn-plan] stream attempt failed", err);
    }

    // Final parse for consolidationQuestions + any trailing segment we missed.
    const fullParsed = parseJsonResponse<LearnPlanResponse>(fullBuffer);
    if (fullParsed && Array.isArray(fullParsed.segments)) {
      // Backstop: any verified segments not yet emitted (e.g. parser drift).
      for (const seg of fullParsed.segments) {
        if (!seg || typeof seg !== "object") continue;
        if (emittedSegmentIds.has(String(seg.id))) continue;
        if (!verifySegmentGrounding(seg, cardCorpus)) continue;
        if (!verifySegmentTeach(seg)) continue;
        if (!verifySegmentTutorPrompt(String(seg.tutorPrompt || "")).ok) continue;
        if (!verifySegmentCheckType(seg)) continue;
        const copyCheckedSegment = await enforceUncopyableSegment(seg, fullParsed, body, env);
        emittedSegmentIds.add(String(copyCheckedSegment.id));
        emittedSegments.push(copyCheckedSegment);
        await emit.event("segment", copyCheckedSegment);
      }
    }

    let verifiedQs: ConsolidationQuestion[] = [];
    if (fullParsed && Array.isArray(fullParsed.consolidationQuestions)) {
      verifiedQs = filterVerifiedConsolidationQuestions(fullParsed.consolidationQuestions, cardCorpus);
    }

    if (emittedSegments.length >= 2) {
      await emit.event("consolidationQuestions", { questions: verifiedQs });
      await emit.event("complete", {
        segmentCount: emittedSegments.length,
        consolidationCount: verifiedQs.length,
        planMode: streamFailed ? "retry_verified" : "verified",
        warning: verifiedQs.length < 2 ? "Fewer than 2 consolidation questions verified." : undefined
      });
      return;
    }

    // ── Attempt 2: one-shot fallback (non-streaming).
    console.warn("[learn-plan] streaming produced < 2 verified segments; falling back to one-shot.", {
      emittedSegments: emittedSegments.length,
      bufferLength: fullBuffer.length,
      streamFailed
    });

    let secondAttempt: LearnPlanResponse | null = null;
    try {
      secondAttempt = await requestPlanOneShot(body, env);
    } catch (err) {
      console.warn("[learn-plan] one-shot fallback threw", err);
    }

    const verifiedSecondBase = filterVerifiedSegments(secondAttempt?.segments || [], cardCorpus);
    const verifiedSecond: LearnPlanSegment[] = [];
    for (const segment of verifiedSecondBase) {
      const checkedSegment = await enforceUncopyableSegment(
        segment,
        secondAttempt || { segments: verifiedSecondBase, consolidationQuestions: secondAttempt?.consolidationQuestions || [] },
        body,
        env
      );
      verifiedSecond.push(checkedSegment);
    }
    const verifiedSecondQs = filterVerifiedConsolidationQuestions(secondAttempt?.consolidationQuestions || [], cardCorpus);

    if (verifiedSecond.length >= 2) {
      for (const seg of verifiedSecond) {
        if (emittedSegmentIds.has(String(seg.id))) continue;
        emittedSegmentIds.add(String(seg.id));
        emittedSegments.push(seg);
        await emit.event("segment", seg);
      }
      await emit.event("consolidationQuestions", { questions: verifiedSecondQs });
      await emit.event("complete", {
        segmentCount: emittedSegments.length,
        consolidationCount: verifiedSecondQs.length,
        planMode: "retry_verified",
        warning: verifiedSecondQs.length < 2 ? "Fewer than 2 consolidation questions verified." : undefined
      });
      return;
    }

    // ── Attempt 3: density fallback.
    console.warn("[learn-plan] fallback failed, using card-density fallback", {
      verifiedSecond: verifiedSecond.length
    });
    const fallback = buildDensityFallback(body.cards);
    for (const seg of fallback.segments) {
      await emit.event("segment", seg);
    }
    await emit.event("consolidationQuestions", { questions: fallback.consolidationQuestions || [] });
    await emit.event("complete", {
      segmentCount: fallback.segments.length,
      consolidationCount: (fallback.consolidationQuestions || []).length,
      planMode: "card_density_fallback",
      warning: "Grounding verification failed. Used card-density fallback."
    });
  });
}

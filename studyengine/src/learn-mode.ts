import type { AppState, CourseContext, PlanProfile, StudyItem, SubDeckMeta } from './types';
import type { PrequestionState } from './learn-prequestion';
import { createSubDeck, getCardsInScope, getCardsInSubDeck, loadSubDecks } from './sub-decks';
import { runLearnTurn, LearnTurnClientError } from './learn-turn-client';
import { resolveSessionPlanProfile, resolveSessionTargetLanguage } from './plan-profiles';
import { composeLearnerModelFingerprint, computeRecommendedSegmentMix, loadLearnerModel, recordSessionOutcome, saveLearnerModel } from './learner-model/learner-model';

// Re-export for callers that previously imported from `./learn-mode`.
export { runLearnTurn, LearnTurnClientError };

export type LearnStatus = 'unlearned' | 'taught' | 'consolidated' | null;
export type LearnMechanism = 'worked_example' | 'elaborative_interrogation' | 'self_explanation' | 'predictive_question' | 'test_closure';

export interface GroundingSnippet {
  cardId: string;
  quote: string;
}

export interface LearnSegment {
  id: string;
  title: string;
  mechanism: LearnMechanism;
  objective: string;
  /**
   * Declarative pre-retrieval teaching block. Comes verbatim from the worker's
   * /studyengine/learn-plan response. See `verifySegmentTeach` worker-side for
   * the validation contract (>=60 words, not a question, not opening with a
   * banned phrase). Older plans may omit this field; UI treats missing teach
   * as a graceful fall-through to tutorPrompt.
   */
  teach?: string;
  tutorPrompt: string;
  expectedAnswer: string;
  linkedCardIds: string[];
  groundingSnippets: GroundingSnippet[];
  groundingSource?: 'gemini' | 'fallback';
  checkType?: 'elaborative' | 'predictive' | 'self_explain' | 'prior_knowledge_probe' | 'worked_example' | 'transfer_question' | 'cloze';
  fadeLevel?: 1 | 2 | 3;
  workedExampleId?: string;
  isProbe?: boolean;
  prequestion?: PrequestionState;
  learnerStuck?: boolean;
}
export interface StudyCardInput { id: string; prompt: string; modelAnswer: string; sourceMeta?: Record<string, unknown>; }

export interface ConsolidationQuestion {
  question: string;
  answer: string;
  linkedCardIds: string[];
}

export interface LearnPlan {
  segments: LearnSegment[];
  consolidationQuestions?: ConsolidationQuestion[];
  planMode?: 'verified' | 'retry_verified' | 'chunk_verified' | 'chunk_retry_verified' | 'card_density_fallback';
  warning?: string;
  chunk?: { cursor: number; nextCursor: number; hasMore: boolean };
  /** djb2 hash of the sub-deck's card set (id + prompt + modelAnswer) at plan-generation time. Used by the UI to detect whether the active plan is stale vs. the current deck. Optional for legacy plans. */
  subDeckFingerprint?: string;
}

export interface LearnSessionState {
  plan: LearnPlan;
  index: number;
  currentMechanism: LearnMechanism;
  completedSegmentIds: string[];
}

export interface LearnTurnResult {
  verdict?: 'surface' | 'partial' | 'deep';
  understandingScore?: number;
  missingConcepts?: string[];
  followUp?: string | null;
  advance?: boolean;
  feedback: string;
  nextPrompt: string;
  isSegmentComplete: boolean;
  suggestedStatus?: 'taught' | 'consolidated' | null | string;
}

export function capAssistedLearnTurnResult(result: LearnTurnResult, assisted: boolean): LearnTurnResult {
  const rawVerdict = (result && result.verdict) ? result.verdict : 'surface';
  const missingConcepts = Array.isArray(result?.missingConcepts) ? result.missingConcepts.slice() : [];
  if (!assisted) return { ...result, missingConcepts };

  const cappedVerdict = rawVerdict === 'deep'
    ? 'partial'
    : rawVerdict === 'partial'
      ? 'surface'
      : 'surface';
  const demoted = cappedVerdict !== rawVerdict;
  const assistedNote = 'You opened the teach while answering; next time try reconstructing without it first.';
  const followUpBase = result?.followUp == null ? '' : String(result.followUp).trim();
  const followUp = demoted ? (followUpBase ? `${assistedNote}\n\n${followUpBase}` : assistedNote) : result?.followUp ?? null;
  const cappedAdvance = cappedVerdict === 'partial' && missingConcepts.length === 0;

  return {
    ...result,
    verdict: cappedVerdict,
    advance: demoted ? cappedAdvance : (result?.advance ?? cappedAdvance),
    followUp,
    missingConcepts
  };
}

export interface CourseLearnPickerSubDeck {
  key: string;
  name: string;
  stats: {
    total: number;
    consolidated: number;
    unlearned: number;
  };
}

export type CourseLearnEntryResolution =
  | { kind: 'empty-prompt' }
  | { kind: 'single'; subDeckKey: string }
  | { kind: 'picker'; subDecks: CourseLearnPickerSubDeck[] };

interface CourseLike {
  name?: string;
}

const LEARN_PLAN_ENDPOINT = 'https://widget-sync.lordgrape-widgets.workers.dev/studyengine/learn-plan';
export const COURSE_ROOT_SUBDECK_KEY = '__course_root__';
const LEARN_PLAN_STREAM_TIMEOUT_MS = 15_000;
// LEARN_TURN_ENDPOINT moved to `./learn-turn-client.ts` along with `runLearnTurn`.

function normalize(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const LEARN_GATE_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'than', 'that', 'this',
  'these', 'those', 'to', 'of', 'in', 'on', 'for', 'with', 'as', 'by', 'from',
  'at', 'into', 'about', 'it', 'its', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will',
  'what', 'when', 'where', 'who', 'why', 'how', 'which'
]);

function tokenizeForLearnGate(input: string): string[] {
  return normalize(input)
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !LEARN_GATE_STOPWORDS.has(token));
}

function computeTokenOverlapRatio(sourceText: string, targetText: string): number {
  const sourceTokens = Array.from(new Set(tokenizeForLearnGate(sourceText)));
  const targetTokens = Array.from(new Set(tokenizeForLearnGate(targetText)));
  if (sourceTokens.length === 0) return 1;
  const targetSet = new Set(targetTokens);
  const overlapCount = sourceTokens.filter((token) => targetSet.has(token)).length;
  return overlapCount / sourceTokens.length;
}

function shortDjb2Hash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(-8);
}

export function fingerprintLearnInputs(args: {
  cardIds: string[];
  cardFingerprint?: string;
  courseContext?: CourseContext;
}): string {
  const cardIds = Array.isArray(args.cardIds)
    ? args.cardIds.map((id) => String(id || ''))
    : [];
  const cardHash = args.cardFingerprint
    ? String(args.cardFingerprint)
    : shortDjb2Hash(cardIds.join('|'));
  if (!args.courseContext) return cardHash;
  const contextHash = shortDjb2Hash(JSON.stringify(args.courseContext));
  return `${cardHash}:${contextHash}`;
}

export function fingerprintSubDeckCards(cards: StudyItem[]): string {
  const fingerprintInput = (cards || [])
    .slice()
    .sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')))
    .map((card) => `${String(card?.id || '')}|${String(card?.prompt || '').trim()}|${String(card?.modelAnswer || '').trim()}`)
    .join('\n');
  return shortDjb2Hash(fingerprintInput);
}

export function verifyConsolidationQuestions(questions: ConsolidationQuestion[], items: StudyItem[]): ConsolidationQuestion[] {
  const cardMap = new Map<string, string>();
  (items || []).forEach((item) => {
    if (!item || !item.id) return;
    cardMap.set(item.id, `${item.prompt || ''}\n${item.modelAnswer || ''}`);
  });
  return (questions || []).filter((q) => {
    if (!q || !q.question || !q.answer) return false;
    const linked = Array.isArray(q.linkedCardIds) ? q.linkedCardIds : [];
    if (linked.length === 0) return false;
    const ans = normalize(q.answer);
    if (!ans || ans.length < 10) return false;
    const anchor = ans.length > 200 ? ans.slice(0, 200) : ans;
    return linked.some((cardId) => {
      const source = cardMap.get(String(cardId || ''));
      if (!source) return false;
      return normalize(source).includes(anchor);
    });
  });
}

export function substringVerified(segments: LearnSegment[], items: StudyItem[]): LearnSegment[] {
  const cardMap = new Map<string, string>();
  (items || []).forEach((item) => {
    if (!item || !item.id) return;
    cardMap.set(item.id, `${item.prompt || ''}\n${item.modelAnswer || ''}`);
  });

  return (segments || []).filter((segment) => {
    if (!Array.isArray(segment.groundingSnippets) || segment.groundingSnippets.length === 0) return false;
    return segment.groundingSnippets.every((snippet) => {
      const source = cardMap.get(String(snippet.cardId || ''));
      if (!source) return false;
      const quote = normalize(snippet.quote || '');
      if (!quote || quote.length < 10) return false;
      if (normalize(source).includes(quote)) return true;
      const teachRatio = computeTokenOverlapRatio(source, String(segment.teach || ''));
      const tutorRatio = computeTokenOverlapRatio(source, String(segment.tutorPrompt || ''));
      return teachRatio >= 0.4 && tutorRatio >= 0.15;
    });
  });
}

export async function generateLearnPlan(course: string, subDeck: string, items: StudyItem[], state?: AppState, userName = '', learnerContext = ''): Promise<LearnPlan> {
  const subDeckCards = getCardsInSubDeck(course, subDeck, items);
  const cards = subDeckCards.map((item) => ({
    id: item.id,
    prompt: item.prompt,
    modelAnswer: item.modelAnswer
  }));
  const planProfile = resolveLearnPlanProfile(subDeckCards, state);
  const targetLanguage = resolveSessionLanguageTarget(subDeckCards, state);
  const languageLevel = resolveSessionLanguageLevel(subDeckCards, state);

  const response = await fetch(LEARN_PLAN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      course,
      subDeck,
      cards,
      planProfile,
      targetLanguage,
      languageLevel,
      userName,
      learnerContext
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Learn plan failed: ${detail}`);
  }

  const data = (await response.json()) as LearnPlan;
  const verifiedSegments = substringVerified(data.segments || [], subDeckCards);
  if (verifiedSegments.length < 2) {
    throw new Error('Learn plan grounding verification failed: fewer than 2 verified segments.');
  }
  const verifiedQuestions = verifyConsolidationQuestions(data.consolidationQuestions || [], subDeckCards);
  const subDeckFingerprint = fingerprintSubDeckCards(subDeckCards);

  return { ...data, segments: verifiedSegments, consolidationQuestions: verifiedQuestions, subDeckFingerprint };
}

export async function generateCourseLearnPlan(
  course: string,
  items: StudyItem[],
  state: AppState,
  userName = '',
  learnerContext = ''
): Promise<LearnPlan> {
  const courseCards = getCardsInScope(course, null, items, state, { includeArchivedSubDecks: false });
  const cards = courseCards.map((item) => ({
    id: item.id,
    prompt: item.prompt,
    modelAnswer: item.modelAnswer
  }));

  const response = await fetch(LEARN_PLAN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      course,
      subDeck: COURSE_ROOT_SUBDECK_KEY,
      cards,
      planProfile: resolveLearnPlanProfile(courseCards, state),
      userName,
      learnerContext
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Learn plan failed: ${detail}`);
  }

  const data = (await response.json()) as LearnPlan;
  const verifiedSegments = substringVerified(data.segments || [], courseCards);
  if (verifiedSegments.length < 2) {
    throw new Error('Learn plan grounding verification failed: fewer than 2 verified segments.');
  }
  const verifiedQuestions = verifyConsolidationQuestions(data.consolidationQuestions || [], courseCards);
  const subDeckFingerprint = fingerprintSubDeckCards(courseCards);
  return { ...data, segments: verifiedSegments, consolidationQuestions: verifiedQuestions, subDeckFingerprint };
}

export function startLearnSession(plan: LearnPlan): LearnSessionState {
  const first = (plan.segments && plan.segments[0]) || null;
  return {
    plan,
    index: 0,
    currentMechanism: first ? first.mechanism : 'worked_example',
    completedSegmentIds: []
  };
}

/**
 * Streaming variant of `generateLearnPlan`.
 *
 * Opens an SSE connection to /studyengine/learn-plan and dispatches events
 * to the provided handlers as they arrive. Returns a promise that resolves
 * when the stream has ended (either `complete`, `error`, or connection
 * close). Forwards the AbortSignal to `fetch()` so aborting propagates
 * upstream and closes the Gemini stream on the worker (freeing tokens).
 *
 * Graceful fallback: if the server responds with a non-`text/event-stream`
 * Content-Type (e.g., a 500 JSON error payload or a proxy that stripped
 * SSE), we buffer the full body and attempt a legacy one-shot parse of
 * `{segments, consolidationQuestions}` and emit it via the handlers.
 *
 * All server-side segments are already grounding-verified per spec, but
 * we run `substringVerified` / `verifyConsolidationQuestions` again
 * client-side as a defense-in-depth — a drift-resistant check that
 * survives future worker changes.
 */
export interface StreamLearnPlanHandlers {
  onSegment?: (segment: LearnSegment, meta?: { groundingSource?: 'gemini' | 'fallback' }) => void;
  onConsolidationQuestions?: (questions: ConsolidationQuestion[]) => void;
  onComplete?: (meta: { segmentCount: number; consolidationCount: number; planMode?: string; warning?: string; subDeckFingerprint?: string; budgetDegraded?: { reason?: string; resetAt?: string }; chunk?: { cursor: number; nextCursor: number; hasMore: boolean } }) => void;
  onError?: (message: string, opts?: { hasSegments: boolean }) => void;
  onPriorKnowledgeProbe?: (card: StudyCardInput) => Promise<'surface' | 'partial' | 'deep'>;
  getDeepVerdictCount?: () => number;
  onPlanProfileResolved?: (profile: PlanProfile) => void;
}

export interface StreamLearnPlanOptions {
  forceFresh?: boolean;
  segmentLimit?: number;
  chunked?: boolean;
  chunkCursor?: number;
  chunkTotal?: number;
  includeConsolidation?: boolean;
}

function getSubDeckMetaForCard(card: StudyItem, state?: AppState): SubDeckMeta | null {
  const courseName = card?.course ? String(card.course) : '';
  const subDeckKey = card?.subDeck ? String(card.subDeck) : '';
  if (!state || !courseName || !subDeckKey) return null;
  return state.subDecks?.[courseName]?.[subDeckKey] ?? null;
}

function getCourseForCard(card: StudyItem, state?: AppState): AppState['courses'][string] | null {
  const courseName = card?.course ? String(card.course) : '';
  if (!state || !courseName) return null;
  return state.courses?.[courseName] ?? null;
}

function resolveLearnPlanProfile(cards: StudyItem[], state?: AppState): PlanProfile {
  if (state?.studyEngineFeatures?.run3Profiles === false) return 'theory';
  const resolved = resolveSessionPlanProfile(
    cards,
    (card) => getSubDeckMetaForCard(card, state),
    (card) => getCourseForCard(card, state)
  );
  if (state?.studyEngineFeatures?.run5Language === false && resolved === 'language') return 'theory';
  return resolved;
}

function resolveSessionLanguageTarget(cards: StudyItem[], state?: AppState): string | undefined {
  if (state?.studyEngineFeatures?.run5Language === false) return undefined;
  return resolveSessionTargetLanguage(
    cards,
    (card) => getSubDeckMetaForCard(card, state),
    (card) => getCourseForCard(card, state)
  );
}

function resolveSessionLanguageLevel(cards: StudyItem[], state?: AppState): number | undefined {
  if (state?.studyEngineFeatures?.run5Language === false) return undefined;
  const tally: Record<number, number> = {};
  cards.forEach((card) => {
    const sd = getSubDeckMetaForCard(card, state);
    const course = getCourseForCard(card, state) as any;
    const level = Number((card as any).languageLevel ?? (sd as any)?.languageLevel ?? course?.languageLevel ?? 0);
    if (!Number.isFinite(level) || level < 1 || level > 6) return;
    tally[level] = (tally[level] || 0) + 1;
  });
  const levels = Object.keys(tally).map(Number).sort((a, b) => (tally[b] - tally[a]) || (a - b));
  return levels[0];
}

export function pickProbeCard(cards: StudyCardInput[]): StudyCardInput | null {
  if (!Array.isArray(cards) || cards.length <= 5) return null;
  const sorted = cards.slice().sort((a, b) => {
    const aw = String(a.modelAnswer || '').trim().split(/\s+/).filter(Boolean).length;
    const bw = String(b.modelAnswer || '').trim().split(/\s+/).filter(Boolean).length;
    if (aw !== bw) return aw - bw;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
  return sorted[Math.floor(sorted.length / 2)] || null;
}

export function classifyComplexCards(cards: StudyCardInput[]): string[] {
  return (cards || []).filter((card) => {
    const wordCount = String(card.modelAnswer || '').trim().split(/\s+/).filter(Boolean).length;
    const depth = Number((card as any)?.sourceMeta?.qec?.eDepth ?? (card as any)?.sourceMeta?.eDepth ?? 0);
    return wordCount > 50 || depth > 2;
  }).map((card) => card.id);
}

export async function runPriorKnowledgeProbe(
  cards: StudyCardInput[],
  _course: string,
  _subDeck: string,
  handlers?: StreamLearnPlanHandlers
): Promise<'high' | 'mixed' | 'low'> {
  const probeCard = pickProbeCard(cards);
  if (!probeCard || !handlers?.onPriorKnowledgeProbe) return 'mixed';
  const verdict = await handlers.onPriorKnowledgeProbe(probeCard);
  if (verdict === 'deep') return 'high';
  if (verdict === 'surface') return 'low';
  return 'mixed';
}

export async function streamLearnPlan(
  course: string,
  subDeck: string,
  items: StudyItem[],
  state: AppState | undefined,
  userName = '',
  learnerContext = '',
  handlers: StreamLearnPlanHandlers = {},
  signal?: AbortSignal,
  options: StreamLearnPlanOptions = {}
): Promise<void> {
  const subDeckCards = getCardsInSubDeck(course, subDeck, items);
  const subDeckFingerprint = fingerprintSubDeckCards(subDeckCards);
  const planProfile = resolveLearnPlanProfile(subDeckCards, state);
  const targetLanguage = resolveSessionLanguageTarget(subDeckCards, state);
  const languageLevel = resolveSessionLanguageLevel(subDeckCards, state);
  handlers.onPlanProfileResolved?.(planProfile);
  const payload = {
    course,
    subDeck,
    cards: subDeckCards.map((item) => ({ id: item.id, prompt: item.prompt, modelAnswer: item.modelAnswer })),
    userName,
    learnerContext,
    planProfile,
    targetLanguage,
    languageLevel,
    priorKnowledge: await runPriorKnowledgeProbe(
      subDeckCards.map((item) => ({ id: item.id, prompt: item.prompt, modelAnswer: item.modelAnswer })),
      course,
      subDeck,
      handlers
    ),
    appendTransferQuestion: (handlers.getDeepVerdictCount?.() || 0) >= 3,
    segmentLimit: Number.isFinite(Number(options.segmentLimit)) ? Math.max(1, Math.floor(Number(options.segmentLimit))) : undefined,
    chunked: options.chunked === true ? true : undefined,
    chunkCursor: Number.isFinite(Number(options.chunkCursor)) ? Math.max(0, Math.floor(Number(options.chunkCursor))) : undefined,
    chunkTotal: Number.isFinite(Number(options.chunkTotal)) ? Math.max(0, Math.floor(Number(options.chunkTotal))) : undefined,
    includeConsolidation: options.includeConsolidation === true ? true : undefined,
    forceFresh: options.forceFresh === true ? true : undefined
  };
  attachLearnerModelPayload(payload as Record<string, unknown>, state);

  let emittedCount = 0;

  const emitSegment = (
    seg: LearnSegment,
    meta?: { groundingSource?: 'gemini' | 'fallback' }
  ): void => {
    const verified = substringVerified([seg], subDeckCards);
    if (verified.length === 0) return;
    emittedCount += 1;
    handlers.onSegment?.(verified[0], meta);
  };

  const emitQuestions = (qs: ConsolidationQuestion[]): void => {
    const verified = verifyConsolidationQuestions(qs || [], subDeckCards);
    handlers.onConsolidationQuestions?.(verified);
  };

  let response: Response;
  try {
    response = await fetch(LEARN_PLAN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      body: JSON.stringify(payload),
      signal
    });
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') return;
    handlers.onError?.(`Learn plan failed: ${(err as Error).message || String(err)}`, { hasSegments: false });
    return;
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const isSSE = contentType.includes('text/event-stream');

  // ── Legacy fallback path: non-SSE response (proxy stripped, server errored, or legacy route).
  if (!isSSE || !response.body) {
    let bodyText = '';
    try { bodyText = await response.text(); } catch { /* noop */ }
    if (!response.ok) {
      handlers.onError?.(`Learn plan failed: ${bodyText || response.status}`, { hasSegments: false });
      return;
    }
    let parsed: LearnPlan | null = null;
    try { parsed = JSON.parse(bodyText) as LearnPlan; } catch { parsed = null; }
    if (!parsed) {
      handlers.onError?.('Learn plan response was not parseable JSON.', { hasSegments: false });
      return;
    }
    parsed.subDeckFingerprint = subDeckFingerprint;
    const segments = substringVerified(parsed.segments || [], subDeckCards);
    if (segments.length < 2) {
      handlers.onError?.('Learn plan grounding verification failed: fewer than 2 verified segments.', { hasSegments: false });
      return;
    }
    for (const seg of segments) {
      emittedCount += 1;
      handlers.onSegment?.(seg);
    }
    const qs = verifyConsolidationQuestions(parsed.consolidationQuestions || [], subDeckCards);
    handlers.onConsolidationQuestions?.(qs);
    handlers.onComplete?.({
      segmentCount: segments.length,
      consolidationCount: qs.length,
      planMode: parsed.planMode,
      warning: parsed.warning,
      subDeckFingerprint
    });
    return;
  }

  // ── SSE happy path.
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawFatalError = false;
  // B4-2: timeout stalled streams so UI can continue with partial/default plan.
  let streamTimedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const resetStreamTimeout = () => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    timeoutHandle = setTimeout(async () => {
      streamTimedOut = true;
      try { await reader.cancel(); } catch { /* noop */ }
      handlers.onError?.('Plan generation timed out — using default order', { hasSegments: emittedCount > 0 });
    }, LEARN_PLAN_STREAM_TIMEOUT_MS);
  };
  resetStreamTimeout();

  const handleSSEEvent = (rawEvent: string): void => {
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of rawEvent.split(/\r?\n/)) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).replace(/^ /, ''));
      }
    }
    if (!dataLines.length) return;
    let data: unknown;
    try { data = JSON.parse(dataLines.join('\n')); } catch { return; }

    if (eventName === 'segment' && data && typeof data === 'object') {
      const payload = data as LearnSegment & {
        groundingSource?: 'gemini' | 'fallback';
        origin?: 'gemini' | 'fallback';
        source?: 'gemini' | 'fallback';
      };
      // TODO(learn-stats): worker segment events currently do not emit a stable
      // origin marker. Keep undefined until protocol adds one; metric handles it.
      const groundingSource = payload.groundingSource ?? payload.origin ?? payload.source;
      emitSegment(payload, { groundingSource });
    } else if (eventName === 'consolidationQuestions' && data && typeof data === 'object') {
      const qs = (data as { questions?: ConsolidationQuestion[] }).questions;
      if (Array.isArray(qs)) emitQuestions(qs);
    } else if (eventName === 'complete' && data && typeof data === 'object') {
      const completeMeta = data as { segmentCount: number; consolidationCount: number; planMode?: string; warning?: string; budgetDegraded?: { reason?: string; resetAt?: string }; chunk?: { cursor: number; nextCursor: number; hasMore: boolean } };
      handlers.onComplete?.({ ...completeMeta, subDeckFingerprint });
    } else if (eventName === 'error' && data && typeof data === 'object') {
      sawFatalError = true;
      const message = String((data as { message?: string }).message || 'Learn plan stream error');
      handlers.onError?.(message, { hasSegments: emittedCount > 0 });
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      resetStreamTimeout();
      buffer += decoder.decode(value, { stream: true });
      // Partial-chunk buffering: split on blank-line separators, keep remainder.
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) >= 0) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        try {
          handleSSEEvent(rawEvent);
        } catch (innerErr) {
          // SSE parse threw mid-stream — spec says fall back to legacy one-shot.
          console.warn('[streamLearnPlan] SSE handler threw; aborting stream', innerErr);
          try { await reader.cancel(); } catch { /* noop */ }
          handlers.onError?.('Learn plan stream parse failed.', { hasSegments: emittedCount > 0 });
          return;
        }
      }
    }
    // Flush trailing buffered event if any.
    const tail = buffer.trim();
    if (tail) {
      try { handleSSEEvent(tail); } catch { /* noop */ }
    }
    if (!streamTimedOut && !sawFatalError && emittedCount === 0) {
      handlers.onError?.('Learn plan stream ended without any segments.', { hasSegments: false });
    }
  } catch (err) {
    if (streamTimedOut) return;
    if ((err as { name?: string }).name === 'AbortError') return;
    handlers.onError?.(`Learn plan stream failed: ${(err as Error).message || String(err)}`, { hasSegments: emittedCount > 0 });
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    try { reader.releaseLock(); } catch { /* noop */ }
  }
}

export async function streamCourseLearnPlan(
  course: string,
  items: StudyItem[],
  state: AppState,
  userName = '',
  learnerContext = '',
  handlers: StreamLearnPlanHandlers = {},
  signal?: AbortSignal,
  options: StreamLearnPlanOptions = {}
): Promise<void> {
  const courseCards = getCardsInScope(course, null, items, state, { includeArchivedSubDecks: false });
  const subDeckFingerprint = fingerprintSubDeckCards(courseCards);
  const planProfile = resolveLearnPlanProfile(courseCards, state);
  const targetLanguage = resolveSessionLanguageTarget(courseCards, state);
  const languageLevel = resolveSessionLanguageLevel(courseCards, state);
  handlers.onPlanProfileResolved?.(planProfile);
  const payload = {
    course,
    subDeck: COURSE_ROOT_SUBDECK_KEY,
    cards: courseCards.map((item) => ({ id: item.id, prompt: item.prompt, modelAnswer: item.modelAnswer })),
    userName,
    learnerContext,
    planProfile,
    targetLanguage,
    languageLevel,
    priorKnowledge: await runPriorKnowledgeProbe(
      courseCards.map((item) => ({ id: item.id, prompt: item.prompt, modelAnswer: item.modelAnswer })),
      course,
      COURSE_ROOT_SUBDECK_KEY,
      handlers
    ),
    appendTransferQuestion: (handlers.getDeepVerdictCount?.() || 0) >= 3,
    segmentLimit: Number.isFinite(Number(options.segmentLimit)) ? Math.max(1, Math.floor(Number(options.segmentLimit))) : undefined,
    chunked: options.chunked === true ? true : undefined,
    chunkCursor: Number.isFinite(Number(options.chunkCursor)) ? Math.max(0, Math.floor(Number(options.chunkCursor))) : undefined,
    chunkTotal: Number.isFinite(Number(options.chunkTotal)) ? Math.max(0, Math.floor(Number(options.chunkTotal))) : undefined,
    includeConsolidation: options.includeConsolidation === true ? true : undefined,
    forceFresh: options.forceFresh === true ? true : undefined
  };
  attachLearnerModelPayload(payload as Record<string, unknown>, state);

  return streamLearnPlanInternal(payload, courseCards, subDeckFingerprint, handlers, signal);
}

async function streamLearnPlanInternal(
  payload: { course: string; subDeck: string; cards: Array<{ id: string; prompt: string; modelAnswer: string }>; userName: string; learnerContext: string; planProfile: PlanProfile; targetLanguage?: string; languageLevel?: number; priorKnowledge?: 'high' | 'mixed' | 'low'; appendTransferQuestion?: boolean; segmentLimit?: number; chunked?: boolean; chunkCursor?: number; chunkTotal?: number; includeConsolidation?: boolean; forceFresh?: boolean; learnerModelFingerprint?: string; learnerModelHint?: { recommendedSegmentMix: Record<string, number>; overconfidenceBias: number; profileDeepRate: Record<string, number>; sourceTypeLapseRate: Record<string, number>; }; },
  sourceCards: StudyItem[],
  subDeckFingerprint: string,
  handlers: StreamLearnPlanHandlers = {},
  signal?: AbortSignal
): Promise<void> {
  let emittedCount = 0;
  const emitSegment = (seg: LearnSegment, meta?: { groundingSource?: 'gemini' | 'fallback' }): void => {
    const verified = substringVerified([seg], sourceCards);
    if (!verified.length) return;
    emittedCount += 1;
    handlers.onSegment?.(verified[0], meta);
  };
  const emitQuestions = (qs: ConsolidationQuestion[]): void => {
    const verified = verifyConsolidationQuestions(qs || [], sourceCards);
    handlers.onConsolidationQuestions?.(verified);
  };
  let response: Response;
  try {
    response = await fetch(LEARN_PLAN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      body: JSON.stringify(payload),
      signal
    });
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') return;
    handlers.onError?.(`Learn plan failed: ${(err as Error).message || String(err)}`, { hasSegments: false });
    return;
  }
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const isSSE = contentType.includes('text/event-stream');
  if (!isSSE || !response.body) {
    let bodyText = '';
    try { bodyText = await response.text(); } catch { /* noop */ }
    if (!response.ok) {
      handlers.onError?.(`Learn plan failed: ${bodyText || response.status}`, { hasSegments: false });
      return;
    }
    let parsed: LearnPlan | null = null;
    try { parsed = JSON.parse(bodyText) as LearnPlan; } catch { parsed = null; }
    if (!parsed) {
      handlers.onError?.('Learn plan response was not parseable JSON.', { hasSegments: false });
      return;
    }
    parsed.subDeckFingerprint = subDeckFingerprint;
    const segments = substringVerified(parsed.segments || [], sourceCards);
    if (segments.length < 2) {
      handlers.onError?.('Learn plan grounding verification failed: fewer than 2 verified segments.', { hasSegments: false });
      return;
    }
    for (const seg of segments) {
      emittedCount += 1;
      handlers.onSegment?.(seg);
    }
    const qs = verifyConsolidationQuestions(parsed.consolidationQuestions || [], sourceCards);
    handlers.onConsolidationQuestions?.(qs);
    handlers.onComplete?.({
      segmentCount: segments.length,
      consolidationCount: qs.length,
      planMode: parsed.planMode,
      warning: parsed.warning,
      subDeckFingerprint
    });
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawFatalError = false;
  // B4-2: timeout stalled streams so UI can continue with partial/default plan.
  let streamTimedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const resetStreamTimeout = () => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    timeoutHandle = setTimeout(async () => {
      streamTimedOut = true;
      try { await reader.cancel(); } catch { /* noop */ }
      handlers.onError?.('Plan generation timed out — using default order', { hasSegments: emittedCount > 0 });
    }, LEARN_PLAN_STREAM_TIMEOUT_MS);
  };
  resetStreamTimeout();
  const handleSSEEvent = (rawEvent: string): void => {
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of rawEvent.split(/\r?\n/)) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    if (!dataLines.length) return;
    let data: unknown;
    try { data = JSON.parse(dataLines.join('\n')); } catch { return; }
    if (eventName === 'segment' && data && typeof data === 'object') {
      const segmentPayload = data as LearnSegment & { groundingSource?: 'gemini' | 'fallback'; origin?: 'gemini' | 'fallback'; source?: 'gemini' | 'fallback'; };
      const groundingSource = segmentPayload.groundingSource ?? segmentPayload.origin ?? segmentPayload.source;
      emitSegment(segmentPayload, { groundingSource });
    } else if (eventName === 'consolidationQuestions' && data && typeof data === 'object') {
      const qs = (data as { questions?: ConsolidationQuestion[] }).questions;
      if (Array.isArray(qs)) emitQuestions(qs);
    } else if (eventName === 'complete' && data && typeof data === 'object') {
      const completeMeta = data as { segmentCount: number; consolidationCount: number; planMode?: string; warning?: string; budgetDegraded?: { reason?: string; resetAt?: string }; chunk?: { cursor: number; nextCursor: number; hasMore: boolean } };
      handlers.onComplete?.({ ...completeMeta, subDeckFingerprint });
    } else if (eventName === 'error' && data && typeof data === 'object') {
      sawFatalError = true;
      const message = String((data as { message?: string }).message || 'Learn plan stream error');
      handlers.onError?.(message, { hasSegments: emittedCount > 0 });
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      resetStreamTimeout();
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) >= 0) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        try { handleSSEEvent(rawEvent); }
        catch (innerErr) {
          console.warn('[streamLearnPlan] SSE handler threw; aborting stream', innerErr);
          try { await reader.cancel(); } catch { /* noop */ }
          handlers.onError?.('Learn plan stream parse failed.', { hasSegments: emittedCount > 0 });
          return;
        }
      }
    }
    const tail = buffer.trim();
    if (tail) {
      try { handleSSEEvent(tail); } catch { /* noop */ }
    }
    if (!streamTimedOut && !sawFatalError && emittedCount === 0) {
      handlers.onError?.('Learn plan stream ended without any segments.', { hasSegments: false });
    }
  } catch (err) {
    if (streamTimedOut) return;
    if ((err as { name?: string }).name === 'AbortError') return;
    handlers.onError?.(`Learn plan stream failed: ${(err as Error).message || String(err)}`, { hasSegments: emittedCount > 0 });
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    try { reader.releaseLock(); } catch { /* noop */ }
  }
}


export async function runRelearningBurst(item: StudyItem, userName = ''): Promise<LearnTurnResult> {
  const segment: LearnSegment = {
    id: `relearn-${item.id}`,
    title: 'Relearning burst',
    mechanism: 'self_explanation',
    objective: 'Rebuild understanding for a lapsed card.',
    teach: item.modelAnswer || '',
    tutorPrompt: item.prompt || '',
    expectedAnswer: item.modelAnswer || '',
    linkedCardIds: [item.id],
    groundingSnippets: []
  };
  const session: LearnSessionState = {
    plan: { segments: [segment] },
    index: 0,
    currentMechanism: segment.mechanism,
    completedSegmentIds: []
  };
  return runLearnTurn(session, '', userName, { segmentLimit: 1 });
}

// `runLearnTurn` now lives in `./learn-turn-client.ts` and is re-exported at
// the top of this file. The module-level re-export preserves the
// `__studyEngineLearnMode.runLearnTurn` bridge signature consumed from
// studyengine.html (`modeBridge.runLearnTurn(...)` in `submitLearnTurn`).

export function completeLearnSegment(session: LearnSessionState, segmentId: string): void {
  if (!session.completedSegmentIds.includes(segmentId)) {
    session.completedSegmentIds.push(segmentId);
  }
  if (session.index < session.plan.segments.length - 1) {
    session.index += 1;
    session.currentMechanism = session.plan.segments[session.index].mechanism;
  }
}

export function getCoverageStats(course: string, subDeck: string, items: StudyItem[]): {
  total: number;
  taught: number;
  consolidated: number;
  unlearned: number;
  pctUnlearned: number;
} {
  const cards = getCardsInSubDeck(course, subDeck, items);
  let taught = 0;
  let consolidated = 0;
  let unlearned = 0;

  cards.forEach((card) => {
    const status = (card.learnStatus ?? null) as LearnStatus;
    if (status === 'consolidated') consolidated += 1;
    else if (status === 'taught') taught += 1;
    else if (status === 'unlearned') unlearned += 1;
  });

  return {
    total: cards.length,
    taught,
    consolidated,
    unlearned,
    pctUnlearned: cards.length ? Math.round((unlearned / cards.length) * 100) : 0
  };
}

export function maybeDemoteOnAgain(item: StudyItem, rating: 1 | 2 | 3 | 4): boolean {
  if (rating === 1 && item.learnStatus === 'consolidated') {
    item.learnStatus = 'taught';
    return true;
  }
  return false;
}

export function deriveLifecycleStage(item: StudyItem): StudyItem['lifecycleStage'] {
  if (item.suspended === true && item.archived === true) return 'retired';
  if (item.fsrs?.state === 'relearning') return 'relearning';
  if (item.learnStatus === 'consolidated' && item.fsrs?.state === 'review') return 'maintaining';
  if (item.learnStatus === 'taught') return 'consolidating';
  if (item.learnStatus === 'unlearned') return 'encoding';
  if (item.learnStatus == null && !item.fsrs?.lastReview) return 'new';
  if (item.fsrs?.lastReview) return 'maintaining';
  return 'new';
}

export function setLifecycleStage(item: StudyItem, stage: StudyItem['lifecycleStage']): void {
  item.lifecycleStage = stage;
}

export function applyLearnStatusMigration(items: Record<string, StudyItem>): void {
  Object.keys(items || {}).forEach((itemId) => {
    const item = items[itemId];
    if (!item) return;
    if (typeof item.learnStatus === 'undefined') {
      item.learnStatus = null;
    }
    if (typeof item.consolidationRating === 'undefined') {
      item.consolidationRating = null;
    }
  });
  Object.keys(items || {}).forEach((itemId) => {
    const item = items[itemId];
    if (!item) return;
    setLifecycleStage(item, deriveLifecycleStage(item));
  });
}

function getCourseName(course: CourseLike | string): string {
  if (typeof course === 'string') return String(course || '').trim();
  return String(course?.name || '').trim();
}

export function getCourseSubDeckEntries(courseName: string, state: AppState): Array<{ key: string; meta: SubDeckMeta }> {
  const map = (state?.subDecks && state.subDecks[courseName]) ? state.subDecks[courseName] : {};
  return Object.keys(map || {})
    .filter((key) => key !== COURSE_ROOT_SUBDECK_KEY)
    .map((key) => ({ key, meta: map[key] }))
    .filter((entry) => !!entry.meta)
    .sort((a, b) => {
      const ao = typeof a.meta.order === 'number' ? a.meta.order : 0;
      const bo = typeof b.meta.order === 'number' ? b.meta.order : 0;
      if (ao !== bo) return ao - bo;
      return String(a.meta.name || '').localeCompare(String(b.meta.name || ''));
    });
}

function findSubDeckKeyByName(courseName: string, state: AppState, targetName: string): string | null {
  const needle = String(targetName || '').trim().toLowerCase();
  if (!needle) return null;
  const entries = getCourseSubDeckEntries(courseName, state);
  for (const entry of entries) {
    if (String(entry.meta.name || '').trim().toLowerCase() === needle) {
      return entry.key;
    }
  }
  return null;
}

export function resolveCourseLearnEntry(course: CourseLike | string, state: AppState): CourseLearnEntryResolution {
  const courseName = getCourseName(course);
  const subDeckEntries = getCourseSubDeckEntries(courseName, state);
  const rootEntries = subDeckEntries.filter((entry) => !entry.meta.parentSubDeck);
  if (rootEntries.length === 0) return { kind: 'empty-prompt' };
  if (rootEntries.length === 1) {
    const onlyRoot = rootEntries[0];
    const hasChildren = subDeckEntries.some((entry) => entry.meta.parentSubDeck === onlyRoot.key);
    if (!hasChildren) return { kind: 'single', subDeckKey: onlyRoot.key };
  }

  const items = Object.keys(state?.items || {}).map((id) => state.items[id]).filter((item): item is StudyItem => !!item);
  const subDecks: CourseLearnPickerSubDeck[] = [
    {
      key: COURSE_ROOT_SUBDECK_KEY,
      name: 'Whole course',
      stats: (() => {
        const coverage = getCardsInScope(courseName, null, items, state, { includeArchivedSubDecks: false });
        let consolidated = 0;
        let unlearned = 0;
        coverage.forEach((card) => {
          const status = (card.learnStatus ?? null) as LearnStatus;
          if (status === 'consolidated') consolidated += 1;
          else if (status === 'unlearned') unlearned += 1;
        });
        return { total: coverage.length, consolidated, unlearned };
      })()
    },
    ...subDeckEntries.map((entry) => {
    const coverage = getCoverageStats(courseName, entry.key, items);
    return {
      key: entry.key,
      name: String(entry.meta.name || entry.key),
      stats: {
        total: Number(coverage.total || 0),
        consolidated: Number(coverage.consolidated || 0),
        unlearned: Number(coverage.unlearned || 0),
      }
    };
  })];
  return { kind: 'picker', subDecks };
}

export function createDefaultSubDeckForCourse(course: CourseLike | string, state: AppState): string {
  const courseName = getCourseName(course);
  const existingKey = findSubDeckKeyByName(courseName, state, 'All cards');
  if (existingKey) return existingKey;

  loadSubDecks(state);
  createSubDeck(courseName, 'All cards');
  const createdKey = findSubDeckKeyByName(courseName, state, 'All cards');
  if (!createdKey) {
    throw new Error('Could not create default sub-deck.');
  }

  Object.keys(state.items || {}).forEach((itemId) => {
    const item = state.items[itemId];
    if (!item || item.course !== courseName) return;
    item.subDeck = createdKey;
  });

  return createdKey;
}

function attachLearnerModelPayload(payload: Record<string, unknown>, state?: AppState): void {
  if (state?.studyEngineFeatures?.run6Adaptive === false) return;
  const model = loadLearnerModel();
  const mix = computeRecommendedSegmentMix(model);
  payload.learnerModelFingerprint = composeLearnerModelFingerprint(model);
  payload.learnerModelHint = {
    recommendedSegmentMix: mix,
    overconfidenceBias: Number(model.calibration?.overconfidenceBias || 0),
    profileDeepRate: Object.keys(model.profileSuccess || {}).reduce((acc, key) => {
      const deep = Number((model.profileSuccess as Record<string, { deepRate?: number }>)[key]?.deepRate || 0);
      acc[key] = deep;
      return acc;
    }, {} as Record<string, number>),
    sourceTypeLapseRate: { ...(model.sourceTypeLapseRate as Record<string, number> || {}) }
  };
}

export function recordLearnSessionOutcome(summary: Parameters<typeof recordSessionOutcome>[1]): void {
  const next = recordSessionOutcome(loadLearnerModel(), summary);
  saveLearnerModel(next);
}

(globalThis as typeof globalThis & { __studyEngineLearnMode?: Record<string, unknown> }).__studyEngineLearnMode = {
  generateLearnPlan,
  generateCourseLearnPlan,
  streamLearnPlan,
  streamCourseLearnPlan,
  startLearnSession,
  runLearnTurn,
  runRelearningBurst,
  capAssistedLearnTurnResult,
  completeLearnSegment,
  getCoverageStats,
  substringVerified,
  verifyConsolidationQuestions,
  maybeDemoteOnAgain,
  applyLearnStatusMigration,
  deriveLifecycleStage,
  setLifecycleStage,
  resolveCourseLearnEntry,
  createDefaultSubDeckForCourse,
  fingerprintLearnInputs,
  fingerprintSubDeckCards,
  getCourseSubDeckEntries,
  COURSE_ROOT_SUBDECK_KEY,
  pickProbeCard,
  classifyComplexCards,
  runPriorKnowledgeProbe,
  resolveSessionPlanProfile,
  recordLearnSessionOutcome
};

(globalThis as typeof globalThis & { __studyEngineLearnerModel?: Record<string, unknown> }).__studyEngineLearnerModel = {
  load: loadLearnerModel,
  save: saveLearnerModel,
  recordSessionOutcome,
  computeRecommendedSegmentMix
};

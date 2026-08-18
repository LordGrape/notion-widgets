import type { AppState, PlanProfile, StudyItem, SubDeckMeta } from './types';
import { getCardsInScope, getCardsInSubDeck } from './sub-decks';
import { runLearnTurn, LearnTurnClientError } from './learn-turn-client';
import { resolveSessionPlanProfile, resolveSessionTargetLanguage } from './plan-profiles';
import { composeLearnerModelFingerprint, computeRecommendedSegmentMix, loadLearnerModel, recordSessionOutcome, saveLearnerModel } from './learner-model/learner-model';
import { applyLearnStatusMigration, deriveLifecycleStage, setLifecycleStage } from './domain/lifecycle';
import { COURSE_ROOT_SUBDECK_KEY } from './application/learn/constants';
import { fingerprintLearnInputs, fingerprintSubDeckCards } from './application/learn/fingerprints';
import { substringVerified, verifyConsolidationQuestions } from './application/learn/grounding';
import { createDefaultSubDeckForCourse, getCourseSubDeckEntries, getCoverageStats, resolveCourseLearnEntry } from './application/learn/coverage';
import type {
  ConsolidationQuestion,
  LearnPlan,
  LearnSegment,
  LearnSessionState,
  LearnTurnResult,
  StudyCardInput,
  StreamLearnPlanHandlers,
  StreamLearnPlanOptions,
} from './application/learn/types';

// --- Phase V2a facade ------------------------------------------------------
// Types, constants, fingerprints, grounding verification, and coverage/entry
// resolution moved verbatim to src/application/learn/ (2026-08-18). The
// re-exports below preserve every historical import site ('./learn-mode'),
// the test files, and the bridge registrations at the bottom of this file.
// `runLearnTurn` lives in `./learn-turn-client.ts`; the re-export preserves
// the `__studyEngineLearnMode.runLearnTurn` bridge signature consumed from
// studyengine.html (`modeBridge.runLearnTurn(...)` in `submitLearnTurn`).
export type {
  ConsolidationQuestion,
  CourseLearnEntryResolution,
  CourseLearnPickerSubDeck,
  GroundingSnippet,
  LearnMechanism,
  LearnPlan,
  LearnSegment,
  LearnSessionState,
  LearnStatus,
  LearnTurnResult,
  StudyCardInput,
  StreamLearnPlanHandlers,
  StreamLearnPlanOptions,
} from './application/learn/types';
export { runLearnTurn, LearnTurnClientError };
export { applyLearnStatusMigration, deriveLifecycleStage, setLifecycleStage } from './domain/lifecycle';
export { COURSE_ROOT_SUBDECK_KEY } from './application/learn/constants';
export { fingerprintLearnInputs, fingerprintSubDeckCards } from './application/learn/fingerprints';
export { substringVerified, verifyConsolidationQuestions } from './application/learn/grounding';
export { createDefaultSubDeckForCourse, getCourseSubDeckEntries, getCoverageStats, resolveCourseLearnEntry } from './application/learn/coverage';

const LEARN_PLAN_ENDPOINT = 'https://widget-sync.lordgrape-widgets.workers.dev/studyengine/learn-plan';
const LEARN_PLAN_STREAM_TIMEOUT_MS = 15_000;

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

export function completeLearnSegment(session: LearnSessionState, segmentId: string): void {
  if (!session.completedSegmentIds.includes(segmentId)) {
    session.completedSegmentIds.push(segmentId);
  }
  if (session.index < session.plan.segments.length - 1) {
    session.index += 1;
    session.currentMechanism = session.plan.segments[session.index].mechanism;
  }
}

export function maybeDemoteOnAgain(item: StudyItem, rating: 1 | 2 | 3 | 4): boolean {
  if (rating === 1 && item.learnStatus === 'consolidated') {
    item.learnStatus = 'taught';
    return true;
  }
  return false;
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

import type { AppState, CourseContext, StudyItem, SubDeckMeta } from './types';
import { createSubDeck, getCardsInScope, getCardsInSubDeck, loadSubDecks } from './sub-decks';
import { runLearnTurn, LearnTurnClientError } from './learn-turn-client';

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
}

export interface ConsolidationQuestion {
  question: string;
  answer: string;
  linkedCardIds: string[];
}

export interface LearnPlan {
  segments: LearnSegment[];
  consolidationQuestions?: ConsolidationQuestion[];
  planMode?: 'verified' | 'retry_verified' | 'card_density_fallback';
  warning?: string;
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
// LEARN_TURN_ENDPOINT moved to `./learn-turn-client.ts` along with `runLearnTurn`.

function normalize(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
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
  courseContext?: CourseContext;
}): string {
  const cardIds = Array.isArray(args.cardIds)
    ? args.cardIds.map((id) => String(id || ''))
    : [];
  const cardHash = shortDjb2Hash(cardIds.join('|'));
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
      return normalize(source).includes(quote);
    });
  });
}

export async function generateLearnPlan(course: string, subDeck: string, items: StudyItem[], userName = '', learnerContext = ''): Promise<LearnPlan> {
  const cards = getCardsInSubDeck(course, subDeck, items).map((item) => ({
    id: item.id,
    prompt: item.prompt,
    modelAnswer: item.modelAnswer
  }));

  const response = await fetch(LEARN_PLAN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      course,
      subDeck,
      cards,
      userName,
      learnerContext
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Learn plan failed: ${detail}`);
  }

  const data = (await response.json()) as LearnPlan;
  const subDeckCards = getCardsInSubDeck(course, subDeck, items);
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
  onComplete?: (meta: { segmentCount: number; consolidationCount: number; planMode?: string; warning?: string; subDeckFingerprint?: string }) => void;
  onError?: (message: string, opts?: { hasSegments: boolean }) => void;
}

export async function streamLearnPlan(
  course: string,
  subDeck: string,
  items: StudyItem[],
  userName = '',
  learnerContext = '',
  handlers: StreamLearnPlanHandlers = {},
  signal?: AbortSignal
): Promise<void> {
  const subDeckCards = getCardsInSubDeck(course, subDeck, items);
  const subDeckFingerprint = fingerprintSubDeckCards(subDeckCards);
  const payload = {
    course,
    subDeck,
    cards: subDeckCards.map((item) => ({ id: item.id, prompt: item.prompt, modelAnswer: item.modelAnswer })),
    userName,
    learnerContext
  };

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
      const completeMeta = data as { segmentCount: number; consolidationCount: number; planMode?: string; warning?: string };
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
    if (!sawFatalError && emittedCount === 0) {
      handlers.onError?.('Learn plan stream ended without any segments.', { hasSegments: false });
    }
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') return;
    handlers.onError?.(`Learn plan stream failed: ${(err as Error).message || String(err)}`, { hasSegments: emittedCount > 0 });
  } finally {
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
  signal?: AbortSignal
): Promise<void> {
  const courseCards = getCardsInScope(course, null, items, state, { includeArchivedSubDecks: false });
  const subDeckFingerprint = fingerprintSubDeckCards(courseCards);
  const payload = {
    course,
    subDeck: COURSE_ROOT_SUBDECK_KEY,
    cards: courseCards.map((item) => ({ id: item.id, prompt: item.prompt, modelAnswer: item.modelAnswer })),
    userName,
    learnerContext
  };

  return streamLearnPlanInternal(payload, courseCards, subDeckFingerprint, handlers, signal);
}

async function streamLearnPlanInternal(
  payload: { course: string; subDeck: string; cards: Array<{ id: string; prompt: string; modelAnswer: string }>; userName: string; learnerContext: string; },
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
      const completeMeta = data as { segmentCount: number; consolidationCount: number; planMode?: string; warning?: string };
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
    if (!sawFatalError && emittedCount === 0) {
      handlers.onError?.('Learn plan stream ended without any segments.', { hasSegments: false });
    }
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') return;
    handlers.onError?.(`Learn plan stream failed: ${(err as Error).message || String(err)}`, { hasSegments: emittedCount > 0 });
  } finally {
    try { reader.releaseLock(); } catch { /* noop */ }
  }
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

(globalThis as typeof globalThis & { __studyEngineLearnMode?: Record<string, unknown> }).__studyEngineLearnMode = {
  generateLearnPlan,
  generateCourseLearnPlan,
  streamLearnPlan,
  streamCourseLearnPlan,
  startLearnSession,
  runLearnTurn,
  capAssistedLearnTurnResult,
  completeLearnSegment,
  getCoverageStats,
  substringVerified,
  verifyConsolidationQuestions,
  maybeDemoteOnAgain,
  applyLearnStatusMigration,
  resolveCourseLearnEntry,
  createDefaultSubDeckForCourse,
  fingerprintLearnInputs,
  fingerprintSubDeckCards,
  getCourseSubDeckEntries,
  COURSE_ROOT_SUBDECK_KEY
};

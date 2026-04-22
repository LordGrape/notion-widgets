/**
 * Learn flow state machine (pure, DOM-free).
 *
 * Owns the multi-turn session state for an active Learn plan:
 *   - current segment index
 *   - current tutor body (what the UI should render)
 *   - turn history
 *   - loading / error status
 *
 * DOM rendering, CSS, and network wiring live in the monolith (studyengine.html).
 * This module never imports DOM APIs.
 *
 * Does NOT touch:
 *   - FSRS scheduling
 *   - SyncEngine contract
 *   - tutor/grade prompt structure
 *   - XP <-> FSRS isolation
 *   - /studyengine/learn-plan request/response shape
 */

import type { ConsolidationQuestion, LearnPlan, LearnSegment, LearnTurnResult } from './learn-mode';

/**
 * Phases:
 *   - 'streaming'     : plan is still being generated; no segments received yet.
 *                       Modal should not be open in this phase (will open on
 *                       first appendStreamedSegment).
 *   - 'tutor'         : tutor is awaiting user input for current segment.
 *   - 'loading'       : /learn-turn request in flight.
 *   - 'error'         : last /learn-turn errored; show retry.
 *   - 'consolidating' : battery of consolidation questions.
 *   - 'done'          : session complete.
 */
export type LearnFlowPhase = 'streaming' | 'tutor' | 'loading' | 'error' | 'consolidating' | 'done';

export type ConsolidationRating = 1 | 2 | 3 | 4;

export type LearnHandoffStatus = 'consolidated' | 'taught' | 'unlearned';

export interface LearnHandoffEntry {
  status: LearnHandoffStatus;
  consolidationRating?: ConsolidationRating;
}

export interface LearnFlowTurn {
  segmentId: string;
  userInput: string;
  feedback: string;
  nextPrompt: string;
  isSegmentComplete: boolean;
  suggestedStatus?: string | null;
}

/**
 * Phase B telemetry: one entry per user turn submission within a segment.
 * Captured as a side-channel and not consumed by FSRS. Retained on the flow
 * so the monolith can compute aggregate time-to-submit and turn counts at
 * session-end (see getLearnTelemetrySummary when added in Phase C).
 */
export interface LearnFlowTurnTiming {
  segmentId: string;
  /** Zero-based ordinal of this turn within its segment. */
  turnIndex: number;
  /** Timestamp (ms) when the segment turn was entered (opened for input). */
  enteredAt: number;
  /** Timestamp (ms) when the user hit Submit. Unset while turn is still open. */
  submittedAt?: number;
  /** Length in characters of the user's response, recorded on submit. */
  turnResponseCharCount?: number;
}

/**
 * Phase B: if the user abandons before the session reaches `'done'`,
 * `closeLearnSessionImmediate` records which pane they bailed from.
 * The three values collapse the richer LearnFlowPhase set:
 *   - 'streaming'     → closed while the plan was still generating (no segments yet).
 *   - 'tutor'         → closed during any tutor-turn pane (includes 'loading' and 'error').
 *   - 'consolidating' → closed during the consolidation battery.
 */
export type LearnAbandonmentPhase = 'streaming' | 'tutor' | 'consolidating';

export interface LearnFlowState {
  course: string;
  subDeck: string;
  plan: LearnPlan;
  segmentIndex: number;
  /** Markdown source the UI should render as the current tutor message. */
  tutorBody: string;
  phase: LearnFlowPhase;
  errorMessage: string | null;
  turns: LearnFlowTurn[];
  /** Segment ids the user has fully completed (isSegmentComplete=true). */
  completedSegmentIds: string[];
  /** ISO string. Pre-dates Phase B telemetry so kept as-is; use `Date.parse`
      when combining with the millisecond-valued timestamps below. */
  startedAt: string;
  /** Phase 3: consolidation battery. */
  consolidationQuestions: ConsolidationQuestion[];
  consolidationIdx: number;
  /** Keyed by question index as string. */
  consolidationRatings: Record<string, ConsolidationRating>;
  /** True once the battery finished (either all rated or explicitly skipped). */
  consolidationFinished: boolean;
  /** Streaming: true once the server has emitted 'complete'. */
  streamingComplete: boolean;
  /** Phase B telemetry (all side-channel — NEVER fed into FSRS). */
  /** Timestamp (ms) set on transition into `'done'`. Unset if the session was abandoned. */
  completedAt?: number;
  /** Ordered list of turn timings across all segments, newest at the end. */
  turnTimings: LearnFlowTurnTiming[];
  /** First-entry timestamp (ms) per segment id. Only written once per segment. */
  segmentEnteredAt: Record<string, number>;
  /** Count of submitted turns per segment id. */
  totalTurnsPerSegment: Record<string, number>;
  /** Set only when the user closed the modal before reaching `'done'`. */
  abandonmentPhase?: LearnAbandonmentPhase;
}

export function createLearnFlow(plan: LearnPlan, course: string, subDeck: string): LearnFlowState {
  const first = (plan && plan.segments && plan.segments[0]) || null;
  const tutorBody = first ? buildInitialTutorBody(first) : 'No learn segments generated.';
  return {
    course: String(course || ''),
    subDeck: String(subDeck || ''),
    plan,
    segmentIndex: 0,
    tutorBody,
    phase: first ? 'tutor' : 'done',
    errorMessage: null,
    turns: [],
    completedSegmentIds: [],
    startedAt: new Date().toISOString(),
    consolidationQuestions: Array.isArray(plan && plan.consolidationQuestions)
      ? (plan.consolidationQuestions as ConsolidationQuestion[])
      : [],
    consolidationIdx: 0,
    consolidationRatings: {},
    consolidationFinished: false,
    streamingComplete: true,
    // Phase B telemetry seeds.
    turnTimings: [],
    segmentEnteredAt: {},
    totalTurnsPerSegment: {}
  };
}

/**
 * Create an empty flow seeded for SSE streaming. The modal is NOT supposed
 * to open yet — the UI should open on the first `appendStreamedSegment`
 * call. `phase` is set to `'streaming'` and `plan.segments` is empty.
 *
 * No consolidation questions yet; attach them later with
 * `attachStreamedConsolidationQuestions`.
 */
export function createStreamingLearnFlow(course: string, subDeck: string): LearnFlowState {
  const plan: LearnPlan = { segments: [], consolidationQuestions: [] };
  return {
    course: String(course || ''),
    subDeck: String(subDeck || ''),
    plan,
    segmentIndex: 0,
    tutorBody: 'Preparing your learning plan…',
    phase: 'streaming',
    errorMessage: null,
    turns: [],
    completedSegmentIds: [],
    startedAt: new Date().toISOString(),
    consolidationQuestions: [],
    consolidationIdx: 0,
    consolidationRatings: {},
    consolidationFinished: false,
    streamingComplete: false,
    // Phase B telemetry seeds.
    turnTimings: [],
    segmentEnteredAt: {},
    totalTurnsPerSegment: {}
  };
}

export function currentSegment(flow: LearnFlowState): LearnSegment | null {
  if (!flow || !flow.plan || !Array.isArray(flow.plan.segments)) return null;
  return flow.plan.segments[flow.segmentIndex] || null;
}

export function isLastSegment(flow: LearnFlowState): boolean {
  if (!flow || !flow.plan || !Array.isArray(flow.plan.segments)) return true;
  return flow.segmentIndex >= flow.plan.segments.length - 1;
}

export function markLoading(flow: LearnFlowState): LearnFlowState {
  return { ...flow, phase: 'loading', errorMessage: null };
}

export function markError(flow: LearnFlowState, message: string): LearnFlowState {
  return { ...flow, phase: 'error', errorMessage: String(message || 'Learn turn failed') };
}

/**
 * Apply a /learn-turn response to the flow.
 *
 * If the server reports segment complete and there is a next segment, advance.
 * If complete and this was the last segment, transition to 'done'.
 * Otherwise continue the current segment with the new tutor prompt.
 */
export function applyTurnResult(
  flow: LearnFlowState,
  userInput: string,
  result: LearnTurnResult
): LearnFlowState {
  const segment = currentSegment(flow);
  const segmentId = segment ? segment.id : '';
  const feedback = String(result.feedback || '').trim();
  const nextPrompt = String(result.nextPrompt || '').trim();
  const isComplete = !!result.isSegmentComplete;

  const turn: LearnFlowTurn = {
    segmentId,
    userInput: String(userInput || ''),
    feedback,
    nextPrompt,
    isSegmentComplete: isComplete,
    suggestedStatus: result.suggestedStatus == null ? null : String(result.suggestedStatus)
  };

  const completedSegmentIds = flow.completedSegmentIds.slice();
  if (isComplete && segmentId && completedSegmentIds.indexOf(segmentId) < 0) {
    completedSegmentIds.push(segmentId);
  }

  const turns = flow.turns.concat([turn]);

  if (isComplete) {
    if (isLastSegment(flow)) {
      return {
        ...flow,
        phase: 'done',
        errorMessage: null,
        turns,
        completedSegmentIds,
        tutorBody: buildClosingTutorBody(feedback)
      };
    }
    const nextIndex = flow.segmentIndex + 1;
    const nextSeg = flow.plan.segments[nextIndex];
    return {
      ...flow,
      segmentIndex: nextIndex,
      phase: 'tutor',
      errorMessage: null,
      turns,
      completedSegmentIds,
      tutorBody: buildAdvanceTutorBody(feedback, nextSeg)
    };
  }

  return {
    ...flow,
    phase: 'tutor',
    errorMessage: null,
    turns,
    completedSegmentIds,
    tutorBody: buildContinuingTutorBody(feedback, nextPrompt, segment)
  };
}

/**
 * Transition from 'done' (last segment completed) into 'consolidating' phase.
 * No-op if there are no consolidation questions; caller should check and skip
 * straight to handoff with 'taught' status for all covered cards.
 */
export function enterConsolidation(flow: LearnFlowState, questions?: ConsolidationQuestion[]): LearnFlowState {
  const qs = Array.isArray(questions) && questions.length > 0
    ? questions
    : (flow.consolidationQuestions || []);
  if (!qs.length) {
    return { ...flow, phase: 'done', consolidationFinished: true };
  }
  return {
    ...flow,
    phase: 'consolidating',
    consolidationQuestions: qs,
    consolidationIdx: 0,
    consolidationRatings: {},
    consolidationFinished: false,
    errorMessage: null
  };
}

/**
 * Record a rating for the consolidation question at `idx`. Advances to the
 * next question; if the last one just got rated, marks phase='done' and
 * consolidationFinished=true.
 */
export function submitConsolidationRating(
  flow: LearnFlowState,
  idx: number,
  rating: ConsolidationRating
): LearnFlowState {
  if (flow.phase !== 'consolidating') return flow;
  const total = flow.consolidationQuestions.length;
  if (idx < 0 || idx >= total) return flow;
  if (!(rating >= 1 && rating <= 4)) return flow;
  const consolidationRatings = { ...flow.consolidationRatings, [String(idx)]: rating };
  const nextIdx = idx + 1;
  const done = nextIdx >= total;
  return {
    ...flow,
    consolidationRatings,
    consolidationIdx: done ? total : nextIdx,
    phase: done ? 'done' : 'consolidating',
    consolidationFinished: done
  };
}

/**
 * Abandon the battery early. Any already-rated questions stay; unrated ones are
 * treated as "not reached" by `getFsrsHandoffPlan()` (linked cards fall back to
 * 'taught' unless they overlap with a rated question).
 */
export function skipConsolidation(flow: LearnFlowState): LearnFlowState {
  return {
    ...flow,
    phase: 'done',
    consolidationFinished: true
  };
}

export function isConsolidationComplete(flow: LearnFlowState): boolean {
  if (!flow) return false;
  if (flow.consolidationFinished) return true;
  const total = flow.consolidationQuestions.length;
  if (total === 0) return true;
  return Object.keys(flow.consolidationRatings).length >= total;
}

/**
 * Compute per-card handoff plan for FSRS initialization.
 *
 *  - 'consolidated': card appears in at least one completed segment AND at
 *    least one RATED consolidation question. Lowest linked rating wins
 *    (conservative: any weak signal dominates).
 *  - 'taught': card appears in at least one completed segment but no rated
 *    consolidation question links to it.
 *  - 'unlearned': card was in the topic pool (passed via topicPoolCardIds) but
 *    linked to zero completed segments. Orphans.
 *
 * Cards outside both completed segments and topic pool are ignored.
 */
export function getFsrsHandoffPlan(
  flow: LearnFlowState,
  topicPoolCardIds: string[] = []
): Map<string, LearnHandoffEntry> {
  const out = new Map<string, LearnHandoffEntry>();
  if (!flow) return out;

  // Gather card ids that appear in any COMPLETED segment.
  const completedSet = new Set(flow.completedSegmentIds || []);
  const segmentCardIds = new Set<string>();
  (flow.plan.segments || []).forEach((seg) => {
    if (!seg || !completedSet.has(seg.id)) return;
    (Array.isArray(seg.linkedCardIds) ? seg.linkedCardIds : []).forEach((id) => {
      if (id) segmentCardIds.add(String(id));
    });
  });

  // Map cardId -> array of recorded ratings from consolidation questions.
  const cardRatings = new Map<string, ConsolidationRating[]>();
  (flow.consolidationQuestions || []).forEach((q, idx) => {
    const rating = flow.consolidationRatings[String(idx)];
    if (!rating) return;
    (Array.isArray(q.linkedCardIds) ? q.linkedCardIds : []).forEach((id) => {
      if (!id) return;
      const key = String(id);
      if (!cardRatings.has(key)) cardRatings.set(key, []);
      (cardRatings.get(key) as ConsolidationRating[]).push(rating);
    });
  });

  segmentCardIds.forEach((cardId) => {
    const ratings = cardRatings.get(cardId);
    if (ratings && ratings.length) {
      // Conservative: lowest rating wins.
      let lowest: ConsolidationRating = ratings[0];
      for (const r of ratings) if (r < lowest) lowest = r;
      out.set(cardId, { status: 'consolidated', consolidationRating: lowest });
    } else {
      out.set(cardId, { status: 'taught' });
    }
  });

  // Orphans: in topic pool but not in any completed segment.
  (topicPoolCardIds || []).forEach((id) => {
    const key = String(id || '');
    if (!key) return;
    if (out.has(key)) return;
    if (segmentCardIds.has(key)) return;
    out.set(key, { status: 'unlearned' });
  });

  return out;
}

/* ═══════════════════════════════════════════════════════════════════
 * Streaming: plan segments arriving incrementally over SSE.
 *
 * The monolith drives these during the lifetime of a /learn-plan fetch.
 * Contract:
 *   - `createStreamingLearnFlow` seeds a flow with phase='streaming' and
 *     an empty segments array.
 *   - Each SSE `segment` event → `appendStreamedSegment(flow, seg)`.
 *     The first call flips phase='streaming' → 'tutor' (so the modal can
 *     render the first tutor body). Subsequent calls only push onto the
 *     segments list.
 *   - SSE `consolidationQuestions` → `attachStreamedConsolidationQuestions`.
 *     Overwrites the array in-place (immutably).
 *   - SSE `complete` → `markStreamingComplete(flow)` flips a flag. Does
 *     NOT change phase — the monolith may still be in 'tutor' or
 *     'consolidating' at that point.
 *
 * `canAdvanceToNextSegment` lets the monolith detect "user is on the last
 * loaded segment and more may be coming"; when true, the Submit button
 * should stall rather than prematurely transitioning to 'done'.
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * Push a streamed segment onto `flow.plan.segments`. If the flow is in
 * 'streaming' phase (first segment), flip to 'tutor' and seed the tutor
 * body from the new segment. Otherwise this is a silent append — the
 * tutor body for the current segment is preserved.
 */
export function appendStreamedSegment(flow: LearnFlowState, segment: LearnSegment): LearnFlowState {
  if (!flow || !segment) return flow;
  const segments = Array.isArray(flow.plan?.segments) ? flow.plan.segments.slice() : [];
  // De-dupe by id (server backstop might re-emit).
  if (segment.id && segments.some((s) => s && s.id === segment.id)) {
    return flow;
  }
  segments.push(segment);
  const nextPlan: LearnPlan = { ...flow.plan, segments };

  // First segment: transition streaming -> tutor, seed tutorBody.
  if (flow.phase === 'streaming' && segments.length === 1) {
    return {
      ...flow,
      plan: nextPlan,
      segmentIndex: 0,
      phase: 'tutor',
      errorMessage: null,
      tutorBody: buildInitialTutorBody(segment)
    };
  }

  return { ...flow, plan: nextPlan };
}

/**
 * Mark streaming complete. The server has emitted its `complete` event
 * and no further segments are coming. Does NOT change phase.
 */
export function markStreamingComplete(flow: LearnFlowState): LearnFlowState {
  if (!flow) return flow;
  return { ...flow, streamingComplete: true };
}

/**
 * Attach streamed consolidation questions. Overwrites the list.
 * Safe to call multiple times (idempotent on equal input).
 */
export function attachStreamedConsolidationQuestions(
  flow: LearnFlowState,
  questions: ConsolidationQuestion[]
): LearnFlowState {
  if (!flow) return flow;
  const qs = Array.isArray(questions) ? questions.slice() : [];
  const nextPlan: LearnPlan = { ...flow.plan, consolidationQuestions: qs };
  return { ...flow, plan: nextPlan, consolidationQuestions: qs };
}

export function getLoadedSegmentCount(flow: LearnFlowState): number {
  if (!flow || !flow.plan || !Array.isArray(flow.plan.segments)) return 0;
  return flow.plan.segments.length;
}

/**
 * Best-effort expected total. Unknown during streaming → returns null.
 * Once streaming is complete, equals loaded count.
 */
export function getTotalExpectedSegments(flow: LearnFlowState): number | null {
  if (!flow) return null;
  if (flow.streamingComplete) return getLoadedSegmentCount(flow);
  return null;
}

export function isStreamingComplete(flow: LearnFlowState): boolean {
  return !!(flow && flow.streamingComplete);
}

/* ═══════════════════════════════════════════════════════════════════
 * Phase B: telemetry actions (pure, no DOM, no FSRS side effects).
 *
 * These capture wall-clock timing of the tutor-turn loop so future phases
 * can report time-to-submit and abandonment rates. They are deliberately
 * side-channel: `applyLearnHandoff` and `getFsrsHandoffPlan` do not read
 * any of these fields. All actions take an explicit `now: number` so the
 * function remains pure — callers inject `Date.now()` at the call site.
 *
 * Idempotency:
 *   - `markSegmentEntered` is a no-op if the segment already has a recorded
 *     entry timestamp. Firing on every render is safe.
 *   - `markSessionCompleted` is a no-op if `completedAt` is already set.
 *   - `markAbandoned` is a no-op if the session already has either
 *     `completedAt` or `abandonmentPhase` set. An abandoned session cannot
 *     later be flipped to completed or vice versa.
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * Record first entry into a segment. Writes `segmentEnteredAt[segmentId]`
 * and opens a fresh `turnTimings` entry at `turnIndex=0`. No-op if the
 * segment has already been entered.
 */
export function markSegmentEntered(flow: LearnFlowState, segmentId: string, now: number): LearnFlowState {
  if (!flow || !segmentId) return flow;
  if (flow.segmentEnteredAt[segmentId] != null) return flow;
  const segmentEnteredAt = { ...flow.segmentEnteredAt, [segmentId]: now };
  const turnTimings = flow.turnTimings.concat([{ segmentId, turnIndex: 0, enteredAt: now }]);
  return { ...flow, segmentEnteredAt, turnTimings };
}

/**
 * Record a turn submission. Closes the most recent open (submittedAt-less)
 * timing entry for `segmentId` and increments `totalTurnsPerSegment`.
 * Safe to call even if no open entry exists (defensive — the counter still
 * increments so the submission is not lost).
 */
export function markTurnSubmitted(
  flow: LearnFlowState,
  segmentId: string,
  responseCharCount: number,
  now: number
): LearnFlowState {
  if (!flow || !segmentId) return flow;
  const turnTimings = flow.turnTimings.slice();
  for (let i = turnTimings.length - 1; i >= 0; i--) {
    const t = turnTimings[i];
    if (t.segmentId === segmentId && t.submittedAt == null) {
      turnTimings[i] = { ...t, submittedAt: now, turnResponseCharCount: responseCharCount };
      break;
    }
  }
  const prev = flow.totalTurnsPerSegment[segmentId] || 0;
  const totalTurnsPerSegment = { ...flow.totalTurnsPerSegment, [segmentId]: prev + 1 };
  return { ...flow, turnTimings, totalTurnsPerSegment };
}

/**
 * Open a new turn entry at `turnIndex+1` for a segment that just returned
 * `isSegmentComplete: false`. The previous entry for this segment should
 * already have `submittedAt` set via `markTurnSubmitted`.
 */
export function markTurnContinuation(flow: LearnFlowState, segmentId: string, now: number): LearnFlowState {
  if (!flow || !segmentId) return flow;
  let lastIndex = -1;
  for (const t of flow.turnTimings) {
    if (t.segmentId === segmentId && t.turnIndex > lastIndex) lastIndex = t.turnIndex;
  }
  const nextIndex = lastIndex + 1;
  const turnTimings = flow.turnTimings.concat([{ segmentId, turnIndex: nextIndex, enteredAt: now }]);
  return { ...flow, turnTimings };
}

/**
 * Mark the session as completed (the user reached `'done'` naturally).
 * Idempotent — returns flow unchanged if `completedAt` is already set.
 */
export function markSessionCompleted(flow: LearnFlowState, now: number): LearnFlowState {
  if (!flow) return flow;
  if (flow.completedAt != null) return flow;
  return { ...flow, completedAt: now };
}

/**
 * Mark the session as abandoned at the given pane. Idempotent — returns
 * flow unchanged if the session is already finalized (either completed or
 * previously marked abandoned). `completedAt` is set so downstream analytics
 * still see an end time.
 */
export function markAbandoned(
  flow: LearnFlowState,
  phase: LearnAbandonmentPhase,
  now: number
): LearnFlowState {
  if (!flow) return flow;
  if (flow.completedAt != null || flow.abandonmentPhase != null) return flow;
  return { ...flow, abandonmentPhase: phase, completedAt: now };
}

/**
 * False if the user is on the last-loaded segment and streaming is still
 * in flight. True otherwise.
 */
export function canAdvanceToNextSegment(flow: LearnFlowState): boolean {
  if (!flow) return true;
  if (isStreamingComplete(flow)) return true;
  const total = getLoadedSegmentCount(flow);
  if (total === 0) return false;
  return flow.segmentIndex < total - 1;
}

export function linkedCardIdsForSegment(flow: LearnFlowState, segmentId: string): string[] {
  if (!flow || !flow.plan || !Array.isArray(flow.plan.segments)) return [];
  for (const seg of flow.plan.segments) {
    if (seg && seg.id === segmentId) {
      return Array.isArray(seg.linkedCardIds) ? seg.linkedCardIds.slice() : [];
    }
  }
  return [];
}

/**
 * Pick the body that should render inside the UI's Teach block for a
 * freshly-entered segment. Prefers the declarative `teach` field (added
 * in the Defect 1 fix); falls back to `tutorPrompt` for older plans so the
 * UI still renders something meaningful if a legacy plan is hydrated from
 * cache or SyncEngine.
 */
function segmentTeachBody(segment: LearnSegment): string {
  const teach = String(segment?.teach || '').trim();
  if (teach) return teach;
  return String(segment?.tutorPrompt || '').trim();
}

function buildInitialTutorBody(segment: LearnSegment): string {
  const title = String(segment.title || '').trim();
  const body = segmentTeachBody(segment);
  if (title && body) return `**${title}**\n\n${body}`;
  return body || title || 'Ready when you are.';
}

function buildContinuingTutorBody(feedback: string, nextPrompt: string, segment: LearnSegment | null): string {
  const parts: string[] = [];
  if (feedback) parts.push(feedback);
  if (nextPrompt) parts.push(nextPrompt);
  if (!parts.length && segment) parts.push(segmentTeachBody(segment));
  return parts.join('\n\n').trim() || 'Keep going.';
}

function buildAdvanceTutorBody(feedback: string, nextSeg: LearnSegment | undefined): string {
  const parts: string[] = [];
  if (feedback) parts.push(feedback);
  if (nextSeg) {
    const nextTitle = String(nextSeg.title || '').trim();
    const nextBody = segmentTeachBody(nextSeg);
    if (nextTitle) parts.push(`**Next: ${nextTitle}**`);
    if (nextBody) parts.push(nextBody);
  }
  return parts.join('\n\n').trim() || 'Moving on.';
}

function buildClosingTutorBody(feedback: string): string {
  const base = feedback ? feedback.trim() : '';
  const outro = 'Learn session complete. You can consolidate the cards you\'ve covered or exit.';
  return base ? `${base}\n\n${outro}` : outro;
}

(globalThis as typeof globalThis & { __studyEngineLearnFlow?: Record<string, unknown> }).__studyEngineLearnFlow = {
  createLearnFlow,
  createStreamingLearnFlow,
  currentSegment,
  isLastSegment,
  markLoading,
  markError,
  applyTurnResult,
  linkedCardIdsForSegment,
  enterConsolidation,
  submitConsolidationRating,
  skipConsolidation,
  isConsolidationComplete,
  getFsrsHandoffPlan,
  // Streaming:
  appendStreamedSegment,
  markStreamingComplete,
  attachStreamedConsolidationQuestions,
  getLoadedSegmentCount,
  getTotalExpectedSegments,
  isStreamingComplete,
  canAdvanceToNextSegment,
  // Phase B telemetry (side-channel — no FSRS impact):
  markSegmentEntered,
  markTurnSubmitted,
  markTurnContinuation,
  markSessionCompleted,
  markAbandoned
};

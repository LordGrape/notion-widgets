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

export type LearnFlowPhase = 'tutor' | 'loading' | 'error' | 'consolidating' | 'done';

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
  startedAt: string;
  /** Phase 3: consolidation battery. */
  consolidationQuestions: ConsolidationQuestion[];
  consolidationIdx: number;
  /** Keyed by question index as string. */
  consolidationRatings: Record<string, ConsolidationRating>;
  /** True once the battery finished (either all rated or explicitly skipped). */
  consolidationFinished: boolean;
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
    consolidationFinished: false
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

export function linkedCardIdsForSegment(flow: LearnFlowState, segmentId: string): string[] {
  if (!flow || !flow.plan || !Array.isArray(flow.plan.segments)) return [];
  for (const seg of flow.plan.segments) {
    if (seg && seg.id === segmentId) {
      return Array.isArray(seg.linkedCardIds) ? seg.linkedCardIds.slice() : [];
    }
  }
  return [];
}

function buildInitialTutorBody(segment: LearnSegment): string {
  const title = String(segment.title || '').trim();
  const prompt = String(segment.tutorPrompt || '').trim();
  if (title && prompt) return `**${title}**\n\n${prompt}`;
  return prompt || title || 'Ready when you are.';
}

function buildContinuingTutorBody(feedback: string, nextPrompt: string, segment: LearnSegment | null): string {
  const parts: string[] = [];
  if (feedback) parts.push(feedback);
  if (nextPrompt) parts.push(nextPrompt);
  if (!parts.length && segment) parts.push(String(segment.tutorPrompt || ''));
  return parts.join('\n\n').trim() || 'Keep going.';
}

function buildAdvanceTutorBody(feedback: string, nextSeg: LearnSegment | undefined): string {
  const parts: string[] = [];
  if (feedback) parts.push(feedback);
  if (nextSeg) {
    const nextTitle = String(nextSeg.title || '').trim();
    const nextPrompt = String(nextSeg.tutorPrompt || '').trim();
    if (nextTitle) parts.push(`**Next: ${nextTitle}**`);
    if (nextPrompt) parts.push(nextPrompt);
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
  getFsrsHandoffPlan
};

/**
 * Application layer (L2): consolidation battery and FSRS handoff plan.
 * Split verbatim from src/learn-flow.ts in Phase V2c (2026-08-18).
 * Pure and DOM-free.
 */
import type { ConsolidationQuestion, ConsolidationRating, LearnFlowState, LearnHandoffEntry } from './types';

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

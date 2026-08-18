/**
 * Application layer (L2): streaming (SSE) actions for the learn flow.
 * Split verbatim from src/learn-flow.ts in Phase V2c (2026-08-18).
 * Pure and DOM-free.
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
 */
import type { ConsolidationQuestion, LearnFlowState, LearnPlan, LearnSegment } from './types';
import { buildInitialTutorBody, segmentNeedsPrequestion } from './flow-bodies';

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
      currentSubPhase: segmentNeedsPrequestion(segment) ? 'prequestion' : 'read',
      currentAssisted: false,
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

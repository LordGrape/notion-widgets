/**
 * Application layer (L2): learn flow core state machine.
 * Split verbatim from src/learn-flow.ts in Phase V2c (2026-08-18).
 * Constructors, segment selectors, phase transitions, and sub-phase
 * predicates. Pure and DOM-free; never touches FSRS scheduling, the
 * SyncEngine contract, tutor/grade prompt structure, XP/FSRS isolation,
 * or the /studyengine/learn-plan request/response shape.
 */
import type { ConsolidationQuestion, LearnFlowState, LearnFlowTurn, LearnPlan, LearnSegment, LearnTurnResult } from './types';
import { buildClosingTutorBody, buildContinuingTutorBody, buildInitialTutorBody, segmentNeedsPrequestion } from './flow-bodies';

export function createLearnFlow(plan: LearnPlan, course: string, subDeck: string): LearnFlowState {
  const first = (plan && plan.segments && plan.segments[0]) || null;
  const tutorBody = first ? buildInitialTutorBody(first) : 'No learn segments generated.';
  const firstSubPhase = first && segmentNeedsPrequestion(first) ? 'prequestion' : 'read';
  return {
    course: String(course || ''),
    subDeck: String(subDeck || ''),
    plan,
    segmentIndex: 0,
    tutorBody,
    phase: first ? 'tutor' : 'done',
    currentSubPhase: first ? firstSubPhase : 'read',
    currentAssisted: false,
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
    currentSubPhase: 'read',
    currentAssisted: false,
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
    verdict: result.verdict,
    understandingScore: result.understandingScore,
    missingConcepts: Array.isArray(result.missingConcepts) ? result.missingConcepts.slice() : [],
    followUp: result.followUp == null ? null : String(result.followUp),
    advance: result.advance,
    suggestedStatus: result.suggestedStatus == null ? null : String(result.suggestedStatus)
  };

  const completedSegmentIds = flow.completedSegmentIds.slice();
  if (isComplete && segmentId && completedSegmentIds.indexOf(segmentId) < 0) {
    completedSegmentIds.push(segmentId);
  }

  const turns = flow.turns.concat([turn]);

  return {
    ...flow,
    phase: 'tutor',
    currentSubPhase: 'feedback',
    errorMessage: null,
    turns,
    completedSegmentIds,
    tutorBody: isComplete
      ? String(flow.tutorBody || '')
      : buildContinuingTutorBody(feedback, nextPrompt, segment)
  };
}

export function markReadComplete(flow: LearnFlowState): LearnFlowState {
  if (!flow || flow.currentSubPhase !== 'read') return flow;
  return { ...flow, currentSubPhase: 'answer' };
}

export function markPrequestionComplete(flow: LearnFlowState): LearnFlowState {
  if (!flow || flow.currentSubPhase !== 'prequestion') return flow;
  return { ...flow, currentSubPhase: 'read' };
}

export function markScaffold(flow: LearnFlowState): LearnFlowState {
  if (!flow || flow.currentSubPhase !== 'answer') return flow;
  return { ...flow, currentSubPhase: 'scaffold' };
}

export function markAssisted(flow: LearnFlowState): LearnFlowState {
  if (!flow || flow.currentAssisted) return flow;
  return { ...flow, currentAssisted: true };
}

export function continueToNextSegment(flow: LearnFlowState): LearnFlowState {
  if (!flow || flow.currentSubPhase !== 'feedback') return flow;
  const segment = currentSegment(flow);
  const segmentId = segment ? segment.id : '';
  const latestTurn = flow.turns.length ? flow.turns[flow.turns.length - 1] : null;
  if (!latestTurn || latestTurn.segmentId !== segmentId || !latestTurn.isSegmentComplete) return flow;

  if (isLastSegment(flow)) {
    return {
      ...flow,
      phase: 'done',
      errorMessage: null,
      currentSubPhase: 'feedback',
      currentAssisted: false,
      tutorBody: buildClosingTutorBody(latestTurn.feedback)
    };
  }
  const nextIndex = flow.segmentIndex + 1;
  const nextSeg = flow.plan.segments[nextIndex];
  return {
    ...flow,
    segmentIndex: nextIndex,
    phase: 'tutor',
    currentSubPhase: segmentNeedsPrequestion(nextSeg) ? 'prequestion' : 'read',
    currentAssisted: false,
    errorMessage: null,
    tutorBody: buildInitialTutorBody(nextSeg)
  };
}

export function isReadPhase(flow: LearnFlowState): boolean {
  return !!flow && flow.currentSubPhase === 'read';
}

export function jumpToSegment(flow: LearnFlowState, nextIndex: number): LearnFlowState {
  if (!flow || !flow.plan || !Array.isArray(flow.plan.segments)) return flow;
  if (nextIndex < 0 || nextIndex >= flow.plan.segments.length) return flow;
  const nextSeg = flow.plan.segments[nextIndex];
  return {
    ...flow,
    segmentIndex: nextIndex,
    phase: 'tutor',
    currentSubPhase: segmentNeedsPrequestion(nextSeg) ? 'prequestion' : 'read',
    currentAssisted: false,
    errorMessage: null,
    tutorBody: buildInitialTutorBody(nextSeg)
  };
}

export function isPrequestionPhase(flow: LearnFlowState): boolean {
  return !!flow && flow.currentSubPhase === 'prequestion';
}

export function isAnswerPhase(flow: LearnFlowState): boolean {
  return !!flow && (flow.currentSubPhase === 'answer' || flow.currentSubPhase === 'scaffold');
}

export function isScaffoldPhase(flow: LearnFlowState): boolean {
  return !!flow && flow.currentSubPhase === 'scaffold';
}

export function isFeedbackPhase(flow: LearnFlowState): boolean {
  return !!flow && flow.currentSubPhase === 'feedback';
}

export function wasAssisted(flow: LearnFlowState): boolean {
  return !!(flow && flow.currentAssisted);
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

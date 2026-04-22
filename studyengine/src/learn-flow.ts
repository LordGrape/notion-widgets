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

import type { LearnPlan, LearnSegment, LearnTurnResult } from './learn-mode';

export type LearnFlowPhase = 'tutor' | 'loading' | 'error' | 'done';

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
    startedAt: new Date().toISOString()
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
  linkedCardIdsForSegment
};

/**
 * Learn flow state machine (pure, DOM-free).
 *
 * Phase V2c facade (2026-08-18): the flow was split verbatim into
 * application/learn/flow-state.ts, flow-consolidation.ts, flow-streaming.ts,
 * flow-telemetry.ts, flow-mastery.ts, and flow-bodies.ts, with the flow
 * types in application/learn/types.ts. The re-exports below preserve the
 * historical './learn-flow' import sites (learn-flow.test.ts) and the
 * __studyEngineLearnFlow bridge registered at the bottom of this file.
 *
 * Does NOT touch:
 *   - FSRS scheduling
 *   - SyncEngine contract
 *   - tutor/grade prompt structure
 *   - XP <-> FSRS isolation
 *   - /studyengine/learn-plan request/response shape
 */
import {
  createLearnFlow,
  createStreamingLearnFlow,
  currentSegment,
  isLastSegment,
  markLoading,
  markError,
  applyTurnResult,
  markReadComplete,
  markPrequestionComplete,
  markScaffold,
  markAssisted,
  continueToNextSegment,
  jumpToSegment,
  isReadPhase,
  isPrequestionPhase,
  isAnswerPhase,
  isScaffoldPhase,
  isFeedbackPhase,
  wasAssisted,
  linkedCardIdsForSegment,
} from './application/learn/flow-state';
import {
  enterConsolidation,
  submitConsolidationRating,
  skipConsolidation,
  isConsolidationComplete,
  getFsrsHandoffPlan,
} from './application/learn/flow-consolidation';
import {
  appendStreamedSegment,
  markStreamingComplete,
  attachStreamedConsolidationQuestions,
  getLoadedSegmentCount,
  getTotalExpectedSegments,
  isStreamingComplete,
  canAdvanceToNextSegment,
} from './application/learn/flow-streaming';
import {
  markSegmentEntered,
  markTurnSubmitted,
  markTurnContinuation,
  markSessionCompleted,
  markAbandoned,
  getLearnTelemetrySummary,
} from './application/learn/flow-telemetry';
import { computeLearnMasteryProjection } from './application/learn/flow-mastery';

export type {
  LearnFlowPhase,
  LearnSegmentSubPhase,
  ConsolidationRating,
  LearnHandoffStatus,
  LearnHandoffEntry,
  LearnFlowTurn,
  LearnFlowTurnTiming,
  LearnAbandonmentPhase,
  LearnFlowState,
  LearnMasteryProjection,
  LearnTelemetrySummary,
} from './application/learn/types';

export {
  createLearnFlow,
  createStreamingLearnFlow,
  currentSegment,
  isLastSegment,
  markLoading,
  markError,
  applyTurnResult,
  markReadComplete,
  markPrequestionComplete,
  markScaffold,
  markAssisted,
  continueToNextSegment,
  jumpToSegment,
  isReadPhase,
  isPrequestionPhase,
  isAnswerPhase,
  isScaffoldPhase,
  isFeedbackPhase,
  wasAssisted,
  linkedCardIdsForSegment,
} from './application/learn/flow-state';
export {
  enterConsolidation,
  submitConsolidationRating,
  skipConsolidation,
  isConsolidationComplete,
  getFsrsHandoffPlan,
} from './application/learn/flow-consolidation';
export {
  appendStreamedSegment,
  markStreamingComplete,
  attachStreamedConsolidationQuestions,
  getLoadedSegmentCount,
  getTotalExpectedSegments,
  isStreamingComplete,
  canAdvanceToNextSegment,
} from './application/learn/flow-streaming';
export {
  markSegmentEntered,
  markTurnSubmitted,
  markTurnContinuation,
  markSessionCompleted,
  markAbandoned,
  getLearnTelemetrySummary,
} from './application/learn/flow-telemetry';
export { computeLearnMasteryProjection } from './application/learn/flow-mastery';

(globalThis as typeof globalThis & { __studyEngineLearnFlow?: Record<string, unknown> }).__studyEngineLearnFlow = {
  createLearnFlow,
  createStreamingLearnFlow,
  currentSegment,
  isLastSegment,
  markLoading,
  markError,
  applyTurnResult,
  markReadComplete,
  markPrequestionComplete,
  markScaffold,
  markAssisted,
  continueToNextSegment,
  jumpToSegment,
  isReadPhase,
  isPrequestionPhase,
  isAnswerPhase,
  isScaffoldPhase,
  isFeedbackPhase,
  wasAssisted,
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
  markAbandoned,
  // Phase C selectors (pure reads — no mutation, no FSRS impact):
  computeLearnMasteryProjection,
  getLearnTelemetrySummary
};

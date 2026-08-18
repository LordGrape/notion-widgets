/**
 * Application layer (L2): Learn types.
 * Split verbatim from src/learn-mode.ts in Phase V2a (2026-08-18).
 * Type-only module: no runtime impact.
 * Phase V2c (2026-08-18): learn-flow types appended verbatim from
 * src/learn-flow.ts (see the marked section below).
 */
import type { PlanProfile } from '../../types';
import type { PrequestionState } from '../../learn-prequestion';

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

// --- Phase V2c: Learn flow types (split verbatim from src/learn-flow.ts) ---

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
export type LearnSegmentSubPhase = 'prequestion' | 'read' | 'answer' | 'scaffold' | 'feedback';

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
  verdict?: 'surface' | 'partial' | 'deep';
  understandingScore?: number;
  missingConcepts?: string[];
  followUp?: string | null;
  advance?: boolean;
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
  currentSubPhase: LearnSegmentSubPhase;
  currentAssisted: boolean;
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

export interface LearnMasteryProjection {
  /** Total cards linked to at least one completed segment. */
  coveredCards: number;
  /** Subset of covered cards that received a consolidation rating. */
  consolidatedCards: number;
  /** Subset of covered cards without a consolidation rating. */
  taughtCards: number;
  /** Count of consolidated cards per rating bucket (1..4). */
  ratingsBreakdown: { 1: number; 2: number; 3: number; 4: number };
  /** 0..1. Weighted mean per-card mastery; 0 when coveredCards === 0. */
  masteryScore: number;
}

export interface LearnTelemetrySummary {
  /** Total segments that exist in the plan at time of read. */
  totalSegments: number;
  /** Completed segments (isSegmentComplete=true). */
  completedSegments: number;
  /** Sum of `totalTurnsPerSegment` values. */
  totalTurns: number;
  /** Mean turns per completed segment, or null when none are completed. */
  avgTurnsPerCompletedSegment: number | null;
  /** Mean (submittedAt - enteredAt) over all closed turns, or null when no turn closed. */
  avgTimePerTurnMs: number | null;
  /** startedAt as ms; null when startedAt is unparseable. */
  startedAt: number | null;
  /** Wall-clock end of the session (completion or abandonment), or null while active. */
  completedAt: number | null;
  /** completedAt - startedAt when both known, or now - startedAt when active and `now` given. */
  elapsedMs: number | null;
  /** Set only on abandonment; mirrors `flow.abandonmentPhase`. */
  abandonmentPhase: LearnAbandonmentPhase | null;
}

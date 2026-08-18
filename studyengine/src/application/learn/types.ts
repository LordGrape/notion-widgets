/**
 * Application layer (L2): Learn types.
 * Split verbatim from src/learn-mode.ts in Phase V2a (2026-08-18).
 * Type-only module: no runtime impact.
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

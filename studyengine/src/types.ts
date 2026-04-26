/**
 * Study Engine type definitions extracted from studyengine/studyengine.html.
 * Type-only metadata (no runtime impact).
 */

export type TierId = 'quickfire' | 'explain' | 'apply' | 'distinguish' | 'mock' | 'worked';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type ExamType = 'mc' | 'short_answer' | 'essay' | 'mixed';
export type SubjectType = 'recall' | 'reasoning' | 'mixed';
export type AllowedMaterialsMode = "closed_book" | "open_book" | "one_page_sheet" | "take_home" | "unknown";

export interface AllowedMaterials {
  mode: AllowedMaterialsMode;
  rawText?: string;
}

export interface AssessmentFormat {
  hasEssay: boolean;
  hasShortAnswer: boolean;
  hasMultipleChoice: boolean;
  hasOralComponent: boolean;
  hasPresentation: boolean;
  hasParticipation: boolean;
  weights: Record<string, number>;
}

export interface Reading {
  citation: string;
  week?: number;
  availability: "textbook" | "brightspace" | "library" | "open" | "unknown";
}

export interface Textbook {
  citation: string;
  required: boolean;
  chapterMapping?: Record<number, string>;
}

export interface TopicWeight {
  topic: string;
  week?: number;
  weight?: number;
  readings?: Reading[];
}

export interface ProfessorValueHint {
  value: string;
  evidence: string;
  confidence: "high" | "medium" | "low";
}

export interface RubricHint {
  dimension: string;
  weight?: number;
  verbatim: string;
}

export interface BloomProfile {
  remember: number;
  understand: number;
  apply: number;
  analyze: number;
  evaluate: number;
  create: number;
}

// Descriptive extraction of the course's AI policy. Informational ONLY.
// Study Engine does NOT gate features on this. Used in later milestones to
// calibrate tutor safeguards (e.g. when stance is 'banned', tutor leans
// harder on Socratic questioning vs expository feedback, never produces
// submittable essay-length content). NEVER surfaced as a warning modal to
// the user: learning use of AI is legitimate; submission use is the line,
// and that line is enforced at the tutor/grade prompt level, not here.
export type AIPolicyStance = "banned" | "restricted" | "permitted" | "unspecified";

export interface AIPolicy {
  stance: AIPolicyStance;
  verbatimQuote?: string;
}

// Submission-related language from the syllabus. Seeds Milestone 2's tutor
// safeguards. Each entry should be a short phrase or sentence the model
// extracted verbatim from the syllabus that pertains to what counts as
// submittable work, academic integrity expectations, or citation norms.
export type AcademicIntegrityHint = string;
export type FieldConfidence = "high" | "medium" | "low";

// Keep in sync with worker/src/types.ts ParsedSyllabus.
export interface ParsedSyllabus {
  subjectType: SubjectType;
  subjectTypeReason: string;
  assessmentFormat?: AssessmentFormat;
  allowedMaterials?: AllowedMaterials;
  topicWeights?: TopicWeight[];
  professorValueHints?: ProfessorValueHint[];
  scopeTerms?: string[];
  aiPolicy?: AIPolicy;
  academicIntegrityHints?: AcademicIntegrityHint[];
  rubricHints?: RubricHint[];
  bloomProfile?: BloomProfile;
  textbooks?: Textbook[];
  supplementaryReadings?: Reading[];
  confidence: Record<string, FieldConfidence>;
}

export interface CourseContext extends ParsedSyllabus {
  parsedAt: number;
  acceptedAt: number;
  sourceFingerprint: string;
}

export interface FSRSState {
  difficulty: number;
  stability: number;
  due: string;
  reps: number;
  lapses: number;
  lastReview: string | null;
  lastRating?: 1 | 2 | 3 | 4;
  state: 'new' | 'learning' | 'review' | 'relearning';
}

export interface ReviewEvent {
  at: number;
  rating: 1 | 2 | 3 | 4;
}



export interface SubDeckMeta {
  name: string;
  order: number;
  created: number;
  color?: string;
  icon?: string;
  parentSubDeck?: string | null;
  archived?: boolean;
  archivedAt?: number;
}

export type SubDecksState = Record<string, Record<string, SubDeckMeta>>;
export interface StudyItem {
  id: string;
  prompt: string;
  /** canonical field in source */
  modelAnswer: string;
  cachedInsight?: string;
  /** import compatibility field seen in source */
  answer?: string;
  tier?: TierId;
  lastTier?: TierId;
  course?: string;
  topic?: string;
  subdeck?: string;
  subDeck?: string | null;
  learnStatus?: 'unlearned' | 'taught' | 'consolidated' | null;
  lifecycleStage?: 'new' | 'encoding' | 'consolidating' | 'maintaining' | 'relearning' | 'retired';
  jolHistory?: Array<{
    ts: string;
    predicted: number;
    actual: number;
    delta: number;
    cardId: string;
  }>;
  learnedAt?: number;
  consolidationRating?: 1 | 2 | 3 | 4 | null;
  /**
   * Phase 3 successive relearning flag. When true and the card's course+tier
   * matches, buildSessionQueue hoists the card to the front of the Quick Fire
   * queue. Cleared on first rating >= 3; persists on rating === 1.
   */
  forceNextQF?: boolean;
  forceNextQFOrigin?: 'learn' | 'review';
  fsrs: FSRSState;
  reviewLog?: ReviewEvent[];
  tags?: string[];
  notes?: string;
  created: string;
  modified?: string;
  archived?: boolean;
  suspended?: boolean;
  suspendedAt?: number;
  imageUrl?: string;

  task?: string;
  scenario?: string;
  conceptA?: string;
  conceptB?: string;
  timeLimitMins?: number;
  workedScaffold?: string;
  examType?: ExamType;

  priority?: Priority;
  variants?: Record<string, unknown>;
  visual?: string;

  _presentTier?: TierId;
  _priorityExtra?: boolean;
}

export interface SubDeck {
  id: string;
  name: string;
  topics: string[];
  items: string[];
}

export interface Course {
  id: string;
  name: string;
  color: string;
  examType: ExamType;
  examDate: string | null;
  examWeight: number | null;
  examFormat: string | null;
  allowedMaterials: string | null;
  manualMode: boolean;
  subjectType?: SubjectType;
  created: string;
  prepared: boolean;
  archived?: boolean;

  syllabusContext: string | null;
  syllabusKeyTopics: string[];
  rawSyllabusText: string | null;
  professorValues: string | null;
  courseContext?: CourseContext;

  modules: SubDeck[];
  cramMode?: {
    active: boolean;
    daysUntil?: number;
    intensity?: 'critical' | 'high' | 'moderate' | 'low' | 'normal';
    sessionMod?: number;
    intervalMod?: number;
  };

  lectureContext?: string;
  _lectureCount?: number;
}

export interface Tier {
  id: TierId;
  label: string;
  colour: string;
  icon: string;
  minInterval: number;
  promptTemplate?: string;
  promptTemplateShort?: string;
  promptTemplateLong?: string;
}

export interface Settings {
  desiredRetention: number;
  dailyGoal?: number;
  sessionLimit: number;
  sessionLength?: number;
  mockDefaultMins: number;
  showApplyTimer: boolean;
  revealMode: 'auto' | 'manual' | 'visual' | 'audio' | 'both';
  ttsVoice: string;
  voice?: string;
  breakReminders: boolean;
  breakIntervalMins: number;
  breakInterval?: number;
  performanceBreaks: boolean;
  feedbackMode: 'adaptive' | 'always_socratic' | 'always_quick' | 'self_rate';
  modelOverride: 'adaptive' | 'pro' | 'flash';
  tutorModel?: string;
  tutorVoice: 'rigorous' | 'supportive';
  userName: string;
  theme?: 'light' | 'dark' | 'system';
  courseExamTypes?: Record<string, ExamType | string>;
}

export interface CalibrationRecord {
  t: string;
  ts?: string;
  rating: 1 | 2 | 3 | 4;
  confidence?: 'low' | 'medium' | 'high' | null;
  actualCorrect?: 0 | 1;
  tier?: TierId;
  course?: string;
}

export interface CalibrationData {
  totalSelfRatings: number;
  totalActualCorrect: number;
  history: CalibrationRecord[];
  predictions?: number[];
  outcomes?: number[];
  calibrationPct?: number;
}

export interface StatsData {
  totalReviews: number;
  streakDays: number;
  lastSessionDate: string;
  reviewsByTier: Record<TierId, number>;
  history?: Array<{ date: string; reviews: number; xp?: number }>;
  totalStudyTimeMs?: number;
  timeOfDay?: {
    morning: { totalRatings: number; ratingSum: number; sessions: number };
    afternoon: { totalRatings: number; ratingSum: number; sessions: number };
    evening: { totalRatings: number; ratingSum: number; sessions: number };
    night: { totalRatings: number; ratingSum: number; sessions: number };
  };
}

export interface DragonState {
  xp: number;
  rank?: string;
  stage?: number;
  name?: string;
  lastFed?: string;
}

export interface SessionState {
  queue: StudyItem[];
  idx: number;
  currentIndex?: number;
  tier?: TierId;
  ratings?: number[];
  startTime?: number;
  startedAt: number;
  isReview?: boolean;

  loops: Record<string, number>;
  currentShown: boolean;
  xp: number;
  reviewsByTier: Record<TierId, number>;
  ratingSum: number;
  ratingN: number;
  calBefore: number;
  confidence: 'low' | 'medium' | 'high' | null;
  recentRatings: number[];
  fatigueWarningShown: boolean;

  aiRating?: number | null;
  _dontKnow?: boolean;
  _isRelearning?: boolean;
  _reconstructionPending?: boolean;
  _xpFlashGuard?: string;
  _forceAskTutorExpand?: boolean;

  tutorStats: Record<string, unknown>;
  tutorModeCounts: Record<string, number>;
  sessionRatingsLog: Array<Record<string, unknown>>;
  lastTutorContext: Record<string, unknown> | null;
  tutorAnalyticsHistoryKey: string;
}

export interface LearnSession {
  segments: Array<Record<string, unknown>>;
  currentSegment: number;
  consolidationBattery: Array<Record<string, unknown>>;
  currentMechanism?: 'worked_example' | 'elaborative_interrogation' | 'self_explanation' | 'predictive_question' | 'test_closure';
  completedSegmentIds?: string[];
  subDeck?: string | null;
  course?: string | null;
  startedAt?: string;
  completedAt?: string;
}

export interface LearnProgressMeta {
  segmentsTotal: number;
  segmentsCompleted: number;
  consolidationAvgRating: number | null;
  lastLearnedAt: string | null;
  linkedCardIds: string[];
}

export interface LearnSessionRecord {
  course: string;
  topics: string[];
  subDeck: string;
  segmentsCompleted: number;
  consolidationRatings: Array<1 | 2 | 3 | 4>;
  segments?: Array<{
    id?: string;
    teachReadMs?: number;
    groundingSource?: 'gemini' | 'fallback';
  }>;
  cardsHandedOff: number;
  durationMs: number;
  timestamp: string;
}

export interface LearnPlanGroundingSnippet {
  cardId: string;
  quote: string;
}

export interface LearnPlanSegment {
  id: string;
  title: string;
  mechanism: 'worked_example' | 'elaborative_interrogation' | 'self_explanation' | 'predictive_question' | 'test_closure';
  checkType?: 'elaborative' | 'predictive' | 'self_explain' | 'prior_knowledge_probe' | 'worked_example' | 'transfer_question';
  objective: string;
  teach?: string;
  tutorPrompt: string;
  expectedAnswer: string;
  linkedCardIds: string[];
  groundingSnippets: LearnPlanGroundingSnippet[];
  fadeLevel?: 1 | 2 | 3;
  workedExampleId?: string;
  isProbe?: boolean;
}

/**
 * Wire-level discriminated union mirroring worker `LearnTurnResponse`. Kept in
 * sync with `worker/src/types.ts` `LearnTurnSuccess` / `LearnTurnFailure`. The
 * client's richer `LearnTurnResult` (see `learn-mode.ts`) is derived from the
 * success branch plus the client-side `nextPrompt` / `isSegmentComplete` flags.
 */
export type LearnTurnVerdict = 'surface' | 'partial' | 'deep';

export interface LearnTurnSuccessEnvelope {
  ok: true;
  verdict: LearnTurnVerdict;
  understandingScore: number;
  copyRatio: number;
  missingConcepts: string[];
  feedback: string;
  followUp: string | null;
  advance: boolean;
}

export type LearnTurnErrorCode = 'upstream_failed' | 'schema_invalid' | 'internal_error';

export interface LearnTurnFailureEnvelope {
  ok: false;
  errorCode: LearnTurnErrorCode;
  message: string;
}

export type LearnTurnEnvelope = LearnTurnSuccessEnvelope | LearnTurnFailureEnvelope;

export interface CachedLearnPlan {
  fingerprint: string;
  plan: LearnPlanSegment[];
  generatedAt: number;
  planVersion: number;
  courseContextHash?: string;
  subDeckFingerprint?: string;
}

export interface AppState {
  items: Record<string, StudyItem>;
  courses: Record<string, Course>;
  ui?: {
    activeCourseTab?: Record<string, 'review' | 'learn' | 'cards' | 'analytics' | 'settings'>;
    seenLearnIntro?: boolean;
    learnSelectedSubDeck?: Record<string, string>;
  };
  subDecks?: SubDecksState;
  calibration: CalibrationData;
  stats: StatsData;
  settings?: Settings;
  dragon?: DragonState;
  session?: SessionState;
  learnSession?: LearnSession;
  /** Per-course, per-topic Learn progress metadata (Phase 3). */
  learnProgress?: Record<string, Record<string, LearnProgressMeta>>;
  /** Capped at last 30 completed Learn sessions (Phase 3). */
  learnSessions?: LearnSessionRecord[];
  learnPlans?: Record<string, Record<string, CachedLearnPlan>>;
  studyEngineFeatures?: {
    run1Pedagogy?: boolean;
  };
}

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
  subDeck?: string;
  fsrs: FSRSState;
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
  startedAt?: string;
  completedAt?: string;
}

export interface AppState {
  items: Record<string, StudyItem>;
  courses: Record<string, Course>;
  calibration: CalibrationData;
  stats: StatsData;
  settings?: Settings;
  dragon?: DragonState;
  session?: SessionState;
  learnSession?: LearnSession;
}

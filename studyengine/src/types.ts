/**
 * Study Engine type definitions extracted from studyengine/studyengine.html.
 * Type-only metadata (no runtime impact).
 */

export type TierId = 'quickfire' | 'explain' | 'apply' | 'distinguish' | 'mock' | 'worked';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type ExamType = 'mc' | 'short_answer' | 'essay' | 'mixed';
export type SubjectType = 'recall' | 'reasoning' | 'mixed';

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

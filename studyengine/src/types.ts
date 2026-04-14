/*
 * Study Engine Type Definitions
 * Extracted from js/*.js source files
 * Zero runtime changes - TypeScript types only
 */

// ============================================
// FSRS Types
// ============================================

export interface FSRSState {
  stability: number;
  difficulty: number;
  due: string;
  lastReview: string | null;
  reps: number;
  lapses: number;
  state: 'new' | 'learning' | 'review' | 'relearning';
}

export interface FSRSParams {
  w: number[];
  request_retention: number;
  enable_fuzz: boolean;
}

export interface FSRSInstance {
  new (params: FSRSParams): FSRSInstance;
}

export interface FSRSModule {
  FSRS: FSRSInstance;
  generatorParameters: (opts: FSRSParams) => FSRSParams;
  clipParameters: (params: number[], clamp?: number, pad?: boolean) => number[];
  checkParameters: (params: number[]) => number[];
  migrateParameters: (params: number[]) => number[];
}

// ============================================
// Core Data Types
// ============================================

export interface StudyItem {
  id: string;
  prompt: string;
  modelAnswer: string;
  tier?: 'quickfire' | 'explain' | 'apply' | 'distinguish' | 'mock' | 'worked';
  lastTier?: 'quickfire' | 'explain' | 'apply' | 'distinguish' | 'mock' | 'worked';
  course?: string;
  topic?: string;
  tags?: string[];
  created?: string;
  archived?: boolean;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  subDeck?: string | null;
  
  // FSRS scheduling state
  fsrs?: FSRSState;
  
  // Tier-specific fields
  task?: string;
  scenario?: string;
  conceptA?: string;
  conceptB?: string;
  timeLimitMins?: number;
  workedScaffold?: string;
  examType?: 'mc' | 'short_answer' | 'essay' | 'mixed';
  
  // AI-generated variants
  variants?: Record<string, unknown>;
  
  // Visual cache (mermaid code string)
  visual?: string;
  
  // Learn mode fields
  lastLearnedAt?: string;
  learnStatus?: 'not_started' | 'in_progress' | 'learned';
  
  // Tutor memory (per-item)
  tutorMemory?: {
    patterns?: string[];
    misconceptions?: string[];
    lastDiscussed?: string;
  };
  
  // Session tracking
  _presentTier?: string;
}

export interface SubDeck {
  id: string;
  name: string;
  topics?: string[];
  order?: number;
  archived?: boolean;
  created?: string;
  cardCount?: number;
}

export interface Assessment {
  id: string;
  name: string;
  type: 'mc' | 'short_answer' | 'essay' | 'mixed';
  date: string;
  weight?: number | null;
  format?: string | null;
  allowedMaterials?: string | null;
  prioritySet?: string[];
  sacrificeSet?: string[];
  questions?: AssessmentQuestion[];
}

export interface AssessmentQuestion {
  id: string;
  text?: string;
  mappedTopics?: string[];
}

export interface Course {
  id: string;
  name: string;
  color: string;
  examType?: 'mc' | 'short_answer' | 'essay' | 'mixed';
  examDate?: string | null;
  examWeight?: number | null;
  examFormat?: string | null;
  allowedMaterials?: string | null;
  manualMode?: boolean;
  created?: string;
  prepared?: boolean;
  archived?: boolean;
  
  // Syllabus context
  syllabusContext?: string | null;
  syllabusKeyTopics?: string[];
  rawSyllabusText?: string | null;
  professorValues?: string | null;
  
  // Assessments (Phase 2+)
  assessments?: Assessment[];
  
  // Module/subdeck structure
  modules?: SubDeck[];
  _lectureCount?: number;
  
  // Tutor notes (per-course)
  tutorNotes?: TutorMemory;
}

export interface TierProfile {
  quickfire: number;
  explain: number;
  apply: number;
  distinguish: number;
  mock: number;
  worked: number;
}

export interface CramModifier {
  quickfire: number;
  explain: number;
  apply: number;
  distinguish: number;
  mock: number;
  worked: number;
}

export interface CramState {
  active: boolean;
  daysUntil?: number;
  assessName?: string;
  intensity?: 'critical' | 'high' | 'moderate' | 'low' | 'normal';
  sessionMod?: number;
  intervalMod?: number;
}

// ============================================
// Settings & Configuration
// ============================================

export interface Settings {
  desiredRetention: number;
  sessionLimit: number;
  mockDefaultMins: number;
  showApplyTimer: boolean;
  revealMode: 'auto' | 'manual';
  ttsVoice: string;
  breakReminders: boolean;
  breakIntervalMins: number;
  performanceBreaks: boolean;
  feedbackMode: 'adaptive' | 'immediate' | 'delayed';
  gamificationMode: 'clean' | 'motivated' | 'off';
  modelOverride: 'adaptive' | 'flash' | 'pro';
  userName: string;
  tutorVoice: 'rigorous' | 'supportive';
}

// ============================================
// App State
// ============================================

export interface CalibrationData {
  totalSelfRatings: number;
  totalActualCorrect: number;
  history: CalibrationRecord[];
}

export interface CalibrationRecord {
  timestamp: string;
  rating: number;
  selfRated: boolean;
  correct: boolean;
}

export interface Stats {
  totalReviews: number;
  streakDays: number;
  lastSessionDate: string;
  reviewsByTier: {
    quickfire: number;
    explain: number;
    apply: number;
    distinguish: number;
    mock: number;
    worked: number;
  };
}

export interface LearnProgress {
  status: 'not_started' | 'in_progress' | 'learned';
  startedAt?: string;
  lastLearnedAt?: string;
  completedAt?: string;
  consolidationScore?: number;
}

export interface AppState {
  items: Record<string, StudyItem>;
  courses: Record<string, Course>;
  subDecks: Record<string, { subDecks: Record<string, SubDeck> }>;
  learnProgress: Record<string, Record<string, LearnProgress>>;
  learnSessions: LearnSession[];
  calibration: CalibrationData;
  stats: Stats;
}

// ============================================
// Session Types
// ============================================

export interface SessionResult {
  itemId: string;
  rating: number;
  timestamp: string;
  tier: string;
  xpEarned: number;
  confidence?: 'low' | 'medium' | 'high';
  tutorMode?: string;
  selfRatedCorrect?: boolean;
  tutorGradedCorrect?: boolean;
}

export interface SessionState {
  queue: StudyItem[];
  idx: number;
  xp: number;
  startTime: number;
  results: SessionResult[];
  confidence?: 'low' | 'medium' | 'high';
  tierAssignments?: Record<string, string>;
  breakState?: BreakState;
}

export interface BreakState {
  sessionStartTime: number;
  lastBreakTime: number;
  breaksTaken: number;
  bannerDismissed: boolean;
  breakTimerInterval: number | null;
  breakDurationMs: number;
}

// ============================================
// Tutor Types
// ============================================

export interface TutorMessage {
  role: 'user' | 'tutor';
  content: string;
  timestamp?: string;
  model?: 'flash' | 'pro';
}

export interface TutorMemory {
  patterns?: string[];
  misconceptions?: string[];
  strengths?: string[];
  connections?: string[];
  lastUpdated?: string;
}

export interface TutorContext {
  courseName?: string;
  topic?: string;
  history?: TutorMessage[];
  lectureContext?: {
    courseDigest?: string;
    topicChunk?: string;
  };
}

export interface GradeResult {
  correct: boolean;
  confidence: 'high' | 'medium' | 'low';
  feedback: string;
  mode?: string;
  isComplete?: boolean;
  tutorMessage?: string;
  acknowledgment?: string;
  insight?: string;
  followUpQuestion?: string;
  extensionQuestion?: string;
  reconstructionPrompt?: string;
  annotations?: Array<{
    start: number;
    end: number;
    type: 'error' | 'strength' | 'suggestion';
    note: string;
  }>;
}

export interface TutorStats {
  socraticTurns: number;
  acknowledgeTurns: number;
  dontKnowCount: number;
  dontKnows: number;
  skipsToRating: number;
  relearningCount: number;
  reconstructionSuccesses: number;
  apiSuccesses: number;
  apiFailures: number;
}

export interface TutorModeCounts {
  socratic: number;
  acknowledge: number;
  quickfeedback: number;
  insight: number;
  dontknow: number;
  relearning: number;
}

// ============================================
// Dragon Types
// ============================================

export interface DragonStage {
  stage: number;
  rank: string;
  abbr: string;
  emoji: string;
  next: number;
}

export interface DragonState {
  xp: number;
  stage: number;
  rank: string;
  evolutionHistory?: Array<{
    date: string;
    fromRank: string;
    toRank: string;
  }>;
}

// ============================================
// Learn Mode Types
// ============================================

export interface LearnSegment {
  id: string;
  type: 'explain' | 'example' | 'check' | 'analogy' | 'visual' | 'consolidation';
  content: string;
  title?: string;
}

export interface LearnSession {
  id: string;
  courseName: string;
  topicName: string;
  segments: LearnSegment[];
  currentSegment: number;
  startedAt: string;
  completedAt?: string;
  consolidationBattery?: number;
  primedItems?: string[];
}

// ============================================
// Dashboard/Stats Types
// ============================================

export interface StatsSnapshot {
  date: string;
  reviews: number;
  xp: number;
  avgRating: number;
  tutorTurns: number;
  byTier: Record<string, number>;
}

export interface DailyStats {
  date: string;
  totalReviews: number;
  totalXp: number;
  itemsReviewed: string[];
}

export interface RetentionPoint {
  days: number;
  retrievability: number;
}

export interface ActivityRecord {
  date: string;
  count: number;
  xp: number;
}

// ============================================
// Utility Types
// ============================================

export type TierType = 'quickfire' | 'explain' | 'apply' | 'distinguish' | 'mock' | 'worked';

export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

export type ExamType = 'mc' | 'short_answer' | 'essay' | 'mixed';

export type TutorMode = 'socratic' | 'acknowledge' | 'quickfeedback' | 'insight' | 'dontknow' | 'relearning';

export type FeedbackMode = 'adaptive' | 'immediate' | 'delayed';

export type GamificationMode = 'clean' | 'motivated' | 'off';

export type ModelOverride = 'adaptive' | 'flash' | 'pro';

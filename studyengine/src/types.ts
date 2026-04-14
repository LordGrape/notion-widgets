export type Tier = 'quickfire' | 'explain' | 'apply' | 'distinguish' | 'mock' | 'worked';

export type ExamType = 'mc' | 'short_answer' | 'essay' | 'mixed';

export type GamificationMode = 'clean' | 'motivated' | 'off';

export type FeedbackMode = 'immediate' | 'delayed' | 'none';

export type TutorVoice = 'rigorous' | 'supportive';

export type LearnStatus = 'learned' | 'unlearned' | null;

export type FSRSState = 'new' | 'learning' | 'review' | 'relearning';

export type Priority = 'critical' | 'high' | 'medium' | 'low';

export interface FSRSData {
  stability: number;
  difficulty: number;
  due: string | null;
  lastReview: string | null;
  reps: number;
  lapses: number;
  state: FSRSState;
}

export interface DiagnosisEntry {
  type: string;
  timestamp: string;
  tier: string;
  mode: string;
}

export interface StudyItem {
  id: string;
  prompt: string;
  modelAnswer: string;
  course: string;
  topic: string;
  tier?: Tier;
  subDeck: string | null;
  archived: boolean;
  created: string;
  fsrs?: FSRSData;
  learnStatus?: LearnStatus;
  learnedAt?: string;
  variants?: Record<string, unknown>;
  priority?: Priority;
  conceptA?: string;
  conceptB?: string;
  task?: string;
  examType?: ExamType;
  timeLimitMins?: number;
  diagnosisHistory?: DiagnosisEntry[];
  visual?: string;
  scenario?: string;
  lastTier?: Tier;
}

export interface Assessment {
  id: string;
  name: string;
  type: ExamType;
  date: string | null;
  weight: number | null;
  format: string | null;
  allowedMaterials: string | null;
  questions: AssessmentQuestion[];
  prioritySet: string[];
  sacrificeSet: string[];
  topicMapping: Record<string, string[]>;
  chooseN: number | null;
  outOfM: number | null;
  active: boolean;
}

export interface AssessmentQuestion {
  id: string;
  text?: string;
  mappedTopics?: string[];
}

export interface CourseModule {
  id: string;
  name: string;
  order: number;
  topics: string[];
  lectureImported?: boolean;
}

export interface Course {
  id: string;
  name: string;
  examType: ExamType;
  examDate: string | null;
  manualMode: boolean;
  color: string;
  created: string;
  examWeight: number | null;
  syllabusContext: string | null;
  professorValues: string | null;
  allowedMaterials: string | null;
  rawSyllabusText: string | null;
  examFormat: string | null;
  syllabusKeyTopics: string[];
  prepared: boolean;
  archived?: boolean;
  modules?: CourseModule[];
  assessments?: Assessment[];
  _lectureCount?: number;
}

export interface SubDeckMeta {
  name: string;
  order: number;
  archived: boolean;
  created: string;
  cardCount?: number;
}

export interface LearnProgressMeta {
  status: 'not_started' | 'in_progress' | 'learned';
  segmentsTotal: number;
  segmentsCompleted: number;
  consolidationAvgRating: number;
  lastLearnedAt: string;
  linkedCardIds: string[];
}

export interface LearnSegment {
  concept: string;
  explanation: string;
  elaboration?: string;
  checkType: 'predict' | 'your_turn';
  checkQuestion: string;
}

export interface Settings {
  desiredRetention: number;
  sessionLimit: number;
  mockDefaultMins: number;
  showApplyTimer: boolean;
  revealMode: string;
  ttsVoice: string;
  breakReminders: boolean;
  breakIntervalMins: number;
  performanceBreaks: boolean;
  feedbackMode: FeedbackMode;
  gamificationMode: GamificationMode;
  modelOverride: string;
  userName: string;
  tutorVoice: TutorVoice;
  courseExamTypes?: Record<string, ExamType>;
}

export interface CalibrationState {
  totalSelfRatings: number;
  totalActualCorrect: number;
  history: Array<{ ts: string; predicted: number; actual: number; rating?: number }>;
}

export interface StatsState {
  totalReviews: number;
  streakDays: number;
  lastSessionDate: string;
  reviewsByTier: Record<Tier, number>;
}

export interface LearnSessionRecord {
  course: string;
  topics: string[];
  subDeck: string | null;
  segmentsCompleted: number;
  consolidationRatings: number[];
  cardsHandedOff: number;
  duration: number;
  timestamp: string;
  xpEarned?: number;
}

export interface AppState {
  items: Record<string, StudyItem>;
  courses: Record<string, Course>;
  subDecks: Record<string, { subDecks: Record<string, SubDeckMeta> }>;
  learnProgress: Record<string, Record<string, LearnProgressMeta>>;
  learnSessions: LearnSessionRecord[];
  calibration: CalibrationState;
  stats: StatsState;
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

export interface SessionItem extends StudyItem {
  _presentTier?: Tier;
}

export interface Session {
  queue: SessionItem[];
  idx: number;
  xp: number;
  start: number;
  ratings: number[];
  tierCounts: Record<Tier, number>;
  aiRating?: number;
  recentRatings?: number[];
}

export interface CramState {
  active: boolean;
  daysUntil?: number;
  intensity?: 'critical' | 'high' | 'moderate' | 'low' | 'normal';
  sessionMod?: number;
  intervalMod?: number;
  assessName?: string;
}

export interface TierProfile {
  quickfire: number;
  explain: number;
  apply: number;
  distinguish: number;
  mock: number;
  worked: number;
}

export interface DragonStage {
  stage: number;
  rank: string;
  abbr: string;
  emoji: string;
  next: number;
}

export interface CourseTreeNode {
  topics: Record<string, { cards: string[]; dueCards: number }>;
  totalCards: number;
  dueCards: number;
  subDecks: Record<string, { cards: number; due: number }>;
}

export interface CourseTree {
  [courseName: string]: CourseTreeNode;
}

export type ViewId = 'dashboard' | 'session' | 'done' | 'learn' | 'courseDetail' | 'moduleDetail' | 'topicDetail';

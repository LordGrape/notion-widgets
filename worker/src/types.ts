export interface Env {
  WIDGET_KV: KVNamespace;
  WIDGET_SECRET: string;
  GEMINI_API_KEY: string;
  GOOGLE_TTS_KEY: string;
  NOTION_TOKEN?: string;
  NOTION_DB_ID?: string;
}

export type TutorMode = "socratic" | "quick" | "teach" | "insight" | "acknowledge" | "freeform";

export type DiagnosisType =
  | "factual_miss"
  | "reasoning_gap"
  | "under_elaboration"
  | "misconception"
  | "prerequisite_gap"
  | "framework_mismatch";

export type AnnotationTag = "accurate" | "partial" | "inaccurate" | "missing" | "insight";

export interface Annotation {
  text: string;
  tag: AnnotationTag | string;
  note: string;
}

export type StudyTier = "quickfire" | "explain" | "apply" | "distinguish" | "mock" | "guided" | string;
export type SubjectType = "recall" | "reasoning" | "mixed";

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

export type AIPolicyStance = "banned" | "restricted" | "permitted" | "unspecified";

export interface AIPolicy {
  stance: AIPolicyStance;
  verbatimQuote?: string;
}

export type AcademicIntegrityHint = string;
export type FieldConfidence = "high" | "medium" | "low";

// Keep in sync with studyengine/src/types.ts ParsedSyllabus.
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

export interface ParseSyllabusRequest {
  syllabusText: string;
}

export type ParseSyllabusResponse = ParsedSyllabus;

export interface TutorRequest {
  mode: TutorMode;
  item: {
    prompt: string;
    modelAnswer: string;
    tier?: StudyTier;
    topic?: string;
    course?: string;
    conceptA?: string;
    conceptB?: string;
    task?: string;
  };
  userName?: string;
  userResponse?: string | null;
  conversation?: Array<{ role?: "tutor" | "student" | string; text?: string | null }>;
  context?: {
    isRelearning?: boolean;
    learner?: Record<string, unknown>;
    courseContext?: {
      examType?: string;
      examFormat?: string;
      examDate?: string;
      examWeight?: number | string;
      allowedMaterials?: string;
      professorValues?: string;
      syllabusContext?: string;
    };
    quickFireReRetrieval?: boolean;
    quickFireFollowUp?: boolean;
    userRating?: number;
    lapses?: number;
    sessionRetryCount?: number;
    recentAvgRating?: number;
    quickFireFollowUpQuestion?: string;
    sessionSummary?: string[];
  };
  model?: "flash" | "pro" | string;
  tutorVoice?: "supportive" | "rigorous" | string;
  lectureContext?: {
    courseDigest?: string;
    topicChunk?: string;
  };
}

export interface TutorSocraticOrTeachResponse {
  tutorMessage: string;
  followUpQuestion?: string | null;
  isComplete: boolean;
  suggestedRating?: number | null;
  diagnosisType?: DiagnosisType | null;
  annotations?: Annotation[];
  reconstructionPrompt?: string | null;
}

export interface TutorQuickResponse {
  correct: string;
  missing: string;
  bridge: string;
  quickCheck?: { question: string; answer: string } | null;
  tutorMessage?: string | null;
  suggestedRating?: number | null;
  diagnosisType?: DiagnosisType | null;
  annotations?: Annotation[];
}

export interface TutorInsightResponse {
  insight: string;
  followUpQuestion?: string | null;
  followUpAnswer?: string | null;
}

export interface TutorAcknowledgeResponse {
  acknowledgment: string;
  extensionQuestion?: string | null;
  isComplete: boolean;
  suggestedRating?: number | null;
}

export interface TutorFreeformResponse {
  tutorMessage: string;
  followUpQuestion?: string | null;
  isComplete: boolean;
  suggestedRating?: number | null;
  annotations?: Annotation[];
}

export type TutorResponse =
  | TutorSocraticOrTeachResponse
  | TutorQuickResponse
  | TutorInsightResponse
  | TutorAcknowledgeResponse
  | TutorFreeformResponse;

export interface GradeRequest {
  prompt: string;
  modelAnswer: string;
  userResponse?: string;
  tier?: StudyTier;
  course?: string;
  topic?: string;
  conceptA?: string;
  conceptB?: string;
  mode?: string;
  subjectType?: SubjectType;
  essayOutline?: string;
  lectureContext?: {
    courseDigest?: string;
    topicChunk?: string;
  };
}

export interface ScoreFeedback {
  score: number;
  feedback: string;
}

export interface GradeExplainResponse {
  explanation: string;
  keyPoints: string[];
  memoryHook: string;
}

export interface GradeStandardResponse {
  accuracy: ScoreFeedback;
  depth: ScoreFeedback;
  clarity: ScoreFeedback;
  discrimination?: ScoreFeedback;
  classification?: "single_answer" | "multi_lens";
  improvement: string;
  summary: string;
  annotations: Annotation[];
  essayMode: false;
  totalScore: number;
  maxScore: number;
  fsrsRating: 1 | 2 | 3 | 4;
}

export interface GradeReasoningResponse {
  conceptualAccuracy: ScoreFeedback;
  reasoningQuality: ScoreFeedback;
  criticalEngagement: ScoreFeedback;
  classification?: "single_answer" | "multi_lens";
  improvement: string;
  summary: string;
  annotations: Annotation[];
  essayMode: false;
  totalScore: number;
  maxScore: number;
  fsrsRating: 1 | 2 | 3 | 4;
}

export interface GradeEssayResponse {
  thesisClarity: ScoreFeedback;
  evidenceDensity: ScoreFeedback;
  argumentStructure: ScoreFeedback;
  analyticalDepth: ScoreFeedback;
  conclusionQuality: ScoreFeedback;
  improvement: string;
  summary: string;
  essayMode: true;
  totalScore: number;
  maxScore: number;
  fsrsRating: 1 | 2 | 3 | 4;
}

export type GradeResponse = GradeExplainResponse | GradeStandardResponse | GradeReasoningResponse | GradeEssayResponse;

export interface VisualRequest {
  prompt: string;
  modelAnswer: string;
  tier?: StudyTier;
  course?: string;
  topic?: string;
  conceptA?: string;
  conceptB?: string;
}

export interface VisualResponse {
  visual: string | null;
}

export interface TTSRequest {
  text: string;
  voiceName?: string;
  languageCode?: string;
}

export interface TTSResponse {
  audioContent: string;
}

export interface PrimeRequest {
  courseName?: string;
  topicName?: string;
  syllabusContext?: string;
  existingCards?: Array<{ prompt?: string }>;
}

export type PrimeQuestionType = "factual" | "conceptual" | "application";

export interface PrimeResponse {
  prequestions: Array<{
    question: string;
    type: PrimeQuestionType | string;
  }>;
}

export interface DistillRequest {
  courseName: string;
  lectureTitle?: string;
  rawText: string;
  existingSyllabusContext?: string;
}

export interface DistillResponse {
  courseDigestUpdate: string;
  topicChunks: Array<{ topic: string; kvKey: string }>;
  suggestedCards: Array<{
    prompt?: string;
    modelAnswer?: string;
    topic?: string;
    tier?: "quickfire" | "explain" | "apply" | string;
  }>;
  totalChunksStored: number;
}

export interface LearnRequest {
  course: string;
  topics: string[];
  cards: Array<{
    id?: string;
    prompt?: string;
    modelAnswer?: string;
  }>;
  courseContext?: {
    syllabusContext?: string;
    professorValues?: string;
  };
}

export type LearnCheckType = "elaborative" | "predict";

export interface LearnPlanSegment {
  id: string;
  concept: string;
  explanation: string;
  elaboration: string;
  checkType: LearnCheckType;
  checkQuestion: string;
  checkAnswer: string;
  linkedCardIds: string[];
}

export interface LearnPlanConsolidationQuestion {
  question: string;
  answer: string;
  linkedCardIds: string[];
}

export interface LearnResponse {
  segments: LearnPlanSegment[];
  consolidationQuestions: LearnPlanConsolidationQuestion[];
}

export interface ErrorResponse {
  error: string;
  detail?: string;
  raw?: string;
  status?: number;
}


export interface SyllabusRequest {
  rawText?: string;
  courseName?: string;
  existingExamType?: string;
}

export interface SummaryRequest {
  userName?: string;
  sessionStats?: {
    totalCards?: number;
    avgRating?: number;
    ratingDistribution?: Record<string, number>;
    courseBreakdown?: Record<string, number>;
    dontKnows?: number;
    skips?: number;
    tutorModes?: Record<string, number>;
  };
  weakCards?: Array<{ topic?: string; prompt?: string }>;
  strongCards?: Array<{ topic?: string }>;
  calibrationBefore?: number | string | null;
  calibrationAfter?: number | string | null;
}

export interface PrepareRequest {
  courseName?: string;
  cards?: Array<{ prompt?: string; topic?: string }>;
  existingCourseContext?: {
    syllabusContext?: string;
  };
}

export interface FetchLectureRequest {
  url?: string;
}

export interface LectureContextRequest {
  courseName?: string;
  topic?: string;
}

export interface LectureChunk {
  topic?: string;
  keyTerms?: string[];
  content?: string;
}

export interface MemoryRequest {
  item?: {
    prompt?: string;
    modelAnswer?: string;
    course?: string;
    topic?: string;
  };
  userName?: string;
  dialogue?: Array<{ role?: string; text?: string | null }>;
  suggestedRating?: number;
  existingMemories?: Array<{
    id?: string;
    type?: string;
    confidence?: number;
    content?: string;
  }>;
}

export interface ReformulateRequest {
  originalPrompt?: string;
  modelAnswer?: string;
  tier?: string;
  course?: string;
  topic?: string;
  lapses?: number;
  diagnosisHistory?: Array<{ type?: string }>;
}

export interface LearnCheckRequest {
  concept?: string;
  checkQuestion?: string;
  checkAnswer?: string;
  userResponse?: string;
}

export interface ExamTriageRequest {
  topics?: string[];
  topicCardCounts?: Record<string, number>;
  topicRetention?: Record<string, number>;
  topicLearnStatus?: Record<string, string>;
  chooseN?: number | null;
  outOfM?: number | null;
  syllabusContext?: string;
  rawQuestions?: string;
  mode?: string;
  questions?: Array<{
    id?: string;
    text?: string;
    mappedTopics?: string[];
    themes?: string[];
  }>;
}

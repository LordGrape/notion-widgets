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
  courseContext?: ParsedSyllabus;
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
  courseContext?: ParsedSyllabus;
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

export interface IngestExtractRequest {
  markdown: string;
  subDeckId?: string;
  courseId?: string;
  originDocUrl?: string;
  lectureAttended: boolean;
  chunkIndex: number;
  chunkCount: number;
  requestId: string;
}

export interface ExtractedDraft {
  prompt: string;
  modelAnswer: string;
  sourceParagraphSnippet: string;
  sourceLineRange: { start: number; end: number };
  confidence: "high" | "medium" | "low";
}

export interface IngestExtractResponse {
  drafts: ExtractedDraft[];
  warnings: Array<{ severity: "info" | "warn"; message: string }>;
  chunksRemaining: number;
  budgetState: { proCallsRemainingToday: number };
}

export interface StudyCardInput {
  id?: string;
  prompt?: string;
  modelAnswer?: string;
}

export type PlanProfile = "theory" | "factual" | "procedural" | "language";

export interface LearnPlanRequest {
  course: string;
  subDeck: string;
  cards: StudyCardInput[];
  planProfile?: PlanProfile;
  targetLanguage?: string;
  languageLevel?: number;
  userName?: string;
  learnerContext?: string;
  priorKnowledge?: "high" | "mixed" | "low";
  appendTransferQuestion?: boolean;
}

export type LearnMechanism =
  | "worked_example"
  | "elaborative_interrogation"
  | "self_explanation"
  | "predictive_question"
  | "test_closure";

export interface GroundingSnippet {
  cardId: string;
  quote: string;
}

export type LearnCheckType = "elaborative" | "predictive" | "self_explain" | "prior_knowledge_probe" | "worked_example" | "transfer_question" | "cloze";

export interface LearnPlanSegment {
  id: string;
  title: string;
  mechanism: LearnMechanism;
  objective: string;
  /**
   * Declarative pre-retrieval teaching block. Must be grounded in the card
   * corpus, must not be a question, and is validated post-emission
   * (see verifySegmentTeach in routes/learn-plan.ts). Minimum 60 words to pass
   * validation; Gemini is instructed to target >=80 words.
   */
  teach: string;
  tutorPrompt: string;
  checkType: LearnCheckType;
  expectedAnswer: string;
  linkedCardIds: string[];
  groundingSnippets: GroundingSnippet[];
  fadeLevel?: 1 | 2 | 3;
  workedExampleId?: string;
  isProbe?: boolean;
  questionQualityWarning?: "answer_copyable_from_teach";
}

export interface ConsolidationQuestion {
  question: string;
  answer: string;
  linkedCardIds: string[];
}

export interface LearnPlanResponse {
  segments: LearnPlanSegment[];
  consolidationQuestions?: ConsolidationQuestion[];
  planMode?: "verified" | "retry_verified" | "card_density_fallback";
  warning?: string;
}

export interface LearnTurnRequest {
  mechanism: LearnMechanism;
  segment: LearnPlanSegment;
  userInput?: string;
  userName?: string;
  segmentLimit?: 1;
}

export type LearnTurnVerdict = "surface" | "partial" | "deep";

/**
 * Graded turn payload. Byte-identical to the pre-discriminated-union schema
 * (verdict, understandingScore, copyRatio, missingConcepts, feedback, followUp,
 * advance). Clients that predate the `ok` envelope look at these fields
 * directly; the envelope adds `ok: true` without renaming anything.
 */
export interface LearnTurnSuccess {
  ok: true;
  verdict: LearnTurnVerdict;
  understandingScore: number;
  copyRatio: number;
  missingConcepts: string[];
  feedback: string;
  followUp: string | null;
  advance: boolean;
}

/**
 * Structured failure envelope. Always returned with HTTP 200 so clients can
 * branch on `errorCode` without double-handling a network status. The 400/405
 * client-fault responses remain on the legacy `{ error: string }` shape.
 *
 * errorCode semantics:
 *   - "upstream_failed": Gemini threw or returned non-2xx (retry-safe, transient).
 *   - "schema_invalid" : Gemini returned a body `parseJsonResponse` rejected
 *                         twice in a row (retry already attempted worker-side).
 *   - "internal_error" : Anything else thrown from the handler body.
 */
export type LearnTurnErrorCode = "upstream_failed" | "schema_invalid" | "internal_error";

export interface LearnTurnFailure {
  ok: false;
  errorCode: LearnTurnErrorCode;
  message: string;
}

export type LearnTurnResponse = LearnTurnSuccess | LearnTurnFailure;

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

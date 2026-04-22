import type { AppState, StudyItem, SubDeckMeta } from './types';
import { createSubDeck, getCardsInSubDeck, loadSubDecks } from './sub-decks';

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
  tutorPrompt: string;
  expectedAnswer: string;
  linkedCardIds: string[];
  groundingSnippets: GroundingSnippet[];
}

export interface ConsolidationQuestion {
  question: string;
  answer: string;
  linkedCardIds: string[];
}

export interface LearnPlan {
  segments: LearnSegment[];
  consolidationQuestions?: ConsolidationQuestion[];
  planMode?: 'verified' | 'retry_verified' | 'card_density_fallback';
  warning?: string;
}

export interface LearnSessionState {
  plan: LearnPlan;
  index: number;
  currentMechanism: LearnMechanism;
  completedSegmentIds: string[];
}

export interface LearnTurnResult {
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

interface CourseLike {
  name?: string;
}

const LEARN_PLAN_ENDPOINT = 'https://widget-sync.lordgrape-widgets.workers.dev/studyengine/learn-plan';
const LEARN_TURN_ENDPOINT = 'https://widget-sync.lordgrape-widgets.workers.dev/studyengine/learn-turn';

function normalize(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function verifyConsolidationQuestions(questions: ConsolidationQuestion[], items: StudyItem[]): ConsolidationQuestion[] {
  const cardMap = new Map<string, string>();
  (items || []).forEach((item) => {
    if (!item || !item.id) return;
    cardMap.set(item.id, `${item.prompt || ''}\n${item.modelAnswer || ''}`);
  });
  return (questions || []).filter((q) => {
    if (!q || !q.question || !q.answer) return false;
    const linked = Array.isArray(q.linkedCardIds) ? q.linkedCardIds : [];
    if (linked.length === 0) return false;
    const ans = normalize(q.answer);
    if (!ans || ans.length < 10) return false;
    const anchor = ans.length > 200 ? ans.slice(0, 200) : ans;
    return linked.some((cardId) => {
      const source = cardMap.get(String(cardId || ''));
      if (!source) return false;
      return normalize(source).includes(anchor);
    });
  });
}

export function substringVerified(segments: LearnSegment[], items: StudyItem[]): LearnSegment[] {
  const cardMap = new Map<string, string>();
  (items || []).forEach((item) => {
    if (!item || !item.id) return;
    cardMap.set(item.id, `${item.prompt || ''}\n${item.modelAnswer || ''}`);
  });

  return (segments || []).filter((segment) => {
    if (!Array.isArray(segment.groundingSnippets) || segment.groundingSnippets.length === 0) return false;
    return segment.groundingSnippets.every((snippet) => {
      const source = cardMap.get(String(snippet.cardId || ''));
      if (!source) return false;
      const quote = normalize(snippet.quote || '');
      if (!quote || quote.length < 10) return false;
      return normalize(source).includes(quote);
    });
  });
}

export async function generateLearnPlan(course: string, subDeck: string, items: StudyItem[], userName = '', learnerContext = ''): Promise<LearnPlan> {
  const cards = getCardsInSubDeck(course, subDeck, items).map((item) => ({
    id: item.id,
    prompt: item.prompt,
    modelAnswer: item.modelAnswer
  }));

  const response = await fetch(LEARN_PLAN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      course,
      subDeck,
      cards,
      userName,
      learnerContext
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Learn plan failed: ${detail}`);
  }

  const data = (await response.json()) as LearnPlan;
  const subDeckCards = getCardsInSubDeck(course, subDeck, items);
  const verifiedSegments = substringVerified(data.segments || [], subDeckCards);
  if (verifiedSegments.length < 2) {
    throw new Error('Learn plan grounding verification failed: fewer than 2 verified segments.');
  }
  const verifiedQuestions = verifyConsolidationQuestions(data.consolidationQuestions || [], subDeckCards);

  return { ...data, segments: verifiedSegments, consolidationQuestions: verifiedQuestions };
}

export function startLearnSession(plan: LearnPlan): LearnSessionState {
  const first = (plan.segments && plan.segments[0]) || null;
  return {
    plan,
    index: 0,
    currentMechanism: first ? first.mechanism : 'worked_example',
    completedSegmentIds: []
  };
}

export async function runLearnTurn(session: LearnSessionState, userInput: string, userName = ''): Promise<LearnTurnResult> {
  const segment = session.plan.segments[session.index];
  if (!segment) throw new Error('No active learn segment.');

  const response = await fetch(LEARN_TURN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mechanism: segment.mechanism,
      segment,
      userInput,
      userName
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Learn turn failed: ${detail}`);
  }

  return (await response.json()) as LearnTurnResult;
}

export function completeLearnSegment(session: LearnSessionState, segmentId: string): void {
  if (!session.completedSegmentIds.includes(segmentId)) {
    session.completedSegmentIds.push(segmentId);
  }
  if (session.index < session.plan.segments.length - 1) {
    session.index += 1;
    session.currentMechanism = session.plan.segments[session.index].mechanism;
  }
}

export function getCoverageStats(course: string, subDeck: string, items: StudyItem[]): {
  total: number;
  taught: number;
  consolidated: number;
  unlearned: number;
  pctUnlearned: number;
} {
  const cards = getCardsInSubDeck(course, subDeck, items);
  let taught = 0;
  let consolidated = 0;
  let unlearned = 0;

  cards.forEach((card) => {
    const status = (card.learnStatus ?? null) as LearnStatus;
    if (status === 'consolidated') consolidated += 1;
    else if (status === 'taught') taught += 1;
    else if (status === 'unlearned') unlearned += 1;
  });

  return {
    total: cards.length,
    taught,
    consolidated,
    unlearned,
    pctUnlearned: cards.length ? Math.round((unlearned / cards.length) * 100) : 0
  };
}

export function maybeDemoteOnAgain(item: StudyItem, rating: 1 | 2 | 3 | 4): boolean {
  if (rating === 1 && item.learnStatus === 'consolidated') {
    item.learnStatus = 'taught';
    return true;
  }
  return false;
}

export function applyLearnStatusMigration(items: Record<string, StudyItem>): void {
  Object.keys(items || {}).forEach((itemId) => {
    const item = items[itemId];
    if (!item) return;
    if (typeof item.learnStatus === 'undefined') {
      item.learnStatus = null;
    }
    if (typeof item.consolidationRating === 'undefined') {
      item.consolidationRating = null;
    }
  });
}

function getCourseName(course: CourseLike | string): string {
  if (typeof course === 'string') return String(course || '').trim();
  return String(course?.name || '').trim();
}

function getCourseSubDeckEntries(courseName: string, state: AppState): Array<{ key: string; meta: SubDeckMeta }> {
  const map = (state?.subDecks && state.subDecks[courseName]) ? state.subDecks[courseName] : {};
  return Object.keys(map || {})
    .map((key) => ({ key, meta: map[key] }))
    .filter((entry) => !!entry.meta)
    .sort((a, b) => {
      const ao = typeof a.meta.order === 'number' ? a.meta.order : 0;
      const bo = typeof b.meta.order === 'number' ? b.meta.order : 0;
      if (ao !== bo) return ao - bo;
      return String(a.meta.name || '').localeCompare(String(b.meta.name || ''));
    });
}

function findSubDeckKeyByName(courseName: string, state: AppState, targetName: string): string | null {
  const needle = String(targetName || '').trim().toLowerCase();
  if (!needle) return null;
  const entries = getCourseSubDeckEntries(courseName, state);
  for (const entry of entries) {
    if (String(entry.meta.name || '').trim().toLowerCase() === needle) {
      return entry.key;
    }
  }
  return null;
}

export function resolveCourseLearnEntry(course: CourseLike | string, state: AppState): CourseLearnEntryResolution {
  const courseName = getCourseName(course);
  const subDeckEntries = getCourseSubDeckEntries(courseName, state);
  if (subDeckEntries.length === 0) return { kind: 'empty-prompt' };
  if (subDeckEntries.length === 1) return { kind: 'single', subDeckKey: subDeckEntries[0].key };

  const items = Object.keys(state?.items || {}).map((id) => state.items[id]).filter((item): item is StudyItem => !!item);
  const subDecks: CourseLearnPickerSubDeck[] = subDeckEntries.map((entry) => {
    const coverage = getCoverageStats(courseName, entry.key, items);
    return {
      key: entry.key,
      name: String(entry.meta.name || entry.key),
      stats: {
        total: Number(coverage.total || 0),
        consolidated: Number(coverage.consolidated || 0),
        unlearned: Number(coverage.unlearned || 0),
      }
    };
  });
  return { kind: 'picker', subDecks };
}

export function createDefaultSubDeckForCourse(course: CourseLike | string, state: AppState): string {
  const courseName = getCourseName(course);
  const existingKey = findSubDeckKeyByName(courseName, state, 'All cards');
  if (existingKey) return existingKey;

  loadSubDecks(state);
  createSubDeck(courseName, 'All cards');
  const createdKey = findSubDeckKeyByName(courseName, state, 'All cards');
  if (!createdKey) {
    throw new Error('Could not create default sub-deck.');
  }

  Object.keys(state.items || {}).forEach((itemId) => {
    const item = state.items[itemId];
    if (!item || item.course !== courseName) return;
    item.subDeck = createdKey;
  });

  return createdKey;
}

(globalThis as typeof globalThis & { __studyEngineLearnMode?: Record<string, unknown> }).__studyEngineLearnMode = {
  generateLearnPlan,
  startLearnSession,
  runLearnTurn,
  completeLearnSegment,
  getCoverageStats,
  substringVerified,
  verifyConsolidationQuestions,
  maybeDemoteOnAgain,
  applyLearnStatusMigration,
  resolveCourseLearnEntry,
  createDefaultSubDeckForCourse
};

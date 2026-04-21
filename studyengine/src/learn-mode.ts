import type { StudyItem } from './types';
import { getCardsInSubDeck } from './sub-decks';

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

export interface LearnPlan {
  segments: LearnSegment[];
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

const LEARN_PLAN_ENDPOINT = 'https://widget-sync.lordgrape-widgets.workers.dev/studyengine/learn-plan';
const LEARN_TURN_ENDPOINT = 'https://widget-sync.lordgrape-widgets.workers.dev/studyengine/learn-turn';

function normalize(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
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
  const verifiedSegments = substringVerified(data.segments || [], getCardsInSubDeck(course, subDeck, items));
  if (verifiedSegments.length < 2) {
    throw new Error('Learn plan grounding verification failed: fewer than 2 verified segments.');
  }

  return { ...data, segments: verifiedSegments };
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

(globalThis as typeof globalThis & { __studyEngineLearnMode?: Record<string, unknown> }).__studyEngineLearnMode = {
  generateLearnPlan,
  startLearnSession,
  runLearnTurn,
  completeLearnSegment,
  getCoverageStats,
  substringVerified,
  maybeDemoteOnAgain,
  applyLearnStatusMigration
};

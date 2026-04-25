import { resolveCourseLearnEntry } from './learn-mode';
import { buildSessionQueue, startSession } from './session-flow';
import { getCardsInScope } from './sub-decks';
import type { AppState, StudyItem } from './types';

type Scope = { course: string; subDeck?: string };

type StudyFlowBridge = {
  state?: Record<string, any>;
  startReviewSession?: (scope: Scope, onComplete?: () => void) => void;
  startLearnSessionForScope?: (scope: Scope, resolution: ReturnType<typeof resolveCourseLearnEntry>) => void;
  showAllCaughtUp?: () => void;
};

function getBridge(): StudyFlowBridge {
  return ((globalThis as any).__studyEngineStudyFlow || {}) as StudyFlowBridge;
}

function hasLearnableCards(cards: StudyItem[]): boolean {
  return cards.some((item) => item.learnStatus === 'unlearned');
}

export async function startStudySession(scope: Scope): Promise<void> {
  const bridge = getBridge();
  const state = bridge.state as AppState | undefined;
  if (!state || !state.items) {
    bridge.showAllCaughtUp?.();
    return;
  }

  const allItems = Object.keys(state.items)
    .map((id) => state.items[id] as StudyItem)
    .filter((item): item is StudyItem => !!item);
  const scopedCards = getCardsInScope(scope.course, scope.subDeck ?? null, allItems, state, { includeArchivedSubDecks: false })
    .filter((item) => item.lifecycleStage !== 'retired');
  const scopedIds = new Set(scopedCards.map((item) => item.id));
  const reviewQueue = buildSessionQueue().filter((item) => scopedIds.has(item.id) && item.lifecycleStage !== 'retired');
  const learnResolution = resolveCourseLearnEntry(scope.course, state);
  const learnAvailable = hasLearnableCards(scopedCards);

  const startLearn = () => {
    if (!learnAvailable) return;
    bridge.startLearnSessionForScope?.(scope, learnResolution);
  };

  if (reviewQueue.length > 0) {
    if (bridge.startReviewSession) {
      bridge.startReviewSession(scope, startLearn);
    } else {
      startSession();
      startLearn();
    }
    return;
  }

  if (learnAvailable) {
    startLearn();
    return;
  }

  bridge.showAllCaughtUp?.();
}

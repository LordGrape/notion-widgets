import { resolveCourseLearnEntry, runRelearningBurst } from './learn-mode';
import { buildSessionQueue, startSession } from './session-flow';
import { getCardsInScope } from './sub-decks';
import { getNextBurstTs, reconcileMissedBursts, recordBurstCompletion } from './relearning-battery';
import type { AppState, StudyItem } from './types';

type Scope = { course: string; subDeck?: string };

type StudyFlowBridge = {
  state?: Record<string, any>;
  startReviewSession?: (scope: Scope, onComplete?: () => void) => void;
  startLearnSessionForScope?: (scope: Scope, resolution: ReturnType<typeof resolveCourseLearnEntry>) => void;
  showAllCaughtUp?: (message?: string) => void;
};

function getBridge(): StudyFlowBridge {
  return ((globalThis as any).__studyEngineStudyFlow || {}) as StudyFlowBridge;
}

function hasLearnableCards(cards: StudyItem[]): boolean {
  return cards.some((item) => item.learnStatus === 'unlearned');
}

function formatApproxDuration(ms: number): string {
  const hours = Math.max(1, Math.round(ms / (60 * 60 * 1000)));
  if (hours < 48) return `~${hours}h`;
  const days = Math.max(1, Math.round(hours / 24));
  return `~${days}d`;
}

// B3: clearer copy when everything has been reviewed and is scheduled out.
export function summarizeAllCaughtUp(cards: StudyItem[], nowTs = Date.now()): string {
  const total = (cards || []).length;
  if (!total) return 'All caught up';
  const reviewed = cards.filter((card) => !!card?.fsrs?.lastReview);
  if (reviewed.length !== total) return 'All caught up';
  const dueTimes = reviewed
    .map((card) => new Date(card.fsrs.due).getTime())
    .filter((ts) => Number.isFinite(ts));
  if (!dueTimes.length) return `All ${total} cards reviewed.`;
  const nearestDue = Math.min(...dueTimes);
  if (nearestDue <= nowTs) return `All ${total} cards reviewed.`;
  return `All ${total} cards reviewed. Next due in ${formatApproxDuration(nearestDue - nowTs)}.`;
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
  const run2Enabled = state.studyEngineFeatures?.run2Generative !== false;
  if (run2Enabled) {
    scopedCards.forEach((item) => {
      if (item.relearningBattery) reconcileMissedBursts(item, Date.now());
    });
    const dueBursts = scopedCards.filter((item) => {
      const next = getNextBurstTs(item, Date.now());
      return next != null && next <= Date.now();
    });
    for (const item of dueBursts) {
      try {
        const result = await runRelearningBurst(item);
        recordBurstCompletion(item, result.verdict === 'deep', Date.now());
      } catch (e) {
        break;
      }
    }
  }

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

  bridge.showAllCaughtUp?.(summarizeAllCaughtUp(scopedCards));
}

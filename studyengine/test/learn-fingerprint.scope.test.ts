import { describe, expect, it } from 'vitest';
import type { AppState, StudyItem } from '../src/types';
import { fingerprintSubDeckCards } from '../src/learn-mode';
import { getCardsInScope, getCardsInSubDeck } from '../src/sub-decks';

function makeState(): { state: AppState; items: StudyItem[] } {
  const nowIso = new Date('2026-04-25T00:00:00.000Z').toISOString();
  const card = (id: string, subDeck: string): StudyItem => ({
    id,
    prompt: `prompt-${id}`,
    modelAnswer: `answer-${id}`,
    course: 'Math',
    subDeck,
    created: nowIso,
    fsrs: { difficulty: 5, stability: 1, due: nowIso, reps: 0, lapses: 0, lastReview: null, state: 'new' }
  });
  const state: AppState = {
    items: {},
    courses: {},
    calibration: { totalSelfRatings: 0, totalActualCorrect: 0, history: [] },
    stats: {
      totalReviews: 0,
      streakDays: 0,
      lastSessionDate: '',
      reviewsByTier: { quickfire: 0, explain: 0, apply: 0, distinguish: 0, mock: 0, worked: 0 }
    },
    learnPlans: {},
    subDecks: {
      Math: {
        parent: { name: 'Parent', order: 0, created: 1, parentSubDeck: null, archived: false },
        child: { name: 'Child', order: 1, created: 2, parentSubDeck: 'parent', archived: false }
      }
    }
  };
  const items = [card('p1', 'parent'), card('c1', 'child')];
  items.forEach((it) => { state.items[it.id] = it; });
  return { state, items };
}

function persistLearnPlanCache(state: AppState, course: string, subDeckKey: string, fingerprint: string) {
  if (!state.learnPlans) state.learnPlans = {};
  if (!state.learnPlans[course]) state.learnPlans[course] = {};
  state.learnPlans[course][subDeckKey] = {
    fingerprint,
    plan: [],
    generatedAt: Date.now(),
    planVersion: 1,
    subDeckFingerprint: fingerprint
  };
}

function openCachedPlan(state: AppState, course: string, subDeckKey: string) {
  return state.learnPlans?.[course]?.[subDeckKey] || null;
}

describe('learn fingerprint scope split', () => {
  it('sub-deck Learn fingerprint uses direct cards only', () => {
    const { items } = makeState();
    const direct = getCardsInSubDeck('Math', 'parent', items);
    const scoped = [
      ...getCardsInSubDeck('Math', 'parent', items),
      ...getCardsInSubDeck('Math', 'child', items)
    ];
    expect(fingerprintSubDeckCards(direct)).toBe(fingerprintSubDeckCards(getCardsInSubDeck('Math', 'parent', items)));
    expect(fingerprintSubDeckCards(direct)).not.toBe(fingerprintSubDeckCards(scoped));
  });

  it('course-root Learn fingerprint uses getCardsInScope(course, null, ...)', () => {
    const { state, items } = makeState();
    const courseCards = getCardsInScope('Math', null, items, state, { includeArchived: false });
    expect(fingerprintSubDeckCards(courseCards)).toBe(
      fingerprintSubDeckCards([getCardsInSubDeck('Math', 'parent', items)[0], getCardsInSubDeck('Math', 'child', items)[0]])
    );
  });

  it('adding descendant card invalidates course-root fingerprint but not parent direct fingerprint', () => {
    const { state, items } = makeState();
    const parentBefore = fingerprintSubDeckCards(getCardsInSubDeck('Math', 'parent', items));
    const rootBefore = fingerprintSubDeckCards(getCardsInScope('Math', null, items, state, { includeArchived: false }));

    const extra: StudyItem = {
      id: 'c2',
      prompt: 'prompt-c2',
      modelAnswer: 'answer-c2',
      course: 'Math',
      subDeck: 'child',
      created: new Date('2026-04-25T00:00:00.000Z').toISOString(),
      fsrs: { difficulty: 5, stability: 1, due: new Date('2026-04-25T00:00:00.000Z').toISOString(), reps: 0, lapses: 0, lastReview: null, state: 'new' }
    };
    state.items[extra.id] = extra;
    items.push(extra);

    const parentAfter = fingerprintSubDeckCards(getCardsInSubDeck('Math', 'parent', items));
    const rootAfter = fingerprintSubDeckCards(getCardsInScope('Math', null, items, state, { includeArchived: false }));

    expect(parentAfter).toBe(parentBefore);
    expect(rootAfter).not.toBe(rootBefore);
  });

  it('persist/open cache round-trip preserves fingerprints for __course_root__ and regular sub-deck', () => {
    const { state, items } = makeState();
    const parentFingerprint = fingerprintSubDeckCards(getCardsInSubDeck('Math', 'parent', items));
    const rootFingerprint = fingerprintSubDeckCards(getCardsInScope('Math', null, items, state, { includeArchived: false }));

    persistLearnPlanCache(state, 'Math', 'parent', parentFingerprint);
    persistLearnPlanCache(state, 'Math', '__course_root__', rootFingerprint);

    expect(openCachedPlan(state, 'Math', 'parent')?.subDeckFingerprint).toBe(parentFingerprint);
    expect(openCachedPlan(state, 'Math', '__course_root__')?.subDeckFingerprint).toBe(rootFingerprint);
  });
});

import { describe, expect, it } from 'vitest';
import { createSubDeck, fillMissingSubDeckLanguageMeta, loadSubDecks, migrateSubDecks } from './sub-decks';
import type { AppState } from './types';

function baseState(): AppState {
  return {
    items: {},
    courses: {},
    calibration: { totalSelfRatings: 0, totalActualCorrect: 0, history: [] },
    stats: {
      totalReviews: 0,
      streakDays: 0,
      lastSessionDate: '',
      reviewsByTier: { quickfire: 0, explain: 0, apply: 0, distinguish: 0, mock: 0, worked: 0 },
    },
  };
}

describe('migrateSubDecks', () => {
  it('handles empty state', () => {
    const state = baseState();
    migrateSubDecks(state);
    expect(state.subDecks).toEqual({});
  });

  it('adds subDecks for legacy state with no key', () => {
    const state = baseState();
    state.items = {
      a: {
        id: 'a',
        prompt: 'P',
        modelAnswer: 'A',
        course: 'TEST 101',
        created: new Date().toISOString(),
        fsrs: { difficulty: 0, stability: 0, due: new Date().toISOString(), reps: 0, lapses: 0, lastReview: null, state: 'new' },
        subdeck: 'week-1',
      },
    };
    migrateSubDecks(state);
    expect(state.subDecks).toEqual({});
    expect(state.items.a.subDeck).toBe('week-1');
  });

  it('preserves pre-existing subDecks data', () => {
    const state = baseState();
    state.subDecks = {
      'TEST 101': {
        'week-1': { name: 'Week 1', order: 0, created: 123 },
      },
    };

    migrateSubDecks(state);
    expect(state.subDecks).toEqual({
      'TEST 101': {
        'week-1': { name: 'Week 1', order: 0, created: 123, color: undefined, icon: undefined },
      },
    });
  });

  it('is idempotent when run twice', () => {
    const state = baseState();
    state.items = {
      a: {
        id: 'a',
        prompt: 'P',
        modelAnswer: 'A',
        course: 'TEST 101',
        created: new Date().toISOString(),
        fsrs: { difficulty: 0, stability: 0, due: new Date().toISOString(), reps: 0, lapses: 0, lastReview: null, state: 'new' },
        subDeck: 'week-1',
      },
    };
    state.subDecks = {
      'TEST 101': {
        'week-1': { name: 'Week 1', order: 0, created: 123 },
      },
    };

    migrateSubDecks(state);
    const once = JSON.parse(JSON.stringify(state));
    migrateSubDecks(state);
    expect(state).toEqual(once);
  });
});

describe('createSubDeck', () => {
  it('stores forwarded language metadata when provided', () => {
    const state = baseState();
    loadSubDecks(state);

    const created = createSubDeck('FR 101', 'Core 2000', {
      // B3: deferred L1a forwarding path.
      planProfile: 'language',
      targetLanguage: 'fr-CA',
      languageLevel: 2
    });

    expect(created.planProfile).toBe('language');
    expect(created.targetLanguage).toBe('fr-CA');
    expect(created.languageLevel).toBe(2);
  });

  it('fills missing language metadata without overwriting existing values', () => {
    const base = {
      name: 'Core',
      order: 0,
      created: 1,
      targetLanguage: 'fr-CA'
    } as any;
    const merged = fillMissingSubDeckLanguageMeta(base, {
      planProfile: 'language',
      targetLanguage: 'es-ES',
      languageLevel: 1
    });

    // B3: mirrors commitImport re-import behavior.
    expect(merged.planProfile).toBe('language');
    expect(merged.targetLanguage).toBe('fr-CA');
    expect(merged.languageLevel).toBe(1);
  });
});

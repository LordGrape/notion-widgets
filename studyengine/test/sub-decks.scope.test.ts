import { describe, expect, it, vi } from 'vitest';
import type { AppState, StudyItem } from '../src/types';
import {
  loadSubDecks,
  getCardsInScope,
  moveSubDeck,
  archiveSubDeck,
  unarchiveSubDeck,
  migrateSubDecks,
} from '../src/sub-decks';

function stateWithSubDecks(): AppState {
  const nowIso = new Date('2026-04-25T00:00:00.000Z').toISOString();
  const baseCard = (id: string, subDeck: string | null, archived = false): StudyItem => ({
    id,
    prompt: id,
    modelAnswer: `answer-${id}`,
    course: 'Biology',
    subDeck,
    archived,
    created: nowIso,
    fsrs: { difficulty: 5, stability: 1, due: nowIso, reps: 0, lapses: 0, lastReview: null, state: 'new' }
  });
  return {
    items: {
      root: baseCard('root', null),
      a1: baseCard('a1', 'a'),
      b1: baseCard('b1', 'b'),
      c1: baseCard('c1', 'c'),
      x1: baseCard('x1', 'x', true)
    },
    courses: {},
    calibration: { totalSelfRatings: 0, totalActualCorrect: 0, history: [] },
    stats: {
      totalReviews: 0,
      streakDays: 0,
      lastSessionDate: '',
      reviewsByTier: { quickfire: 0, explain: 0, apply: 0, distinguish: 0, mock: 0, worked: 0 }
    },
    subDecks: {
      Biology: {
        a: { name: 'A', order: 0, created: 1, parentSubDeck: null, archived: false },
        b: { name: 'B', order: 1, created: 2, parentSubDeck: 'a', archived: false },
        c: { name: 'C', order: 2, created: 3, parentSubDeck: 'b', archived: false },
        x: { name: 'Archived', order: 3, created: 4, parentSubDeck: null, archived: true, archivedAt: 100 }
      }
    }
  };
}

describe('sub-deck scope', () => {
  it('getCardsInScope returns direct cards when key has no descendants', () => {
    const state = stateWithSubDecks();
    const cards = getCardsInScope('Biology', 'c', Object.values(state.items), state, { includeArchived: false });
    expect(cards.map((c) => c.id)).toEqual(['c1']);
  });

  it('getCardsInScope returns direct + descendants when nested', () => {
    const state = stateWithSubDecks();
    const cards = getCardsInScope('Biology', 'a', Object.values(state.items), state, { includeArchived: false });
    expect(cards.map((c) => c.id).sort()).toEqual(['a1', 'b1', 'c1']);
  });

  it('getCardsInScope respects includeArchived:false at every depth', () => {
    const state = stateWithSubDecks();
    state.subDecks!.Biology.b.archived = true;
    const cards = getCardsInScope('Biology', 'a', Object.values(state.items), state, { includeArchived: false });
    expect(cards.map((c) => c.id)).toEqual(['a1']);
  });

  it('moveSubDeck throws when newParent is in descendants(key)', () => {
    const state = stateWithSubDecks();
    loadSubDecks(state);
    const before = JSON.stringify(state.subDecks);
    expect(() => moveSubDeck('Biology', 'a', 'c')).toThrow(/descendants/i);
    expect(JSON.stringify(state.subDecks)).toBe(before);
  });

  it('archiveSubDeck/unarchiveSubDeck set and clear archive metadata', () => {
    const state = stateWithSubDecks();
    loadSubDecks(state);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T12:00:00.000Z'));
    archiveSubDeck('Biology', 'a');
    expect(state.subDecks!.Biology.a.archived).toBe(true);
    expect(state.subDecks!.Biology.a.archivedAt).toBe(1777118400000);
    unarchiveSubDeck('Biology', 'a');
    expect(state.subDecks!.Biology.a.archived).toBeUndefined();
    expect(state.subDecks!.Biology.a.archivedAt).toBeUndefined();
    vi.useRealTimers();
  });

  it('migrateSubDecks snapshot emits optional metadata only when present', () => {
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
      subDecks: {
        Chemistry: {
          base: { name: 'Base', order: 0, created: 1 },
          child: { name: 'Child', order: 1, created: 2, parentSubDeck: 'base', archived: true, archivedAt: 10 }
        }
      }
    };
    migrateSubDecks(state);
    expect(state.subDecks).toMatchSnapshot();
  });
});

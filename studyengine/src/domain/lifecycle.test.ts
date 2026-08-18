import { describe, expect, it } from 'vitest';
import type { StudyItem } from '../types';
import {
  applyLearnStatusMigration,
  deriveLifecycleStage,
  setLifecycleStage,
} from './lifecycle';

let seq = 0;

function makeCard(overrides: Partial<StudyItem> = {}): StudyItem {
  seq += 1;
  return {
    id: `syn-${seq}`,
    prompt: 'What gas do plants release during photosynthesis?',
    modelAnswer: 'Oxygen.',
    created: '2026-01-01T00:00:00.000Z',
    fsrs: {
      difficulty: 0,
      stability: 0,
      due: '2026-01-02T00:00:00.000Z',
      reps: 0,
      lapses: 0,
      lastReview: null,
      state: 'new',
    },
    ...overrides,
  } as StudyItem;
}

describe('deriveLifecycleStage', () => {
  it('returns retired only when suspended and archived together', () => {
    expect(deriveLifecycleStage(makeCard({ suspended: true, archived: true }))).toBe('retired');
    expect(deriveLifecycleStage(makeCard({ suspended: true }))).not.toBe('retired');
    expect(deriveLifecycleStage(makeCard({ archived: true }))).not.toBe('retired');
  });

  it('returns relearning when the fsrs state is relearning', () => {
    const card = makeCard();
    card.fsrs.state = 'relearning';
    expect(deriveLifecycleStage(card)).toBe('relearning');
  });

  it('returns maintaining for a consolidated card in review state', () => {
    const card = makeCard({ learnStatus: 'consolidated' });
    card.fsrs.state = 'review';
    expect(deriveLifecycleStage(card)).toBe('maintaining');
  });

  it('returns consolidating for a taught card', () => {
    expect(deriveLifecycleStage(makeCard({ learnStatus: 'taught' }))).toBe('consolidating');
  });

  it('returns encoding for an unlearned card', () => {
    expect(deriveLifecycleStage(makeCard({ learnStatus: 'unlearned' }))).toBe('encoding');
  });

  it('returns new for a fresh card with no learnStatus and no reviews', () => {
    expect(deriveLifecycleStage(makeCard())).toBe('new');
  });

  it('returns maintaining for a card with review history and no learnStatus', () => {
    const card = makeCard();
    card.fsrs.lastReview = '2026-01-01T00:00:00.000Z';
    expect(deriveLifecycleStage(card)).toBe('maintaining');
  });
});

describe('setLifecycleStage', () => {
  it('writes the stage field verbatim', () => {
    const card = makeCard();
    setLifecycleStage(card, 'encoding');
    expect(card.lifecycleStage).toBe('encoding');
  });
});

describe('applyLearnStatusMigration', () => {
  it('defaults missing learnStatus and consolidationRating to null and derives stages', () => {
    const fresh = makeCard();
    // Both fields are optional on StudyItem, so delete them directly. The
    // previous `as Record<string, unknown>` cast fails typecheck (TS2352:
    // insufficient overlap with an interface lacking an index signature).
    delete fresh.learnStatus;
    delete fresh.consolidationRating;
    const taught = makeCard({ learnStatus: 'taught' });

    const items: Record<string, StudyItem> = { a: fresh, b: taught };
    applyLearnStatusMigration(items);

    expect(fresh.learnStatus).toBeNull();
    expect(fresh.consolidationRating).toBeNull();
    expect(fresh.lifecycleStage).toBe('new');
    expect(taught.lifecycleStage).toBe('consolidating');
  });
});

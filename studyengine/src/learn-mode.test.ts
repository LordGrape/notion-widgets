import { describe, expect, it } from 'vitest';
import { applyLearnStatusMigration, classifyComplexCards, deriveLifecycleStage, pickProbeCard, substringVerified } from './learn-mode';

describe('substringVerified', () => {
  it('keeps segments with valid grounding snippets', () => {
    const items: any[] = [
      { id: 'a', prompt: 'Define opportunity cost', modelAnswer: 'Opportunity cost is the value of the next best alternative.' }
    ];
    const segments: any[] = [
      {
        id: 'seg-1',
        title: 'Opportunity cost',
        mechanism: 'worked_example',
        objective: 'Understand opportunity cost',
        tutorPrompt: 'Explain it',
        expectedAnswer: '...',
        linkedCardIds: ['a'],
        groundingSnippets: [{ cardId: 'a', quote: 'value of the next best alternative' }]
      }
    ];

    const verified = substringVerified(segments, items as any);
    expect(verified).toHaveLength(1);
  });

  it('rejects segments with non-substring grounding', () => {
    const items: any[] = [
      { id: 'a', prompt: 'Define opportunity cost', modelAnswer: 'Opportunity cost is the value of the next best alternative.' }
    ];
    const segments: any[] = [
      {
        id: 'seg-2',
        title: 'Bad grounding',
        mechanism: 'worked_example',
        objective: 'x',
        tutorPrompt: 'x',
        expectedAnswer: 'x',
        linkedCardIds: ['a'],
        groundingSnippets: [{ cardId: 'a', quote: 'completely unrelated quote text' }]
      }
    ];

    const verified = substringVerified(segments, items as any);
    expect(verified).toHaveLength(0);
  });
});

describe('run-1 helper selection', () => {
  it('pickProbeCard uses median model-answer length and null for <= 5 cards', () => {
    const tiny = Array.from({ length: 5 }).map((_, i) => ({ id: `t-${i}`, prompt: 'p', modelAnswer: 'one two' }));
    expect(pickProbeCard(tiny as any)).toBeNull();

    const cards = [
      { id: 'a', prompt: 'p', modelAnswer: '1 2 3 4 5 6 7 8 9 10' },
      { id: 'b', prompt: 'p', modelAnswer: '1 2 3' },
      { id: 'c', prompt: 'p', modelAnswer: '1 2 3 4 5 6' },
      { id: 'd', prompt: 'p', modelAnswer: '1 2 3 4' },
      { id: 'e', prompt: 'p', modelAnswer: '1 2 3 4 5' },
      { id: 'f', prompt: 'p', modelAnswer: '1 2' }
    ];
    expect(pickProbeCard(cards as any)?.id).toBe('e');
  });

  it('classifyComplexCards supports word-count and source metadata depth', () => {
    const fiftyWords = Array.from({ length: 50 }).map((_, i) => `w${i}`).join(' ');
    const fiftyOneWords = `${fiftyWords} extra`;
    const ids = classifyComplexCards([
      { id: 'a', prompt: 'p', modelAnswer: fiftyWords },
      { id: 'b', prompt: 'p', modelAnswer: fiftyOneWords },
      { id: 'c', prompt: 'p', modelAnswer: 'short', sourceMeta: { qec: { eDepth: 3 } } as any },
      { id: 'd', prompt: 'p', modelAnswer: 'short' }
    ] as any);
    expect(ids).toEqual(['b', 'c']);
  });
});

describe('deriveLifecycleStage', () => {
  const mkItem = (overrides: Record<string, unknown> = {}): any => ({
    id: 'card-1',
    prompt: 'p',
    modelAnswer: 'a',
    fsrs: {
      difficulty: 5,
      stability: 0,
      due: new Date().toISOString(),
      reps: 0,
      lapses: 0,
      lastReview: null,
      state: 'new'
    },
    created: new Date().toISOString(),
    ...overrides
  });

  it('derives all six lifecycle stages', () => {
    expect(deriveLifecycleStage(mkItem({ archived: true, suspended: true }))).toBe('retired');
    expect(deriveLifecycleStage(mkItem({ fsrs: { state: 'relearning' } }))).toBe('relearning');
    expect(deriveLifecycleStage(mkItem({ learnStatus: 'consolidated', fsrs: { state: 'review' } }))).toBe('maintaining');
    expect(deriveLifecycleStage(mkItem({ learnStatus: 'taught' }))).toBe('consolidating');
    expect(deriveLifecycleStage(mkItem({ learnStatus: 'unlearned' }))).toBe('encoding');
    expect(deriveLifecycleStage(mkItem({ learnStatus: null, fsrs: { lastReview: null } }))).toBe('new');
  });
});

describe('applyLearnStatusMigration', () => {
  it('writes lifecycle stage for each item and is idempotent', () => {
    const nowIso = new Date().toISOString();
    const items: Record<string, any> = {
      newCard: {
        id: 'newCard',
        prompt: 'p',
        modelAnswer: 'a',
        created: nowIso,
        fsrs: { difficulty: 0, stability: 0, due: nowIso, reps: 0, lapses: 0, lastReview: null, state: 'new' }
      },
      retired: {
        id: 'retired',
        prompt: 'p',
        modelAnswer: 'a',
        created: nowIso,
        archived: true,
        suspended: true,
        fsrs: { difficulty: 0, stability: 0, due: nowIso, reps: 0, lapses: 0, lastReview: null, state: 'new' }
      },
      maintaining: {
        id: 'maintaining',
        prompt: 'p',
        modelAnswer: 'a',
        created: nowIso,
        fsrs: { difficulty: 0, stability: 10, due: nowIso, reps: 5, lapses: 0, lastReview: nowIso, state: 'review' }
      }
    };

    applyLearnStatusMigration(items);
    expect(items.newCard.lifecycleStage).toBe('new');
    expect(items.retired.lifecycleStage).toBe('retired');
    expect(items.maintaining.lifecycleStage).toBe('maintaining');

    const firstHash = JSON.stringify(items);
    applyLearnStatusMigration(items);
    const secondHash = JSON.stringify(items);
    expect(secondHash).toBe(firstHash);
  });
});

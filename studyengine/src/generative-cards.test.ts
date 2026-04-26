import { describe, expect, it } from 'vitest';
import { createSiblingCard, detectGenerativeCandidates } from './generative-cards';

const DAY = 24 * 60 * 60 * 1000;

function mkCard(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    prompt: `Prompt ${id}`,
    modelAnswer: `Answer ${id}`,
    course: 'Bio',
    subDeck: 'sd-1',
    tags: ['t1'],
    created: new Date().toISOString(),
    fsrs: { difficulty: 0, stability: 0, due: new Date().toISOString(), reps: 0, lapses: 0, lastReview: null, state: 'new' },
    ...overrides
  } as any;
}

describe('detectGenerativeCandidates', () => {
  it('fires at exactly 2 Again ratings within 14 days', () => {
    const now = Date.UTC(2026, 0, 15);
    const items: any = { a: mkCard('a') };
    const cands = detectGenerativeCandidates([
      { cardId: 'a', rating: 1, ts: now - DAY },
      { cardId: 'a', rating: 1, ts: now - 2 * DAY }
    ], items, now);
    expect(cands.map((c) => c.id)).toEqual(['a']);
  });

  it('does not fire with one lapse or lapses outside the 14-day window', () => {
    const now = Date.UTC(2026, 0, 15);
    const items: any = { a: mkCard('a') };
    expect(detectGenerativeCandidates([{ cardId: 'a', rating: 1, ts: now - DAY }], items, now)).toHaveLength(0);
    expect(detectGenerativeCandidates([
      { cardId: 'a', rating: 1, ts: now - 20 * DAY },
      { cardId: 'a', rating: 1, ts: now - 19 * DAY }
    ], items, now)).toHaveLength(0);
  });
});

describe('createSiblingCard', () => {
  it('links to source root when source has no parent', () => {
    const now = Date.UTC(2026, 0, 1);
    const root = mkCard('root');
    const state: any = { items: { root } };
    const sibling = createSiblingCard({ sourceCardId: 'root', mode: 'rephrase', prompt: 'P2', modelAnswer: 'A2' }, state, now);
    expect(sibling.parentCardId).toBe('root');
    expect(root.siblingCardIds).toContain(sibling.id);
  });

  it('links to family root when source already has parent', () => {
    const now = Date.UTC(2026, 0, 1);
    const root = mkCard('root');
    const child = mkCard('child', { parentCardId: 'root' });
    const state: any = { items: { root, child } };
    const sibling = createSiblingCard({ sourceCardId: 'child', mode: 'mnemonic', prompt: 'P3', modelAnswer: 'A3' }, state, now);
    expect(sibling.parentCardId).toBe('root');
    expect(root.siblingCardIds).toContain(sibling.id);
  });

  it('seeds FSRS as rating-3 consolidation values', () => {
    const now = Date.UTC(2026, 0, 1);
    const root = mkCard('root');
    const state: any = { items: { root } };
    const sibling = createSiblingCard({ sourceCardId: 'root', mode: 'worked_example_link', prompt: 'P4', modelAnswer: 'A4', linkedWorkedExampleCardId: 'x' }, state, now);
    expect(sibling.learnStatus).toBe('consolidated');
    expect(sibling.lifecycleStage).toBe('consolidating');
    expect(sibling.fsrs.difficulty).toBe(4.5);
    expect(sibling.fsrs.stability).toBe(5);
    expect(new Date(sibling.fsrs.due).getTime()).toBe(now + 5 * DAY);
  });
});

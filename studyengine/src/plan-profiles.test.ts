import { describe, expect, it } from 'vitest';
import { resolveCardPlanProfile, resolveSessionPlanProfile } from './plan-profiles';

function mkCard(id: string, overrides: Record<string, unknown> = {}): any {
  return {
    id,
    prompt: `Prompt ${id}`,
    modelAnswer: `Answer ${id}`,
    created: new Date().toISOString(),
    course: 'Course A',
    subDeck: 'sd-1',
    fsrs: { difficulty: 0, stability: 0, due: new Date().toISOString(), reps: 0, lapses: 0, lastReview: null, state: 'new' },
    ...overrides
  };
}

describe('resolveCardPlanProfile', () => {
  it('prefers card override over sub-deck and course defaults', () => {
    const card = mkCard('c1', { planProfile: 'procedural' });
    const result = resolveCardPlanProfile(card, { planProfile: 'factual' } as any, { planProfile: 'theory' } as any);
    expect(result).toBe('procedural');
  });

  it('prefers sub-deck default over course default', () => {
    const card = mkCard('c2');
    const result = resolveCardPlanProfile(card, { planProfile: 'factual' } as any, { planProfile: 'procedural' } as any);
    expect(result).toBe('factual');
  });

  it('falls back to course default then global default', () => {
    const card = mkCard('c3');
    expect(resolveCardPlanProfile(card, null, { planProfile: 'procedural' } as any)).toBe('procedural');
    expect(resolveCardPlanProfile(card, null, null)).toBe('theory');
  });
});

describe('resolveSessionPlanProfile', () => {
  it('returns theory for empty scopes', () => {
    const result = resolveSessionPlanProfile([], () => null, () => null);
    expect(result).toBe('theory');
  });

  it('returns plurality winner for mixed scopes', () => {
    const cards = [
      ...Array.from({ length: 5 }).map((_, idx) => mkCard(`f-${idx}`, { planProfile: 'factual' })),
      ...Array.from({ length: 3 }).map((_, idx) => mkCard(`t-${idx}`, { planProfile: 'theory' })),
      ...Array.from({ length: 2 }).map((_, idx) => mkCard(`p-${idx}`, { planProfile: 'procedural' }))
    ];
    const result = resolveSessionPlanProfile(cards, () => null, () => null);
    expect(result).toBe('factual');
  });

  it('applies tie-break ordering theory > factual > procedural', () => {
    const theoryVsFactual = [
      mkCard('t1', { planProfile: 'theory' }),
      mkCard('t2', { planProfile: 'theory' }),
      mkCard('f1', { planProfile: 'factual' }),
      mkCard('f2', { planProfile: 'factual' })
    ];
    expect(resolveSessionPlanProfile(theoryVsFactual, () => null, () => null)).toBe('theory');

    const factualVsProcedural = [
      mkCard('f3', { planProfile: 'factual' }),
      mkCard('f4', { planProfile: 'factual' }),
      mkCard('p3', { planProfile: 'procedural' }),
      mkCard('p4', { planProfile: 'procedural' })
    ];
    expect(resolveSessionPlanProfile(factualVsProcedural, () => null, () => null)).toBe('factual');
  });
});

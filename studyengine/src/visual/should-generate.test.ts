import { describe, expect, it } from 'vitest';
import type { StudyItem } from '../types';
import { shouldAutoGenerateVisual } from './should-generate';

function mk(overrides: Partial<StudyItem>): StudyItem {
  return {
    id: 'card-1',
    course: 'French',
    topic: 'Pronouns',
    prompt: 'default prompt',
    modelAnswer: 'Default model answer',
    type: 'flashcard',
    tier: 'quickfire',
    fsrs: {
      due: new Date().toISOString(),
      stability: 1,
      difficulty: 5,
      reps: 0,
      lapses: 0,
      state: 'new',
      lastReview: null,
    },
    ...overrides,
  } as StudyItem;
}

describe('shouldAutoGenerateVisual', () => {
  it('returns false for single-token prompt', () => {
    expect(shouldAutoGenerateVisual(mk({ prompt: 'te', modelAnswer: '# Heading\nLong enough answer '.repeat(10) }))).toBe(false);
  });

  it('returns false for multi-token prompt with short answer', () => {
    expect(shouldAutoGenerateVisual(mk({ prompt: 'direct object pronouns', modelAnswer: 'Too short answer' }))).toBe(false);
  });

  it('returns true for multi-token prompt with structured heading answer', () => {
    expect(shouldAutoGenerateVisual(mk({
      prompt: 'direct object pronouns overview',
      modelAnswer: '# Rules\nThis is a long structured explanation '.repeat(8),
    }))).toBe(true);
  });

  it('returns true for multi-token prompt with arrows in answer', () => {
    expect(shouldAutoGenerateVisual(mk({
      prompt: 'direct and indirect object pronouns',
      modelAnswer: 'Pronouns map -> direct object pronouns -> te and me. '.repeat(8),
    }))).toBe(true);
  });

  it('returns true for worked tier', () => {
    expect(shouldAutoGenerateVisual(mk({ tier: 'worked', prompt: 'te', modelAnswer: 'short' }))).toBe(true);
  });

  it('returns true for mock tier', () => {
    expect(shouldAutoGenerateVisual(mk({ tier: 'mock', prompt: 'te', modelAnswer: 'short' }))).toBe(true);
  });

  it('returns true for explicit visualHint', () => {
    const withHint = mk({ prompt: 'te', modelAnswer: 'short' }) as StudyItem & { visualHint?: string };
    withHint.visualHint = 'show hierarchy';
    expect(shouldAutoGenerateVisual(withHint)).toBe(true);
  });

  it('returns false for empty prompt', () => {
    expect(shouldAutoGenerateVisual(mk({ prompt: '   ', modelAnswer: '# Heading\n'.repeat(20) }))).toBe(false);
  });
});

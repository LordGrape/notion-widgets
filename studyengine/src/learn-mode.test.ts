import { describe, expect, it } from 'vitest';
import { substringVerified } from './learn-mode';

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

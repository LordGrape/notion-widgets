import { describe, expect, it } from 'vitest';
import {
  buildDensityFallback,
  learnFallbackWarningForTest,
  minimumVerifiedSegmentCountForTest,
  verifySegmentGroundingForTest,
  verifySegmentTeach,
  verifySegmentTutorPrompt
} from '../src/routes/learn-plan';
import type { LearnPlanSegment } from '../src/types';

describe('learn-plan quality safeguards', () => {
  it('turns density fallback answers into learning micro-lessons', () => {
    const prompt = 'When was the regiment that became the Essex Scottish founded, and under what name?';
    const answer = "12 June 1885, as the 21st 'Essex' Battalion of Infantry, headquartered in Windsor, Ontario. The regiment celebrates continuous service to Canada from this date.";

    const plan = buildDensityFallback([
      { id: 'card-1', prompt, modelAnswer: answer }
    ]);

    const segment = plan.segments[0];
    expect(segment.title).toBe('Regiment that became the Essex Scottish');
    expect(segment.teach).not.toBe(answer);
    expect(segment.teach).toContain('This card establishes the relationship');
    expect(segment.teach).toContain('The source fact is');
    expect(segment.teach).not.toContain('The learning focus is this question');
    expect(segment.teach).not.toContain('The grounded answer is');
    expect(segment.teach.match(/\S+/g)?.length ?? 0).toBeGreaterThanOrEqual(60);
    expect(verifySegmentTeach(segment)).toBe(true);
    expect(segment.tutorPrompt).toContain('relationship');
    expect(verifySegmentTutorPrompt(segment.tutorPrompt).ok).toBe(true);
  });

  it('rejects answer-display teach blocks for factual cards', () => {
    const answer = "12 June 1885, as the 21st 'Essex' Battalion of Infantry, headquartered in Windsor, Ontario. The regiment celebrates continuous service to Canada from this date.";
    expect(verifySegmentTeach({
      id: 's1',
      title: 'Essex Scottish origin',
      mechanism: 'worked_example',
      objective: 'Teach the founding lineage.',
      teach: answer,
      tutorPrompt: 'How do the founding date, original name, and location fit together as a lineage fact?',
      checkType: 'elaborative',
      expectedAnswer: answer,
      linkedCardIds: ['card-1'],
      groundingSnippets: [{ cardId: 'card-1', quote: '12 June 1885' }]
    })).toBe(false);
  });

  it('accepts grounded micro-lessons that add explanatory language', () => {
    const answer = "12 June 1885, as the 21st 'Essex' Battalion of Infantry, headquartered in Windsor, Ontario. The regiment celebrates continuous service to Canada from this date.";
    const segment: LearnPlanSegment = {
      id: 's2',
      title: 'Essex Scottish origin',
      mechanism: 'worked_example',
      objective: 'Teach the founding lineage.',
      teach: "The Essex Scottish lineage begins with a founding militia identity in Windsor, Ontario. The key anchor is 12 June 1885, when the unit was created as the 21st 'Essex' Battalion of Infantry. That date matters because the regiment treats it as the start of continuous service to Canada, so the date, original battalion name, and Windsor headquarters belong together as one origin story rather than three separate facts.",
      tutorPrompt: 'How do the founding date, original battalion name, and Windsor location fit together as the regiment origin?',
      checkType: 'elaborative',
      expectedAnswer: answer,
      linkedCardIds: ['card-1'],
      groundingSnippets: [{ cardId: 'card-1', quote: 'the regiment began under an Essex battalion name in Windsor' }]
    };
    expect(verifySegmentGroundingForTest(segment, { 'card-1': `PROMPT: When was the regiment founded?\nANSWER: ${answer}` })).toBe(true);
  });

  it('requires only one verified segment for one-segment Learn sessions', () => {
    expect(minimumVerifiedSegmentCountForTest(1)).toBe(1);
    expect(minimumVerifiedSegmentCountForTest(2)).toBe(2);
    expect(minimumVerifiedSegmentCountForTest(5)).toBe(2);
  });

  it('keeps Learn fallback warnings tied to the actual failure class', () => {
    const baseStats = {
      budgetReason: undefined,
      parsedSegmentCount: 0,
      groundingRejectedCount: 0,
      qualityRejectedCount: 0,
      secondParsedSegmentCount: 0,
      secondGroundingRejectedCount: 0,
      secondQualityRejectedCount: 0
    };

    expect(learnFallbackWarningForTest(baseStats)).toContain('did not return parseable lesson segments');
    expect(learnFallbackWarningForTest({ ...baseStats, groundingRejectedCount: 1 })).toContain('could not be verified against the deck');
    expect(learnFallbackWarningForTest({ ...baseStats, groundingRejectedCount: 1, secondQualityRejectedCount: 1 })).toContain('teaching-quality checks');
    expect(learnFallbackWarningForTest({ ...baseStats, budgetReason: 'pro_exhausted' })).toContain('Pro retry budget was exhausted');
  });
});

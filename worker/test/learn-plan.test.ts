import { describe, expect, it } from 'vitest';
import { buildDensityFallback, verifySegmentTutorPrompt } from '../src/routes/learn-plan';

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
    expect(segment.teach).toContain('The learning focus is this question');
    expect(segment.teach).toContain('The grounded answer is');
    expect(segment.teach.match(/\S+/g)?.length ?? 0).toBeGreaterThanOrEqual(60);
    expect(segment.tutorPrompt).toContain('relationship');
    expect(verifySegmentTutorPrompt(segment.tutorPrompt).ok).toBe(true);
  });
});

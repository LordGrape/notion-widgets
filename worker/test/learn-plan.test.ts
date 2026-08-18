import { describe, expect, it } from 'vitest';
import {
  buildDensityFallback,
  learnCompletionWarningForTest,
  learnFallbackWarningForTest,
  learnChunkMetaForTest,
  minimumVerifiedSegmentCountForTest,
  verifySegmentGroundingForTest,
  verifySegmentTeach,
  verifySegmentTitle,
  verifySegmentTutorPrompt
} from '../src/routes/learn-plan';
import type { LearnPlanSegment } from '../src/types';

describe('learn-plan quality safeguards', () => {
  it('turns density fallback answers into learning micro-lessons', () => {
    const prompt = 'When was the organisation that became the United Nations founded, and under what name?';
    const answer = "24 October 1945, as the United Nations, established in San Francisco. The organisation traces continuous service to member states from this date.";

    const plan = buildDensityFallback([
      { id: 'card-1', prompt, modelAnswer: answer }
    ]);

    const segment = plan.segments[0];
    expect(segment.title).toBe('What makes this origin story more than a loose fact?');
    expect(verifySegmentTitle(segment).ok).toBe(true);
    expect(segment.teach).not.toBe(answer);
    expect(segment.teach).toContain('origin story');
    expect(segment.teach).toContain('The anchor is');
    expect(segment.teach).not.toContain('The learning focus is this question');
    expect(segment.teach).not.toContain('The grounded answer is');
    expect(segment.teach).not.toContain('This card establishes');
    expect(segment.teach).not.toContain('The source fact is');
    expect(segment.teach.match(/\S+/g)?.length ?? 0).toBeGreaterThanOrEqual(60);
    expect(verifySegmentTeach(segment)).toBe(true);
    expect(segment.tutorPrompt).toContain('origin story');
    expect(verifySegmentTutorPrompt(segment).ok).toBe(true);
  });

  it('allows exactly one cloze blank to reuse taught wording', () => {
    const teach = [
      "The United Nations lineage begins with a post-war identity in San Francisco.",
      "The key anchor is 24 October 1945, when the organisation was established as the United Nations.",
      "That date matters because the organisation treats it as the start of continuous service to member states, so the date, original name, and San Francisco venue belong together as one origin story rather than three separate facts."
    ].join(' ');

    const result = verifySegmentTutorPrompt({
      teach,
      checkType: 'cloze',
      tutorPrompt: "The key anchor is [___], when the organisation was established as the United Nations. What belongs in the blank?"
    });

    expect(result).toEqual({ ok: true });
  });

  it('rejects answer-display teach blocks for factual cards', () => {
    const answer = "24 October 1945, as the United Nations, established in San Francisco. The organisation traces continuous service to member states from this date.";
    expect(verifySegmentTeach({
      id: 's1',
      title: 'United Nations origin',
      mechanism: 'worked_example',
      objective: 'Teach the founding lineage.',
      teach: answer,
      tutorPrompt: 'How do the founding date, original name, and location fit together as a lineage fact?',
      checkType: 'elaborative',
      expectedAnswer: answer,
      linkedCardIds: ['card-1'],
      groundingSnippets: [{ cardId: 'card-1', quote: '24 October 1945' }]
    })).toBe(false);
  });

  it('accepts grounded micro-lessons that add explanatory language', () => {
    const answer = "24 October 1945, as the United Nations, established in San Francisco. The organisation traces continuous service to member states from this date.";
    const segment: LearnPlanSegment = {
      id: 's2',
      title: 'United Nations origin',
      mechanism: 'worked_example',
      objective: 'Teach the founding lineage.',
      teach: "The United Nations lineage begins with a post-war identity in San Francisco. The key anchor is 24 October 1945, when the organisation was established as the United Nations. That date matters because the organisation treats it as the start of continuous service to member states, so the date, original name, and San Francisco venue belong together as one origin story rather than three separate facts.",
      tutorPrompt: 'How do the founding date, original name, and San Francisco location fit together as the organisation origin?',
      checkType: 'elaborative',
      expectedAnswer: answer,
      linkedCardIds: ['card-1'],
      groundingSnippets: [{ cardId: 'card-1', quote: 'the organisation began under a new name in San Francisco' }]
    };
    expect(verifySegmentGroundingForTest(segment, { 'card-1': `PROMPT: When was the organisation founded?\nANSWER: ${answer}` })).toBe(true);
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

  it('does not warn when a one-card Learn session generates one verified segment', () => {
    expect(learnCompletionWarningForTest(1, 1, 1)).toBeUndefined();
    expect(learnCompletionWarningForTest(2, 1, 1)).toContain('Only one verified lesson segment');
    expect(learnCompletionWarningForTest(2, 2, 1)).toContain('Fewer than 2 consolidation questions');
  });

  it('rejects tutor prompts that ask for untaught location significance', () => {
    const prompt = 'The United Nations was founded in 1945. Why was the specific location of San Francisco significant for its establishment?';
    expect(verifySegmentTutorPrompt({ tutorPrompt: prompt }).ok).toBe(false);
  });

  it('rejects titles that lure the learner toward unsupported political causes', () => {
    const result = verifySegmentTitle({
      title: 'What political event in 1945 might have driven the founding of a new international organisation in San Francisco?',
      tutorPrompt: 'How do the founding date, original name, and host city fit together as one origin story?'
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('banned_ungrounded_title_phrase');
  });

  it('reports chunk cursors so the client can lazy-load the next section', () => {
    expect(learnChunkMetaForTest({
      course: 'HIST 101',
      subDeck: 'origin',
      cards: [
        { id: 'card-1', prompt: 'A?', modelAnswer: 'A.' },
        { id: 'card-2', prompt: 'B?', modelAnswer: 'B.' }
      ],
      chunked: true,
      chunkCursor: 2,
      chunkTotal: 5,
      segmentLimit: 2
    })).toEqual({ cursor: 2, nextCursor: 4, hasMore: true });
  });
});

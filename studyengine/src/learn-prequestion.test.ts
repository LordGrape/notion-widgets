import { describe, expect, it, vi } from 'vitest';
import { emptyPrequestionState, recordDecline, recordGuess, shouldShowPrequestion } from './learn-prequestion';

describe('learn prequestion state', () => {
  it('starts empty for public-domain Apollo 11 content', () => {
    expect(emptyPrequestionState()).toEqual({ guess: null, declined: false, submittedAt: null });
  });

  it('records a trimmed guess', () => {
    vi.spyOn(Date, 'now').mockReturnValue(12345);
    expect(recordGuess(emptyPrequestionState(), '  Apollo 11 landed on the Moon.  ')).toEqual({
      guess: 'Apollo 11 landed on the Moon.',
      declined: false,
      submittedAt: 12345
    });
    vi.restoreAllMocks();
  });

  it('treats empty guesses as an I do not know decline', () => {
    vi.spyOn(Date, 'now').mockReturnValue(23456);
    expect(recordGuess(emptyPrequestionState(), '   ')).toEqual({
      guess: null,
      declined: true,
      submittedAt: 23456
    });
    vi.restoreAllMocks();
  });

  it('records an explicit decline for Pythagorean theorem content', () => {
    vi.spyOn(Date, 'now').mockReturnValue(34567);
    expect(recordDecline(emptyPrequestionState())).toEqual({
      guess: null,
      declined: true,
      submittedAt: 34567
    });
    vi.restoreAllMocks();
  });
});

describe('shouldShowPrequestion', () => {
  it('does not show for prior knowledge probes', () => {
    expect(shouldShowPrequestion('prior_knowledge_probe', undefined, false)).toBe(false);
    expect(shouldShowPrequestion('self_explain', undefined, true)).toBe(false);
  });

  it('does not show for fully worked fade level 1 examples', () => {
    expect(shouldShowPrequestion('worked_example', 1, false)).toBe(false);
  });

  it('shows for worked fade levels 2 and 3 plus generative checks', () => {
    expect(shouldShowPrequestion('worked_example', 2, false)).toBe(true);
    expect(shouldShowPrequestion('worked_example', 3, false)).toBe(true);
    expect(shouldShowPrequestion('predictive', undefined, false)).toBe(true);
    expect(shouldShowPrequestion('cloze', undefined, false)).toBe(true);
    expect(shouldShowPrequestion('transfer_question', undefined, false)).toBe(true);
  });

  it('shows for unknown photosynthesis interaction types by default', () => {
    expect(shouldShowPrequestion('photosynthesis_connection', undefined, undefined)).toBe(true);
  });
});

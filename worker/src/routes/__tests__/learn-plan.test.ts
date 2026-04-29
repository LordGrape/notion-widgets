import { describe, expect, it } from 'vitest';
import { verifySegmentTutorPrompt } from '../learn-plan';

describe('learn-plan tutor prompt restatement safeguards', () => {
  it('rejects tutor prompts whose premise restates the teach block', () => {
    const result = verifySegmentTutorPrompt({
      teach: "The Essex Scottish lineage begins on 12 June 1885, when the Canadian unit was established as the 21st Essex Battalion of Infantry at Windsor, Ontario.",
      tutorPrompt: "The Essex Scottish lineage begins on 12 June 1885, when the unit was established as the 21st Essex Battalion of Infantry at Windsor, Ontario. Why does this matter for the origin story?"
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/^restates_teach:0\.\d{2}$/);
  });

  it('rejects tautological establish closers after a restated premise', () => {
    const result = verifySegmentTutorPrompt({
      teach: "The Essex Scottish was founded as a local militia unit, with its early identity tied to Essex County and Windsor.",
      tutorPrompt: "The regiment was founded on 12 June 1885 as the 21st Essex Battalion in Windsor. How do these details establish the regiment's identity and location?"
    });

    expect(result).toEqual({
      ok: false,
      reason: 'banned_recall_pattern:\\bhow do these (details|facts|points|elements|pieces) (establish|show|demonstrate|illustrate|reveal)\\b'
    });
  });

  it('accepts the canonical origin-story fit-together phrasing', () => {
    const result = verifySegmentTutorPrompt({
      teach: "The Essex Scottish origin story links a founding date, a local battalion name, and a Windsor base into one lineage. Those details help the learner connect time, identity, and place without treating them as separate trivia.",
      tutorPrompt: "How do A, B, and C fit together as one origin story?"
    });

    expect(result).toEqual({ ok: true });
  });

  it('keeps the UN positive example phrasing valid', () => {
    const result = verifySegmentTutorPrompt({
      teach: "The United Nations was founded on 24 October 1945 when fifty signatory states ratified its Charter in San Francisco. The organisation emerged from the wartime alliance against the Axis powers and replaced the League of Nations, which had collapsed in the 1930s. Its founding structure, the Security Council with five permanent veto-holding members, reflected the strategic balance of power at the end of the Second World War and was intended to prevent the paralysis that had disabled the League.",
      tutorPrompt: "The UN was founded in 1945 in San Francisco. Why might a post-war American city have been chosen as the ratification venue, and what would change if the ratification had happened in Geneva instead?"
    });

    expect(result).toEqual({ ok: true });
  });
});

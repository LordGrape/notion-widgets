import { describe, expect, it } from 'vitest';
import { verifySegmentTitle, verifySegmentTutorPrompt } from '../learn-plan';

const ORIGIN_INTEGRATION_TEACH = [
  "The United Nations origin story sits inside the post-war reconstruction of the 1940s.",
  "The Second World War had sharpened demand for collective security, so a San Francisco conference gave the Allied powers a permanent diplomatic identity.",
  "Its formal creation on 24 October 1945, its original designation as the United Nations, and its San Francisco venue are best understood as evidence of that political response.",
  "Those details are not separate trivia; they show how a new organisation connected global pressure, shared identity, and organised diplomatic structure."
].join(' ');

const ORIGIN_INTEGRATION_TUTOR_PROMPT =
  "How do the founding date, the original designation, and the San Francisco venue fit together as evidence of that political response?";

const ORIGIN_PREDICTIVE_TITLE =
  "Why is this easier to remember as an origin story than as a loose fact?";

describe('learn-plan tutor prompt restatement safeguards', () => {
  it('rejects tutor prompts whose premise restates the teach block', () => {
    const result = verifySegmentTutorPrompt({
      teach: "The United Nations lineage begins on 24 October 1945, when the international organisation was established as the United Nations at San Francisco, California.",
      tutorPrompt: "The United Nations lineage begins on 24 October 1945, when the organisation was established as the United Nations at San Francisco, California. Why does this matter for the origin story?"
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/^restates_teach:[01]\.\d{2}$/);
  });

  it('rejects tautological establish closers after a restated premise', () => {
    const result = verifySegmentTutorPrompt({
      teach: "The United Nations was founded as a post-war collective security body, with its early identity tied to the Allied powers and San Francisco.",
      tutorPrompt: "The organisation was founded on 24 October 1945 as the United Nations in San Francisco. How do these details establish the organisation's identity and location?"
    });

    expect(result).toEqual({
      ok: false,
      reason: 'banned_recall_pattern:\\bhow do these (details|facts|points|elements|pieces) (establish|show|demonstrate|illustrate|reveal)\\b'
    });
  });

  it('accepts the canonical origin-story fit-together phrasing', () => {
    const result = verifySegmentTutorPrompt({
      teach: "The United Nations origin story links a founding date, a charter name, and a San Francisco venue into one lineage. Those details help the learner connect time, identity, and place without treating them as separate trivia.",
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

  it('keeps origin-story integration prompts valid against a full teach block', () => {
    expect(verifySegmentTutorPrompt({
      teach: ORIGIN_INTEGRATION_TEACH,
      tutorPrompt: ORIGIN_INTEGRATION_TUTOR_PROMPT
    })).toEqual({ ok: true });
  });

  it('rejects fit-together tutor prompts that ask for any untaught detail slot', () => {
    const result = verifySegmentTutorPrompt({
      teach: [
        "The United Nations origin story sits inside the post-war reconstruction of the 1940s.",
        "The Second World War had sharpened demand for collective security, so a San Francisco conference gave the Allied powers a permanent diplomatic identity.",
        "Its formal creation on 24 October 1945, original designation as the United Nations, and San Francisco venue are the taught anchors."
      ].join(' '),
      tutorPrompt: "How do the founding date, the original designation, and the founding commander fit together as evidence of that political response?"
    });

    expect(result).toEqual({ ok: false, reason: "untaught_tutor_detail:founding_commander" });
  });

  it('rejects fit-together tutor prompts with unsupported named details on other cards', () => {
    const result = verifySegmentTutorPrompt({
      teach: [
        "The United Nations was founded on 24 October 1945 when fifty signatory states ratified its Charter in San Francisco.",
        "The organisation emerged from the wartime alliance against the Axis powers and replaced the League of Nations.",
        "Its founding structure reflected the strategic balance of power at the end of the Second World War."
      ].join(' '),
      tutorPrompt: "How do the founding date, the Charter ratification, and the Paris headquarters fit together as one origin story?"
    });

    expect(result).toEqual({ ok: false, reason: "untaught_tutor_detail:paris_headquarters" });
  });
});

describe('learn-plan title safeguards (first-exposure)', () => {
  it('rejects bare conjunctive recall titles', () => {
    const result = verifySegmentTitle({
      title: "When was the organisation that became the United Nations founded, and under what name?"
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/^banned_title_recall_pattern:/);
  });

  it('rejects who-founded title stems', () => {
    const result = verifySegmentTitle({
      title: "Who founded the United Nations?"
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/^banned_title_recall_pattern:/);
  });

  it('rejects title and tutorPrompt entity overlap above the ceiling', () => {
    const result = verifySegmentTitle({
      title: "Why might United Nations Charter founding show global diplomatic identity?",
      tutorPrompt: "How do United Nations Charter founding details fit together as global diplomatic identity?"
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/^title_tutor_overlap:[01]\.\d{2}$/);
  });

  it('does not reject title and tutorPrompt for shared generic learning vocabulary', () => {
    const result = verifySegmentTitle({
      title: "What makes this founding story easier to understand as one origin?",
      tutorPrompt: "How do the founding date, original name, and host city fit together as one origin story?"
    });

    expect(result).toEqual({ ok: true });
  });

  it('accepts predictive origin-story titles without a tutorPrompt', () => {
    expect(verifySegmentTitle({
      title: ORIGIN_PREDICTIVE_TITLE
    })).toEqual({ ok: true });
  });

  it('accepts predictive titles paired with disjoint integration tutorPrompts', () => {
    expect(verifySegmentTitle({
      title: ORIGIN_PREDICTIVE_TITLE,
      tutorPrompt: ORIGIN_INTEGRATION_TUTOR_PROMPT
    })).toEqual({ ok: true });
    expect(verifySegmentTutorPrompt({
      teach: ORIGIN_INTEGRATION_TEACH,
      tutorPrompt: ORIGIN_INTEGRATION_TUTOR_PROMPT
    })).toEqual({ ok: true });
  });

  it('rejects unsupported political-cause title lures', () => {
    const result = verifySegmentTitle({
      title: "What political event in 1940s America might have driven the founding of a new international organisation in San Francisco?"
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/^banned_ungrounded_title_phrase:/);
  });
});

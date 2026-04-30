import { describe, expect, it } from 'vitest';
import { verifySegmentTitle, verifySegmentTutorPrompt } from '../learn-plan';

const ESSEX_INTEGRATION_TEACH = [
  "The Essex Scottish origin story sits inside the Canadian militia expansion of the 1880s.",
  "The North-West Rebellion had sharpened concern about local defence capacity, so a Windsor-based unit gave Essex County a permanent militia identity.",
  "Its formal creation on 12 June 1885, its original designation as the 21st Essex Battalion of Infantry, and its Windsor headquarters are best understood as evidence of that political response.",
  "Those details are not separate trivia; they show how a local regiment connected national pressure, regional identity, and organised military structure."
].join(' ');

const ESSEX_INTEGRATION_TUTOR_PROMPT =
  "How do the founding date, the original battalion name, and the Windsor headquarters fit together as evidence of that political response?";

const ESSEX_PREDICTIVE_TITLE =
  "What political event in 1880s Canada might have driven the founding of a new local militia regiment in Windsor?";

describe('learn-plan tutor prompt restatement safeguards', () => {
  it('rejects tutor prompts whose premise restates the teach block', () => {
    const result = verifySegmentTutorPrompt({
      teach: "The Essex Scottish lineage begins on 12 June 1885, when the Canadian unit was established as the 21st Essex Battalion of Infantry at Windsor, Ontario.",
      tutorPrompt: "The Essex Scottish lineage begins on 12 June 1885, when the unit was established as the 21st Essex Battalion of Infantry at Windsor, Ontario. Why does this matter for the origin story?"
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/^restates_teach:[01]\.\d{2}$/);
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

  it('keeps Essex Scottish integration prompts valid against a full teach block', () => {
    expect(verifySegmentTutorPrompt({
      teach: ESSEX_INTEGRATION_TEACH,
      tutorPrompt: ESSEX_INTEGRATION_TUTOR_PROMPT
    })).toEqual({ ok: true });
  });

  it('rejects fit-together tutor prompts that ask for any untaught detail slot', () => {
    const result = verifySegmentTutorPrompt({
      teach: [
        "The Essex Scottish origin story sits inside the Canadian militia expansion of the 1880s.",
        "The North-West Rebellion had sharpened concern about local defence capacity, so a Windsor-based unit gave Essex County a permanent militia identity.",
        "Its formal creation on 12 June 1885, original designation as the 21st Essex Battalion of Infantry, and Windsor headquarters are the taught anchors."
      ].join(' '),
      tutorPrompt: "How do the founding date, the original battalion name, and the founding commander fit together as evidence of that political response?"
    });

    expect(result).toEqual({ ok: false, reason: "untaught_tutor_detail:founding_commander" });
  });

  it('rejects fit-together tutor prompts with unsupported named details on non-Essex cards', () => {
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
  it('rejects bare Essex Scottish conjunctive recall titles', () => {
    const result = verifySegmentTitle({
      title: "When was the regiment that became the Essex Scottish founded, and under what name?"
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/^banned_title_recall_pattern:/);
  });

  it('rejects who-founded title stems', () => {
    const result = verifySegmentTitle({
      title: "Who founded the Essex Scottish?"
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/^banned_title_recall_pattern:/);
  });

  it('rejects title and tutorPrompt entity overlap above the ceiling', () => {
    const result = verifySegmentTitle({
      title: "Why might Windsor Essex Battalion founding show local militia identity?",
      tutorPrompt: "How do Windsor Essex Battalion founding details fit together as local militia identity?"
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/^title_tutor_overlap:[01]\.\d{2}$/);
  });

  it('does not reject title and tutorPrompt for shared generic learning vocabulary', () => {
    const result = verifySegmentTitle({
      title: "What makes this founding story easier to understand as one origin?",
      tutorPrompt: "How do the founding date, original name, and Windsor base fit together as one origin story?"
    });

    expect(result).toEqual({ ok: true });
  });

  it('accepts predictive Essex Scottish titles without a tutorPrompt', () => {
    expect(verifySegmentTitle({
      title: ESSEX_PREDICTIVE_TITLE
    })).toEqual({ ok: true });
  });

  it('accepts predictive titles paired with disjoint integration tutorPrompts', () => {
    expect(verifySegmentTitle({
      title: ESSEX_PREDICTIVE_TITLE,
      tutorPrompt: ESSEX_INTEGRATION_TUTOR_PROMPT
    })).toEqual({ ok: true });
    expect(verifySegmentTutorPrompt({
      teach: ESSEX_INTEGRATION_TEACH,
      tutorPrompt: ESSEX_INTEGRATION_TUTOR_PROMPT
    })).toEqual({ ok: true });
  });
});

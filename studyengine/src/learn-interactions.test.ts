import { describe, expect, it } from 'vitest';
import { deriveLearnInteractionCopy, getInteractionShape, nextFadeIndex, shouldShowLearnPlanStaleNote } from './learn-interactions';

describe('deriveLearnInteractionCopy', () => {
  it('maps self explanation to teach-back copy', () => {
    const copy = deriveLearnInteractionCopy({ checkType: 'self_explain' });
    expect(copy.interactionLabel).toBe('Teach it back');
    expect(copy.submitButtonLabel).toBe('Submit Explanation');
    expect(copy.placeholder).toContain('Teach this back');
  });

  it('maps predictive prompts to prediction copy', () => {
    const copy = deriveLearnInteractionCopy({ checkType: 'predictive' });
    expect(copy.interactionLabel).toBe('Predict');
    expect(copy.submitButtonLabel).toBe('Submit Prediction');
  });

  it('maps worked-example fading levels', () => {
    expect(deriveLearnInteractionCopy({ checkType: 'worked_example', fadeLevel: 1 })).toMatchObject({
      interactionLabel: 'Worked example',
      readButtonLabel: 'I see how that works',
      emphasizeWorkedExample: true
    });
    expect(deriveLearnInteractionCopy({ checkType: 'worked_example', fadeLevel: 2 })).toMatchObject({
      interactionLabel: 'Faded example',
      readButtonLabel: 'Check my fills',
      submitButtonLabel: 'Submit Fills',
      emphasizeWorkedExample: true
    });
    expect(deriveLearnInteractionCopy({ checkType: 'worked_example', fadeLevel: 3 })).toMatchObject({
      interactionLabel: 'Try it',
      submitButtonLabel: 'Submit Attempt',
      emphasizeWorkedExample: true
    });
  });

  it('maps transfer and cloze interactions', () => {
    expect(deriveLearnInteractionCopy({ checkType: 'transfer_question' })).toMatchObject({
      interactionLabel: 'Transfer',
      submitButtonLabel: 'Submit Transfer'
    });
    expect(deriveLearnInteractionCopy({ checkType: 'cloze' })).toMatchObject({
      interactionLabel: 'Fill the blank',
      readButtonLabel: 'Try the Blank',
      emphasizeCloze: true
    });
  });

  it('uses probe copy when isProbe is true or checkType is prior_knowledge_probe', () => {
    expect(deriveLearnInteractionCopy({ isProbe: true }).interactionLabel).toBe('Quick check');
    expect(deriveLearnInteractionCopy({ checkType: 'prior_knowledge_probe' }).interactionLabel).toBe('Quick check');
  });

  it('uses profile-specific fallback placeholders', () => {
    expect(deriveLearnInteractionCopy({ planProfile: 'factual' }).placeholder).toContain('Connect the facts');
    expect(deriveLearnInteractionCopy({ planProfile: 'procedural' }).placeholder).toContain('step order');
    expect(deriveLearnInteractionCopy({ planProfile: 'language' }).placeholder).toContain('target form');
  });
});

describe('shouldShowLearnPlanStaleNote', () => {
  it('shows only for an undismissed stale cached read-phase plan', () => {
    expect(shouldShowLearnPlanStaleNote({
      fromCache: true,
      planOutOfDate: true,
      savedSubDeckFingerprint: 'old',
      currentSubDeckFingerprint: 'new',
      currentSubPhase: 'read',
      dismissedPlanStaleNote: false
    })).toBe(true);
  });

  it('does not show for exact cache hits, subset hits, additive reuse, or fresh streams', () => {
    expect(shouldShowLearnPlanStaleNote({
      fromCache: true,
      planOutOfDate: false,
      savedSubDeckFingerprint: 'same',
      currentSubDeckFingerprint: 'same',
      currentSubPhase: 'read'
    })).toBe(false);
    expect(shouldShowLearnPlanStaleNote({
      fromCache: true,
      planOutOfDate: true,
      savedSubDeckFingerprint: 'same',
      currentSubDeckFingerprint: 'same',
      currentSubPhase: 'read'
    })).toBe(false);
    expect(shouldShowLearnPlanStaleNote({
      fromCache: false,
      planOutOfDate: false,
      savedSubDeckFingerprint: 'old',
      currentSubDeckFingerprint: 'new',
      currentSubPhase: 'read'
    })).toBe(false);
  });

  it('does not show outside read phase, after dismissal, or without both fingerprints', () => {
    expect(shouldShowLearnPlanStaleNote({
      fromCache: true,
      planOutOfDate: true,
      savedSubDeckFingerprint: 'old',
      currentSubDeckFingerprint: 'new',
      currentSubPhase: 'answer'
    })).toBe(false);
    expect(shouldShowLearnPlanStaleNote({
      fromCache: true,
      planOutOfDate: true,
      savedSubDeckFingerprint: 'old',
      currentSubDeckFingerprint: 'new',
      currentSubPhase: 'read',
      dismissedPlanStaleNote: true
    })).toBe(false);
    expect(shouldShowLearnPlanStaleNote({
      fromCache: true,
      planOutOfDate: true,
      savedSubDeckFingerprint: '',
      currentSubDeckFingerprint: 'new',
      currentSubPhase: 'read'
    })).toBe(false);
  });
});

describe('getInteractionShape', () => {
  it('maps predictive to predict reveal', () => {
    expect(getInteractionShape('predictive', undefined, false)).toEqual({
      kind: 'predict_reveal',
      placeholderHint: 'Predict before reading further. Then commit to see the actual outcome.',
      primaryButtonCopy: 'Commit prediction',
      secondaryAction: { label: 'Reveal expected outcome', intent: 'reveal' }
    });
  });

  it('maps self explanation and cloze', () => {
    expect(getInteractionShape('self_explain', undefined, false).kind).toBe('structural_self_explain');
    expect(getInteractionShape('cloze', undefined, false).kind).toBe('inline_cloze');
  });

  it('maps worked example fade levels', () => {
    expect(getInteractionShape('worked_example', 1, false).kind).toBe('worked_reveal_justify');
    expect(getInteractionShape('worked_example', 2, false)).toMatchObject({ kind: 'freeform', placeholderHint: 'Fill the missing steps.' });
    expect(getInteractionShape('worked_example', 3, false)).toMatchObject({ kind: 'freeform' });
  });

  it('maps transfer, elaborative, probes, and fallback to freeform', () => {
    expect(getInteractionShape('transfer_question', undefined, false).kind).toBe('freeform');
    expect(getInteractionShape('elaborative', undefined, false).kind).toBe('freeform');
    expect(getInteractionShape('prior_knowledge_probe', undefined, false).kind).toBe('freeform');
    expect(getInteractionShape('custom', undefined, true).kind).toBe('freeform');
    expect(getInteractionShape('custom', undefined, false).kind).toBe('freeform');
  });
});

describe('nextFadeIndex', () => {
  const sequence = [
    { workedExampleId: 'apollo', fadeLevel: 1 },
    { workedExampleId: 'apollo', fadeLevel: 2 },
    { workedExampleId: 'apollo', fadeLevel: 3 },
    { workedExampleId: 'pythagorean', fadeLevel: 1 }
  ];

  it('skips the immediate next fade level after a deep verdict', () => {
    expect(nextFadeIndex(sequence, 0, 'deep')).toBe(2);
  });

  it('repeats fade level 1 after a surface verdict on fade level 2 or higher', () => {
    expect(nextFadeIndex(sequence, 1, 'surface')).toBe(0);
    expect(nextFadeIndex(sequence, 2, 'surface')).toBe(0);
  });

  it('does not change non-worked or missing-verdict advancement', () => {
    expect(nextFadeIndex([{ }, { }], 0, 'deep')).toBe(1);
    expect(nextFadeIndex(sequence, 0, null)).toBe(1);
    expect(nextFadeIndex(sequence, 0, 'partial')).toBe(1);
  });

  it('falls back when requested fade level is absent', () => {
    expect(nextFadeIndex([{ workedExampleId: 'photosynthesis', fadeLevel: 1 }, { workedExampleId: 'photosynthesis', fadeLevel: 2 }], 0, 'deep')).toBe(1);
  });
});

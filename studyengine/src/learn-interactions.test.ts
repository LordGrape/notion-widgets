import { describe, expect, it } from 'vitest';
import { deriveLearnInteractionCopy, shouldShowLearnPlanStaleNote } from './learn-interactions';

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

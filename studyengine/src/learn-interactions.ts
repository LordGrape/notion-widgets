import type { LearnPlanSegment, PlanProfile } from './types';

export type LearnInteractionCheckType = NonNullable<LearnPlanSegment['checkType']>;

export interface LearnInteractionInput {
  checkType?: LearnPlanSegment['checkType'];
  fadeLevel?: LearnPlanSegment['fadeLevel'];
  planProfile?: PlanProfile;
  isProbe?: boolean;
}

export interface LearnInteractionCopy {
  interactionLabel: string;
  readButtonLabel: string;
  submitButtonLabel: string;
  answerAgainLabel: string;
  placeholder: string;
  feedbackLandedLabel: string;
  feedbackRepairLabel: string;
  feedbackNextLabel: string;
  emphasizeCloze: boolean;
  emphasizeWorkedExample: boolean;
}

const DEFAULT_COPY: LearnInteractionCopy = {
  interactionLabel: 'Explain',
  readButtonLabel: 'Continue to Your Turn',
  submitButtonLabel: 'Submit Response',
  answerAgainLabel: 'Answer Again',
  placeholder: 'Explain the idea in your own words...',
  feedbackLandedLabel: 'What landed',
  feedbackRepairLabel: 'What to repair',
  feedbackNextLabel: 'Next prompt',
  emphasizeCloze: false,
  emphasizeWorkedExample: false
};

function normalizeCheckType(value: LearnPlanSegment['checkType'] | undefined): LearnInteractionCheckType {
  if (
    value === 'elaborative'
    || value === 'predictive'
    || value === 'self_explain'
    || value === 'prior_knowledge_probe'
    || value === 'worked_example'
    || value === 'transfer_question'
    || value === 'cloze'
  ) {
    return value;
  }
  return 'self_explain';
}

function profileFallbackPlaceholder(planProfile: PlanProfile | undefined): string {
  if (planProfile === 'factual') return 'Connect the facts into one meaningful explanation...';
  if (planProfile === 'procedural') return 'Explain the next step or why the step order works...';
  if (planProfile === 'language') return 'Produce the target form from memory...';
  return DEFAULT_COPY.placeholder;
}

export function deriveLearnInteractionCopy(input: LearnInteractionInput): LearnInteractionCopy {
  const checkType = normalizeCheckType(input.checkType);
  const isProbe = input.isProbe === true || checkType === 'prior_knowledge_probe';
  const base: LearnInteractionCopy = {
    ...DEFAULT_COPY,
    placeholder: profileFallbackPlaceholder(input.planProfile)
  };

  if (isProbe) {
    return {
      ...base,
      interactionLabel: 'Quick check',
      readButtonLabel: 'Start Quick Check',
      submitButtonLabel: 'Submit Check',
      placeholder: 'Try what you already know. A partial answer is useful here...',
      feedbackRepairLabel: 'Learning gap',
      feedbackNextLabel: 'Tutor follow-up'
    };
  }

  if (!input.checkType) {
    return base;
  }

  if (checkType === 'predictive') {
    return {
      ...base,
      interactionLabel: 'Predict',
      submitButtonLabel: 'Submit Prediction',
      placeholder: 'Predict what should happen and give the reason...'
    };
  }

  if (checkType === 'elaborative') {
    return {
      ...base,
      interactionLabel: 'Why it works',
      submitButtonLabel: 'Submit Explanation',
      placeholder: 'Explain why the relationship matters...'
    };
  }

  if (checkType === 'worked_example') {
    const fadeLevel = input.fadeLevel;
    if (fadeLevel === 1) {
      return {
        ...base,
        interactionLabel: 'Worked example',
        readButtonLabel: 'I see how that works',
        submitButtonLabel: 'Explain the Example',
        placeholder: 'Name the step or clue that makes the example work...',
        emphasizeWorkedExample: true
      };
    }
    if (fadeLevel === 2) {
      return {
        ...base,
        interactionLabel: 'Faded example',
        readButtonLabel: 'Check my fills',
        submitButtonLabel: 'Submit Fills',
        placeholder: 'Fill the missing step, then explain your choice...',
        emphasizeWorkedExample: true
      };
    }
    return {
      ...base,
      interactionLabel: 'Try it',
      submitButtonLabel: 'Submit Attempt',
      placeholder: 'Solve it without the worked steps, then explain your reasoning...',
      emphasizeWorkedExample: true
    };
  }

  if (checkType === 'transfer_question') {
    return {
      ...base,
      interactionLabel: 'Transfer',
      readButtonLabel: 'Start Transfer',
      submitButtonLabel: 'Submit Transfer',
      placeholder: 'Apply the idea to the new case...'
    };
  }

  if (checkType === 'cloze') {
    return {
      ...base,
      interactionLabel: 'Fill the blank',
      readButtonLabel: 'Try the Blank',
      submitButtonLabel: 'Submit Blank',
      placeholder: 'Fill the blank from memory...',
      emphasizeCloze: true
    };
  }

  return {
    ...base,
    interactionLabel: 'Teach it back',
    submitButtonLabel: 'Submit Explanation',
    placeholder: 'Teach this back as if explaining it to someone new...'
  };
}

export interface LearnStaleNoteInput {
  fromCache?: boolean;
  planOutOfDate?: boolean;
  savedSubDeckFingerprint?: string | null;
  currentSubDeckFingerprint?: string | null;
  currentSubPhase?: string;
  dismissedPlanStaleNote?: boolean;
}

export function shouldShowLearnPlanStaleNote(input: LearnStaleNoteInput): boolean {
  if (!input.fromCache || !input.planOutOfDate) return false;
  if (input.dismissedPlanStaleNote) return false;
  if (input.currentSubPhase !== 'read') return false;
  const saved = String(input.savedSubDeckFingerprint || '').trim();
  const current = String(input.currentSubDeckFingerprint || '').trim();
  if (!saved || !current) return false;
  return saved !== current;
}

export interface InteractionShape {
  kind: 'freeform' | 'predict_reveal' | 'structural_self_explain' | 'inline_cloze' | 'worked_reveal_justify';
  placeholderHint: string;
  primaryButtonCopy: string;
  secondaryAction?: { label: string; intent: 'reveal' | 'skip_to_teach' };
}

export function getInteractionShape(
  checkType: string,
  fadeLevel: number | undefined,
  isProbe: boolean | undefined
): InteractionShape {
  if (checkType === 'predictive') {
    return {
      kind: 'predict_reveal',
      placeholderHint: 'Predict before reading further. Then commit to see the actual outcome.',
      primaryButtonCopy: 'Commit prediction',
      secondaryAction: { label: 'Reveal expected outcome', intent: 'reveal' }
    };
  }
  if (checkType === 'self_explain') {
    return {
      kind: 'structural_self_explain',
      placeholderHint: "Explain in the form: 'Because... therefore...'",
      primaryButtonCopy: 'Submit explanation'
    };
  }
  if (checkType === 'cloze') {
    return {
      kind: 'inline_cloze',
      placeholderHint: 'Fill the blank.',
      primaryButtonCopy: 'Submit'
    };
  }
  if (checkType === 'worked_example' && fadeLevel === 1) {
    return {
      kind: 'worked_reveal_justify',
      placeholderHint: 'Read the worked example, then justify why each step follows.',
      primaryButtonCopy: 'Submit justification',
      secondaryAction: { label: 'Show worked steps', intent: 'reveal' }
    };
  }
  if (checkType === 'worked_example' && fadeLevel === 2) {
    return {
      kind: 'freeform',
      placeholderHint: 'Fill the missing steps.',
      primaryButtonCopy: 'Submit fills'
    };
  }
  if (checkType === 'worked_example' && fadeLevel === 3) {
    return {
      kind: 'freeform',
      placeholderHint: 'Try the full problem, then explain your reasoning.',
      primaryButtonCopy: 'Submit attempt'
    };
  }
  if (checkType === 'transfer_question') {
    return {
      kind: 'freeform',
      placeholderHint: 'Apply the idea to the new case.',
      primaryButtonCopy: 'Submit transfer'
    };
  }
  if (checkType === 'elaborative') {
    return {
      kind: 'freeform',
      placeholderHint: 'Explain why this matters or how the pieces connect.',
      primaryButtonCopy: 'Submit explanation'
    };
  }
  if (checkType === 'prior_knowledge_probe' || isProbe === true) {
    return {
      kind: 'freeform',
      placeholderHint: 'Try what you already know. A partial answer is useful.',
      primaryButtonCopy: 'Submit check'
    };
  }
  return {
    kind: 'freeform',
    placeholderHint: 'Type your response in your own words.',
    primaryButtonCopy: 'Submit response'
  };
}

export function nextFadeIndex(
  plannerSegments: Array<{ workedExampleId?: string; fadeLevel?: number }>,
  currentIndex: number,
  lastVerdict: 'surface' | 'partial' | 'deep' | null
): number {
  const current = plannerSegments[currentIndex];
  const next = plannerSegments[currentIndex + 1];
  if (!current || !current.workedExampleId) {
    return currentIndex + 1;
  }
  const currentFade = Number(current.fadeLevel || 0);
  if (lastVerdict === 'surface' && currentFade >= 2) {
    for (let i = currentIndex - 1; i >= 0; i -= 1) {
      const candidate = plannerSegments[i];
      if (candidate?.workedExampleId !== current.workedExampleId) break;
      if (candidate.fadeLevel === 1) return i;
    }
    return currentIndex + 1;
  }
  if (!next || next.workedExampleId !== current.workedExampleId) {
    return currentIndex + 1;
  }
  if (lastVerdict === 'deep') {
    const target = currentFade + 2;
    for (let i = currentIndex + 1; i < plannerSegments.length; i += 1) {
      const candidate = plannerSegments[i];
      if (candidate?.workedExampleId !== current.workedExampleId) break;
      if (Number(candidate.fadeLevel || 0) >= target) return i;
    }
    return currentIndex + 1;
  }
  return currentIndex + 1;
}

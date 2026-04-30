export interface PrequestionState {
  guess: string | null;
  declined: boolean;
  submittedAt: number | null;
}

export function emptyPrequestionState(): PrequestionState {
  return { guess: null, declined: false, submittedAt: null };
}

export function recordGuess(_state: PrequestionState, raw: string): PrequestionState {
  const trimmed = String(raw || '').trim();
  const submittedAt = Date.now();
  if (!trimmed) return { guess: null, declined: true, submittedAt };
  return { guess: trimmed, declined: false, submittedAt };
}

export function recordDecline(_state: PrequestionState): PrequestionState {
  return { guess: null, declined: true, submittedAt: Date.now() };
}

export function shouldShowPrequestion(
  checkType: string,
  fadeLevel: number | undefined,
  isProbe: boolean | undefined
): boolean {
  if (isProbe === true) return false;
  if (checkType === 'prior_knowledge_probe') return false;
  if (checkType === 'worked_example' && fadeLevel === 1) return false;
  return true;
}

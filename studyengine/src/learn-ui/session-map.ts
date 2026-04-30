export type LearnSessionMapStep = 'read' | 'answer' | 'feedback' | 'consolidation';

export interface LearnSessionMapFlow {
  phase?: string;
  currentSubPhase?: string;
}

export function updateLearnSessionMap(root: Element | null, flow: LearnSessionMapFlow | null): void {
  if (!root || !flow) return;

  const subPhase = String(flow.currentSubPhase || 'read');
  const phase = String(flow.phase || 'tutor');
  const activeKey = activeStepForPhase(phase, subPhase);
  const complete = completedStepsForPhase(phase, subPhase);
  const steps = root.querySelectorAll<HTMLElement>('[data-learn-session-step]');

  steps.forEach((step) => {
    const key = String(step.getAttribute('data-learn-session-step') || '') as LearnSessionMapStep;
    const isActive = key === activeKey;
    step.classList.toggle('is-active', isActive);
    step.classList.toggle('is-complete', !!complete[key]);
    if (isActive) step.setAttribute('aria-current', 'step');
    else step.removeAttribute('aria-current');
  });
}

function activeStepForPhase(phase: string, subPhase: string): LearnSessionMapStep | '' {
  if (phase === 'consolidating') return 'consolidation';
  if (phase === 'done') return '';
  if (subPhase === 'answer' || subPhase === 'scaffold' || subPhase === 'feedback') {
    return subPhase === 'feedback' ? 'feedback' : 'answer';
  }
  return 'read';
}

function completedStepsForPhase(
  phase: string,
  subPhase: string
): Record<LearnSessionMapStep, boolean> {
  return {
    read: phase === 'consolidating' || phase === 'done' || subPhase === 'answer' || subPhase === 'scaffold' || subPhase === 'feedback',
    answer: phase === 'consolidating' || phase === 'done' || subPhase === 'feedback',
    feedback: phase === 'consolidating' || phase === 'done',
    consolidation: phase === 'done'
  };
}

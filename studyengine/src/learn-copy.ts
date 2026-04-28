export const LEARN_EMPTY_HEADING = 'Build the first memory trace';
export const LEARN_EMPTY_BODY = 'Learn is the guided first pass before spaced review. Each segment gives a compact model, asks you to produce something in your own words, then uses feedback to tighten the trace before scheduling takes over.';
export const LEARN_EMPTY_CTA = 'Choose a sub-deck to begin.';

export const LEARN_EMPTY_LABEL_ENCODING = 'Encoding';
export const LEARN_EMPTY_LABEL_RETRIEVAL = 'Retrieval';

export const LEARN_LANDING_STATUS_UNLEARNED = 'unlearned';
export const LEARN_LANDING_STATUS_TAUGHT = 'taught';
export const LEARN_LANDING_STATUS_CONSOLIDATED = 'consolidated';
export const LEARN_LANDING_CACHE_HIT = (relative: string): string => `Plan loaded from cache, generated ${relative}.`;
export const LEARN_LANDING_CACHE_MISS = 'First start creates a fresh plan with Gemini.';
export const LEARN_LANDING_START = 'Start Learn session';
export const LEARN_LANDING_REGEN = 'Regenerate plan';
export const LEARN_REGEN_CONFIRM = 'Regenerate the learning plan for this sub-deck? (uses API tokens)';

export const LEARN_INTRO_TEXT = "Learn teaches first, Review strengthens what you\'ve learned. Both matter.";
export const LEARN_INTRO_DISMISS = 'Got it';

export function formatRelativeTime(timestamp: number): string {
  const diffMs = Math.max(0, Date.now() - Number(timestamp || 0));
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(timestamp).toISOString().slice(0, 10);
}

(globalThis as typeof globalThis & { __studyEngineLearnCopy?: Record<string, unknown> }).__studyEngineLearnCopy = {
  LEARN_EMPTY_HEADING,
  LEARN_EMPTY_BODY,
  LEARN_EMPTY_CTA,
  LEARN_EMPTY_LABEL_ENCODING,
  LEARN_EMPTY_LABEL_RETRIEVAL,
  LEARN_LANDING_STATUS_UNLEARNED,
  LEARN_LANDING_STATUS_TAUGHT,
  LEARN_LANDING_STATUS_CONSOLIDATED,
  LEARN_LANDING_CACHE_HIT,
  LEARN_LANDING_CACHE_MISS,
  LEARN_LANDING_START,
  LEARN_LANDING_REGEN,
  LEARN_REGEN_CONFIRM,
  LEARN_INTRO_TEXT,
  LEARN_INTRO_DISMISS,
  formatRelativeTime
};

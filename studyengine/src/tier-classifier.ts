import type { BloomProfile, CourseContext, StudyItem, TierId } from './types';

export type Tier = TierId;

export interface TierClassification {
  tier: Tier;
  reason: string;
}

export interface TierClassifierDeps {
  isEssayMode: (item: Pick<StudyItem, 'timeLimitMins' | 'examType' | 'prompt' | 'modelAnswer'>) => boolean;
}

export interface ReclassifyOptions {
  respectExplicitTier?: boolean;
}

// B3: classification-based tier counting for headline/dashboard displays.
export function countItemsByClassifiedTier(items: Array<Pick<StudyItem, 'tier'>>): Record<TierId, number> {
  const counts: Record<TierId, number> = {
    quickfire: 0,
    explain: 0,
    apply: 0,
    distinguish: 0,
    mock: 0,
    worked: 0
  };
  (items || []).forEach((item) => {
    const tier = item?.tier || 'quickfire';
    if (tier in counts) counts[tier as TierId] += 1;
    else counts.quickfire += 1;
  });
  return counts;
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

// B1: profile-neutral content availability requirements by tier.
export const tierContentRequirements: Record<TierId, (item: StudyItem) => boolean> = {
  quickfire: (item) => hasText(item.prompt) && hasText(item.modelAnswer),
  explain: (item) => hasText(item.prompt) && hasText(item.modelAnswer),
  apply: (item) => hasText(item.task),
  distinguish: (item) => hasText(item.conceptA) && hasText(item.conceptB),
  mock: (item) => hasText(item.scenario) || (typeof item.timeLimitMins === 'number' && item.timeLimitMins > 0),
  worked: (item) => hasText(item.workedScaffold)
};

const PROMPT_DISTINGUISH_RE = /(distinguish|compare|contrast)\s+between/i;
const PROMPT_DIFFERENCE_RE = /difference[s]?\s+between\s+\w+\s+and\s+\w+/i;
const PROMPT_APPLY_RE = /^(apply)\b/i;
const PROMPT_SCENARIO_RE = /(scenario|case study|given the following|consider a|suppose that|imagine)/i;
const PROMPT_EXPLAIN_RE = /^(explain|describe|why|how does|what causes|what role does)\b/i;
const PROMPT_ESSAY_RE = /(essay|extended response|long answer)/i;
const STEP_MARKERS = [
  /step\s*\d+/gi,
  /\bfirst,\b/gi,
  /\bsecond,\b/gi,
  /\bthird,\b/gi,
  /\bfinally,\b/gi,
  /\n\s*1\.\s+/g,
  /\n\s*2\.\s+/g,
  /\n\s*3\.\s+/g
];

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function hasStepMarkers(modelAnswer: string): boolean {
  let markers = 0;
  STEP_MARKERS.forEach((re) => {
    const matches = modelAnswer.match(re);
    if (matches) markers += matches.length;
  });
  return markers >= 3;
}

// Deterministic first-match heuristics keep classification free, reproducible, and latency-free across imports.
export function classifyTier(
  card: Pick<StudyItem, 'prompt' | 'modelAnswer' | 'task' | 'workedScaffold' | 'conceptA' | 'conceptB' | 'timeLimitMins' | 'examType'>,
  deps: TierClassifierDeps
): TierClassification {
  const prompt = asText(card.prompt);
  const modelAnswer = asText(card.modelAnswer);
  const task = asText(card.task);
  const workedScaffold = asText(card.workedScaffold);
  const conceptA = asText(card.conceptA);
  const conceptB = asText(card.conceptB);
  const modelAnswerWords = wordCount(modelAnswer);
  const promptTrimmed = prompt.trim();

  if (workedScaffold.trim() || hasStepMarkers(modelAnswer)) {
    return {
      tier: 'worked',
      reason: workedScaffold.trim() ? 'has-workedScaffold' : 'modelAnswer-step-markers>=3'
    };
  }

  if ((conceptA.trim() && conceptB.trim()) || PROMPT_DISTINGUISH_RE.test(prompt) || PROMPT_DIFFERENCE_RE.test(prompt)) {
    return {
      tier: 'distinguish',
      reason: (conceptA.trim() && conceptB.trim()) ? 'has-conceptA-and-conceptB' : 'prompt-distinguish-pattern'
    };
  }

  if ((typeof card.timeLimitMins === 'number' && card.timeLimitMins > 0) || deps.isEssayMode(card) || (modelAnswerWords > 220 && PROMPT_ESSAY_RE.test(prompt))) {
    return {
      tier: 'mock',
      reason: (typeof card.timeLimitMins === 'number' && card.timeLimitMins > 0)
        ? 'timeLimitMins>0'
        : deps.isEssayMode(card)
          ? 'isEssayMode-true'
          : 'long-modelAnswer-and-essay-prompt'
    };
  }

  if (task.trim() || PROMPT_SCENARIO_RE.test(prompt) || PROMPT_APPLY_RE.test(promptTrimmed)) {
    return {
      tier: 'apply',
      reason: task.trim() ? 'has-task' : PROMPT_APPLY_RE.test(promptTrimmed) ? 'prompt-starts-with-Apply' : 'prompt-scenario-pattern'
    };
  }

  if (PROMPT_EXPLAIN_RE.test(promptTrimmed) || (modelAnswerWords >= 40 && modelAnswerWords <= 220)) {
    return {
      tier: 'explain',
      reason: PROMPT_EXPLAIN_RE.test(promptTrimmed) ? 'prompt-explain-starter' : 'modelAnswer-wordcount-40-220'
    };
  }

  return { tier: 'quickfire', reason: 'fallback-quickfire' };
}

function normalizeTier(tier: unknown): string {
  return String(tier || '').toLowerCase().replace(/[\s_-]+/g, '');
}

type TierTargetDistribution = Record<TierId, number>;

export function resolveTierTargetDistribution(
  course: { courseContext?: CourseContext | null } | null | undefined
): TierTargetDistribution | null {
  const bloom = (course && course.courseContext && course.courseContext.bloomProfile) || null;
  if (!bloom || typeof bloom !== 'object') return null;

  const safe = (value: unknown): number => {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : 0;
  };

  const remember = safe((bloom as BloomProfile).remember);
  const understand = safe((bloom as BloomProfile).understand);
  const apply = safe((bloom as BloomProfile).apply);
  const analyze = safe((bloom as BloomProfile).analyze);
  const evaluate = safe((bloom as BloomProfile).evaluate);
  const create = safe((bloom as BloomProfile).create);

  const raw: TierTargetDistribution = {
    quickfire: (remember * 1.0) + (understand * 0.35),
    explain: (remember * 0.35) + (understand * 1.0),
    apply: (apply * 1.0) + (analyze * 0.35),
    distinguish: (apply * 0.35) + (analyze * 1.0),
    mock: (evaluate * 0.8) + (create * 0.45),
    worked: (evaluate * 0.45) + (create * 0.8)
  };

  const total = (Object.values(raw) as number[]).reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return null;

  const normalized = {} as TierTargetDistribution;
  (Object.keys(raw) as TierId[]).forEach((tier) => {
    normalized[tier] = raw[tier] / total;
  });
  return normalized;
}

export function maybeReclassify(
  card: StudyItem,
  deps: TierClassifierDeps,
  opts?: ReclassifyOptions
): { changed: boolean; tier: Tier; reason: string } {
  const respectExplicitTier = opts?.respectExplicitTier !== false;
  const classified = classifyTier(card, deps);
  const currentRaw = card.tier || '';
  const current = normalizeTier(currentRaw);
  const hasExplicitNonDefaultTier = !!current && current !== 'quickfire';

  if (respectExplicitTier && hasExplicitNonDefaultTier) {
    return {
      changed: false,
      tier: card.tier || 'quickfire',
      reason: 'kept-explicit-tier'
    };
  }

  const canOverwrite = !current || current === 'quickfire';
  if (canOverwrite && classified.tier !== current) {
    card.tier = classified.tier;
    return { changed: true, tier: classified.tier, reason: classified.reason };
  }

  return {
    changed: false,
    tier: (card.tier || classified.tier || 'quickfire') as Tier,
    reason: classified.reason
  };
}

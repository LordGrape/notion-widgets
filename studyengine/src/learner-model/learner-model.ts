import type { PlanProfile } from '../types';
import type { LearnerModel, LearnCheckType, ProfileSuccessRates } from './types';

export const LEARNER_MODEL_STORAGE_KEY = 'studyengine.learnerModel.v1';
const CHECK_TYPES: LearnCheckType[] = ['elaborative', 'predictive', 'self_explain', 'prior_knowledge_probe', 'worked_example', 'transfer_question', 'cloze'];
const PROFILE_TYPES: PlanProfile[] = ['theory', 'factual', 'procedural', 'language'];
const SESSION_ALPHA = 0.05;

export interface SessionOutcome {
  profile: PlanProfile;
  checkTypeVerdicts: Array<{ checkType: LearnCheckType; verdict: 'surface' | 'partial' | 'deep' }>;
  jolCalibrationDelta?: number;
  lifecycleTransitions?: Array<{ from: string; to: string; startedAt?: string; endedAt?: string; success?: boolean }>;
  sourceTypeLapses?: Array<{ sourceType: string; maintainingReviews?: number; lapses?: number }>;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function nowIso(): string {
  return new Date().toISOString();
}

function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function rounded(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function defaultLearnerModel(): LearnerModel {
  const uniform = 1 / CHECK_TYPES.length;
  return {
    version: 1,
    updatedAt: nowIso(),
    sessionCount: 0,
    checkTypeStrengths: CHECK_TYPES.reduce((acc, checkType) => {
      acc[checkType] = 0.5;
      return acc;
    }, {} as Record<LearnCheckType, number>),
    profileSuccess: {},
    calibration: { overconfidenceBias: 0, sampleSize: 0 },
    consolidationHalfLifeDays: null,
    sourceTypeLapseRate: {},
    recommendedSegmentMix: CHECK_TYPES.reduce((acc, checkType) => {
      acc[checkType] = uniform;
      return acc;
    }, {} as Record<LearnCheckType, number>)
  };
}

export function loadLearnerModel(): LearnerModel {
  try {
    const raw = globalThis.localStorage?.getItem(LEARNER_MODEL_STORAGE_KEY);
    if (!raw) return defaultLearnerModel();
    const parsed = JSON.parse(raw) as LearnerModel;
    if (!parsed || parsed.version !== 1) return defaultLearnerModel();
    return { ...defaultLearnerModel(), ...parsed, version: 1 };
  } catch {
    return defaultLearnerModel();
  }
}

function updateProfileSuccess(prev: Partial<Record<PlanProfile, ProfileSuccessRates>>, profile: PlanProfile, verdicts: SessionOutcome['checkTypeVerdicts']): Partial<Record<PlanProfile, ProfileSuccessRates>> {
  const next = { ...prev };
  const prior = next[profile] || { sessions: 0, deepRate: 0, partialRate: 0, surfaceRate: 0 };
  const deep = verdicts.filter((v) => v.verdict === 'deep').length;
  const partial = verdicts.filter((v) => v.verdict === 'partial').length;
  const surface = verdicts.filter((v) => v.verdict === 'surface').length;
  const total = Math.max(1, verdicts.length);
  next[profile] = {
    sessions: Math.min(200, prior.sessions + 1),
    deepRate: clamp01(prior.deepRate * (1 - SESSION_ALPHA) + (deep / total) * SESSION_ALPHA),
    partialRate: clamp01(prior.partialRate * (1 - SESSION_ALPHA) + (partial / total) * SESSION_ALPHA),
    surfaceRate: clamp01(prior.surfaceRate * (1 - SESSION_ALPHA) + (surface / total) * SESSION_ALPHA)
  };
  return next;
}

function updateHalfLife(prev: number | null, transitions: SessionOutcome['lifecycleTransitions']): number | null {
  const samples = (transitions || []).filter((t) => t.from === 'consolidating' && t.to === 'maintaining' && t.success && t.startedAt && t.endedAt)
    .map((t) => {
      const start = new Date(String(t.startedAt)).getTime();
      const end = new Date(String(t.endedAt)).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
      return (end - start) / 86400000;
    })
    .filter((v): v is number => Number.isFinite(v));
  if (samples.length < 5) return prev;
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)] || null;
  if (median == null) return prev;
  if (prev == null) return median;
  return clamp01((prev * (1 - SESSION_ALPHA) + median * SESSION_ALPHA) / 365) * 365;
}

export function computeRecommendedSegmentMix(model: LearnerModel): Record<LearnCheckType, number> {
  const includeCloze = Number(model.profileSuccess.language?.sessions || 0) > 0;
  const activeTypes = CHECK_TYPES.filter((ct) => includeCloze || ct !== 'cloze');
  const weighted = activeTypes.map((ct) => {
    const strength = clamp01(Number(model.checkTypeStrengths[ct] ?? 0.5));
    return { ct, w: Math.max(0.05, 1 - strength + 0.25) };
  });
  const total = weighted.reduce((sum, entry) => sum + entry.w, 0) || 1;
  const next = {} as Record<LearnCheckType, number>;
  CHECK_TYPES.forEach((ct) => { next[ct] = 0; });
  weighted.forEach((entry) => {
    next[entry.ct] = entry.w / total;
  });
  return next;
}

export function recordSessionOutcome(model: LearnerModel, summary: SessionOutcome): LearnerModel {
  const next: LearnerModel = JSON.parse(JSON.stringify(model || defaultLearnerModel()));
  next.sessionCount = Math.min(200, Math.max(0, Number(next.sessionCount || 0) + 1));
  CHECK_TYPES.forEach((checkType) => {
    const matches = (summary.checkTypeVerdicts || []).filter((entry) => entry.checkType === checkType);
    if (!matches.length) return;
    const scored = matches.reduce((sum, entry) => sum + (entry.verdict === 'deep' ? 1 : entry.verdict === 'partial' ? 0.5 : 0), 0) / matches.length;
    next.checkTypeStrengths[checkType] = clamp01((next.checkTypeStrengths[checkType] || 0.5) * (1 - SESSION_ALPHA) + scored * SESSION_ALPHA);
  });
  next.profileSuccess = updateProfileSuccess(next.profileSuccess || {}, summary.profile, summary.checkTypeVerdicts || []);
  const delta = Number(summary.jolCalibrationDelta || 0);
  next.calibration.overconfidenceBias = Math.max(-1, Math.min(1, (next.calibration.overconfidenceBias || 0) * (1 - SESSION_ALPHA) + delta * SESSION_ALPHA));
  next.calibration.sampleSize = Math.min(200, Number(next.calibration.sampleSize || 0) + 1);
  next.consolidationHalfLifeDays = updateHalfLife(next.consolidationHalfLifeDays, summary.lifecycleTransitions);
  (summary.sourceTypeLapses || []).forEach((entry) => {
    const key = String(entry.sourceType || 'manual') as keyof LearnerModel['sourceTypeLapseRate'];
    const prior = Number(next.sourceTypeLapseRate[key] || 0);
    const denom = Math.max(1, Number(entry.maintainingReviews || 0));
    const rate = clamp01(Number(entry.lapses || 0) / denom);
    next.sourceTypeLapseRate[key] = clamp01(prior * (1 - SESSION_ALPHA) + rate * SESSION_ALPHA);
  });
  next.recommendedSegmentMix = computeRecommendedSegmentMix(next);
  next.updatedAt = nowIso();
  return next;
}

export function composeLearnerModelFingerprint(model: LearnerModel): string {
  const quantizedMix = Object.keys(model.recommendedSegmentMix || {}).sort().reduce((acc, key) => {
    acc[key] = rounded(Number((model.recommendedSegmentMix as any)[key] || 0), 0.05);
    return acc;
  }, {} as Record<string, number>);
  const quantizedProfiles = PROFILE_TYPES.reduce((acc, profile) => {
    const rates = model.profileSuccess?.[profile];
    if (!rates) return acc;
    acc[profile] = {
      deepRate: rounded(Number(rates.deepRate || 0), 0.1),
      partialRate: rounded(Number(rates.partialRate || 0), 0.1)
    };
    return acc;
  }, {} as Record<string, { deepRate: number; partialRate: number }>);
  const quantized = {
    mix: quantizedMix,
    bias: rounded(Number(model.calibration?.overconfidenceBias || 0), 0.05),
    profile: quantizedProfiles,
    bucket: Math.floor(new Date(model.updatedAt || nowIso()).getTime() / 3600000)
  };
  return djb2(JSON.stringify(quantized));
}

export function saveLearnerModel(model: LearnerModel): void {
  try {
    globalThis.localStorage?.setItem(LEARNER_MODEL_STORAGE_KEY, JSON.stringify(model));
  } catch {
    // quota/storage blocked guard
  }
}

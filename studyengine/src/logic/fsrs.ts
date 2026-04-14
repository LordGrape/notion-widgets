// SACRED MODULE - FSRS-6 Algorithm
// DO NOT MODIFY ANY LOGIC OR CONSTANTS - only type annotations added
// Ported from studyengine/js/fsrs.js

import type { FSRSData, StudyItem } from '../types';

// FSRS-6 weights (SACRED - do not modify)
// From state.js lines 300-302: DEFAULT_WEIGHTS and FSRS6_DEFAULT_DECAY
const FSRS6_DEFAULT_DECAY = 0.1542;

// Global weights array - initialized with DEFAULT_WEIGHTS
const DEFAULT_WEIGHTS: number[] = [
  0.2172, 1.2931, 2.3065, 8.2956, 6.4133,
  0.8334, 3.0194, 0.001, 1.8722, 0.1666,
  0.796, 1.4835, 0.0614, 0.2629, 1.6483,
  0.6014, 1.8729, 0.5425, 0.0912, 0.0658,
  FSRS6_DEFAULT_DECAY
];

let w: number[] = DEFAULT_WEIGHTS.slice();

// FSRS TypeScript types (if available)
interface FSRSTypes {
  clipParameters(params: number[], factor?: number, strict?: boolean): number[];
  checkParameters(params: number[]): Float64Array;
  migrateParameters(params: number[]): number[];
  FSRS: new (params: unknown) => unknown;
  generatorParameters(config: { w: number[]; request_retention: number; enable_fuzz: boolean }): unknown;
}

let fsrsInstance: unknown = null;

export function getFsrsDecay(): number {
  return (w.length >= 21 && w[20] > 0) ? w[20] : FSRS6_DEFAULT_DECAY;
}

export function getFsrsFactor(): number {
  const decay = getFsrsDecay();
  return Math.pow(0.9, 1.0 / -decay) - 1.0;
}

export function daysBetween(a: number, b: number): number {
  return (b - a) / (1000 * 60 * 60 * 24);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function retrievability(fsrs: FSRSData | undefined, nowTs: number): number {
  if (!fsrs) return 1;
  const S = fsrs.stability || 0;
  const last = fsrs.lastReview ? new Date(fsrs.lastReview).getTime() : null;
  if (!last) return 1;
  if (!S || S <= 0) return 1;
  const t = Math.max(0, daysBetween(last, nowTs));
  const decay = getFsrsDecay();
  const factor = getFsrsFactor();
  const R = Math.pow(t / S * factor + 1.0, -decay);
  return clamp(R, 0, 1);
}

export function initialDifficulty(rating: number): number {
  const D0 = w[4] - Math.exp(w[5] * (rating - 1)) + 1;
  return clamp(D0, 1, 10);
}

export function updateDifficulty(D: number, rating: number): number {
  if (!D || D <= 0) D = 5;
  const Dp = D - w[6] * (rating - 3);
  return clamp(Dp, 1, 10);
}

export function stabilityAfterSuccess(S: number, D: number, R: number): number {
  if (!S || S <= 0) S = 1;
  if (!D || D <= 0) D = 5;
  const term = (Math.exp(w[8]) * (11 - D) * Math.pow(S, -w[9]) * (Math.exp(w[10] * (1 - R)) - 1) + 1);
  const Sp = S * term;
  return clamp(Sp, 0.1, 3650);
}

export function stabilityAfterForget(S: number, D: number, R: number): number {
  if (!S || S < 0) S = 1;
  if (!D || D <= 0) D = 5;
  const Sp = w[11] * Math.pow(D, -w[12]) * (Math.pow((S + 1), w[13]) - 1) * Math.exp(w[14] * (1 - R));
  return clamp(Sp, 0.1, 3650);
}

export function nextIntervalDays(S: number, desiredRetention: number): number {
  let r = desiredRetention || 0.9;
  r = clamp(r, 0.80, 0.95);
  const decay = getFsrsDecay();
  const factor = getFsrsFactor();
  // FSRS-6: t = S / factor * (R^(-1/decay) - 1)
  return Math.max(0.1, S / factor * (Math.pow(r, -1.0 / decay) - 1.0));
}

export interface ScheduleResult {
  intervalDays: number;
  retr: number;
}

export function scheduleFsrs(
  item: StudyItem,
  rating: number,
  nowTs: number,
  allowWrite: boolean,
  desiredRetention: number
): ScheduleResult {
  if (!item.fsrs) {
    item.fsrs = {
      stability: 0,
      difficulty: 0,
      due: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      lastReview: null,
      reps: 0,
      lapses: 0,
      state: 'new'
    };
  }
  const f = item.fsrs;

  const first = !f.lastReview;
  const lastTs = f.lastReview ? new Date(f.lastReview).getTime() : nowTs;
  const tDays = Math.max(0, daysBetween(lastTs, nowTs));
  const S = (f.stability && f.stability > 0) ? f.stability : (first ? 1 : 0.1);
  const D = (f.difficulty && f.difficulty > 0) ? f.difficulty : (first ? initialDifficulty(rating) : 5);
  const _decay = getFsrsDecay();
  const _factor = getFsrsFactor();
  const R = clamp(Math.pow(tDays / (S || 0.1) * _factor + 1.0, -_decay), 0, 1);

  const newD = first ? initialDifficulty(rating) : updateDifficulty(D, rating);
  const newS = (rating === 1) ? stabilityAfterForget(S, newD, R) : stabilityAfterSuccess(S, newD, R);

  f.reps = (f.reps || 0) + 1;
  if (rating === 1) f.lapses = (f.lapses || 0) + 1;
  f.difficulty = newD;
  f.stability = newS;
  f.lastReview = new Date(nowTs).toISOString();

  if (rating === 1) f.state = (f.state === 'review') ? 'relearning' : 'learning';
  else f.state = 'review';

  const interval = nextIntervalDays(newS, desiredRetention);
  if (first && interval < 1) {
    // First review minimum 1 day
    return { intervalDays: 1, retr: R };
  }
  const dueTs = nowTs + interval * 24 * 60 * 60 * 1000;
  f.due = new Date(dueTs).toISOString();

  if (allowWrite) item.fsrs = f;
  return { intervalDays: interval, retr: R };
}

export interface TierCounts {
  quickfire: number;
  explain: number;
  apply: number;
  distinguish: number;
  mock: number;
  worked: number;
}

export function reweightProfile(
  profile: TierCounts,
  tierBuckets: Record<string, StudyItem[]>,
  targetTotal: number
): TierCounts {
  const tierOrder: (keyof TierCounts)[] = ['quickfire', 'explain', 'apply', 'distinguish', 'mock', 'worked'];
  const counts: Partial<TierCounts> = {};

  // Pass 1: cap each tier at available unique items
  const uniqueAvailable: Partial<Record<keyof TierCounts, number>> = {};
  const seenIds: Record<string, boolean> = {};
  tierOrder.forEach((t) => {
    let unique = 0;
    (tierBuckets[t] || []).forEach((it) => {
      if (!seenIds[t + ':' + it.id]) { unique++; seenIds[t + ':' + it.id] = true; }
    });
    uniqueAvailable[t] = unique;
  });

  // Initial ideal counts
  tierOrder.forEach((t) => {
    counts[t] = Math.round(profile[t] * targetTotal);
  });

  // Cap at available
  let excess = 0;
  const uncapped: (keyof TierCounts)[] = [];
  tierOrder.forEach((t) => {
    const available = uniqueAvailable[t] || 0;
    const count = counts[t] || 0;
    if (count > available) {
      excess += count - available;
      counts[t] = available;
    } else {
      uncapped.push(t);
    }
  });

  // Redistribute excess proportionally to uncapped tiers
  if (excess > 0 && uncapped.length > 0) {
    let uncappedTotal = 0;
    uncapped.forEach((t) => { uncappedTotal += profile[t]; });
    if (uncappedTotal > 0) {
      uncapped.forEach((t) => {
        const bonus = Math.round(excess * (profile[t] / uncappedTotal));
        const maxAdd = (uniqueAvailable[t] || 0) - (counts[t] || 0);
        counts[t] = (counts[t] || 0) + Math.min(bonus, maxAdd);
      });
    }
  }

  // Minimum floor: 1 item per tier if any available and target allows
  tierOrder.forEach((t) => {
    if (counts[t] === 0 && (uniqueAvailable[t] || 0) > 0 && targetTotal > tierOrder.length) {
      counts[t] = 1;
    }
  });

  return counts as TierCounts;
}

export function optimizeFsrsParams(calibrationHistory: unknown[]): boolean {
  const TS = typeof (window as unknown as Record<string, unknown>).FSRS !== 'undefined'
    ? (window as unknown as Record<string, unknown>).FSRS as FSRSTypes
    : null;
  const history = (Array.isArray(calibrationHistory) ? calibrationHistory : []) as Array<{ rating?: number }>;
  if (history.length < 30 || !TS || !TS.clipParameters || !TS.checkParameters || !TS.migrateParameters) return false;
  try {
    let sum = 0, n = 0;
    history.forEach((h) => {
      if (h && h.rating && h.rating >= 1 && h.rating <= 4) { sum += h.rating; n++; }
    });
    if (n < 30) return false;
    const avg = sum / n;
    // Slightly stretch intervals if ratings skew easy; compress if skew hard
    const stretch = avg >= 3.25 ? 0.94 : avg <= 2.35 ? 1.06 : 1;
    let wNew = w.map((val, i) => {
      const f = (i === 7 || i === 8 || i === 9) ? stretch : (Math.abs(stretch - 1) > 0.01 ? 1 + (stretch - 1) * 0.25 : 1);
      return val * f;
    });
    wNew = TS.clipParameters(Array.from(TS.checkParameters(wNew)), 2, true);
    w = wNew;
    if (w.length < 21) {
      while (w.length < 21) w.push(FSRS6_DEFAULT_DECAY);
    }
    if (TS.FSRS && TS.generatorParameters) {
      fsrsInstance = new TS.FSRS(TS.generatorParameters({
        w: w,
        request_retention: 0.9,
        enable_fuzz: true
      }));
    }
    // Note: SyncEngine.set removed - caller should persist if needed
    return true;
  } catch (e) {
    console.warn('FSRS optimization failed:', e);
  }
  return false;
}

export function loadOptimizedWeights(): void {
  // This is a placeholder - actual loading happens via SyncEngine in the component layer
  // Weights are stored globally in the `w` array
}

export function getWeights(): number[] {
  return w.slice();
}

export function setWeights(newWeights: number[]): void {
  w = newWeights.slice();
}

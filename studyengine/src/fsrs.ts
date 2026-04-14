/*
 * FSRS TypeScript Module
 * SACRED: Algorithm logic is untouched. Only imports and state access changed.
 */

import { NS, FSRS6_DEFAULT_DECAY, DEFAULT_WEIGHTS } from './constants';
import { settings, calibration } from './signals';
import { daysBetween, clamp } from './utils';
import type { StudyItem, FSRSState, FSRSModule } from './types';

// External CDN globals (keep as declare)
declare const SyncEngine: {
  set: (ns: string, key: string, val: unknown) => void;
  get: (ns: string, key: string) => unknown;
};

// Module-level mutable weights (optimizer updates these)
let w = DEFAULT_WEIGHTS.slice();
let fsrsInstance: unknown = null;

/**
 * Optimize FSRS parameters based on review history
 * SACRED: Do not modify logic
 */
function optimizeFsrsParams(): boolean {
  const TS: FSRSModule | null = typeof FSRS !== 'undefined' ? (FSRS as unknown as FSRSModule) : null;
  const history = (calibration.value?.history) || [];
  if (history.length < 30 || !TS || !TS.clipParameters || !TS.checkParameters || !TS.migrateParameters) return false;
  try {
    let sum = 0;
    let n = 0;
    history.forEach((h) => {
      if (h && h.rating && h.rating >= 1 && h.rating <= 4) { sum += h.rating; n++; }
    });
    if (n < 30) return false;
    const avg = sum / n;
    const wBase = TS.migrateParameters(w.slice());
    // Slightly stretch intervals if ratings skew easy; compress if skew hard
    const stretch = avg >= 3.25 ? 0.94 : avg <= 2.35 ? 1.06 : 1;
    let wNew = wBase.map((val: number, i: number) => {
      const f = (i === 7 || i === 8 || i === 9) ? stretch : (Math.abs(stretch - 1) > 0.01 ? 1 + (stretch - 1) * 0.25 : 1);
      return val * f;
    });
    wNew = TS.clipParameters(Array.from(TS.checkParameters(wNew)), 2, true);
    // Update global w array
    (window as unknown as { w: number[] }).w = wNew;
    if (wNew.length < 21) {
      while (wNew.length < 21) wNew.push(FSRS6_DEFAULT_DECAY);
    }
    if (TS.FSRS && TS.generatorParameters) {
      const newInstance = new TS.FSRS(TS.generatorParameters({
        w: wNew,
        request_retention: settings.value.desiredRetention || 0.9,
        enable_fuzz: true
      }));
      (window as unknown as { fsrsInstance: unknown }).fsrsInstance = newInstance;
    }
    if (typeof SyncEngine !== 'undefined') {
      SyncEngine.set(NS, 'optimizedWeights', wNew);
    }
    return true;
  } catch (e) {
    console.warn('FSRS optimization failed:', e);
  }
  return false;
}

// Initialize fsrsInstance
try {
  if (typeof FSRS !== 'undefined' && (FSRS as unknown as { FSRS?: new (params: unknown) => unknown }).FSRS && (FSRS as unknown as { generatorParameters?: (opts: unknown) => unknown }).generatorParameters) {
    fsrsInstance = new (FSRS as unknown as { FSRS: new (params: unknown) => unknown }).FSRS(
      (FSRS as unknown as { generatorParameters: (opts: unknown) => unknown }).generatorParameters({
        w: DEFAULT_WEIGHTS.slice(),
        request_retention: 0.9,
        enable_fuzz: true
      })
    );
  }
} catch (e) {
  console.warn('ts-fsrs not loaded; inline FSRS only');
}

/**
 * Get current FSRS decay parameter
 */
function getFsrsDecay(): number {
  return (w.length >= 21 && w[20] > 0) ? w[20] : FSRS6_DEFAULT_DECAY;
}

/**
 * Calculate FSRS factor from decay
 */
function getFsrsFactor(): number {
  const decay = getFsrsDecay();
  return Math.pow(0.9, 1.0 / -decay) - 1.0;
}

/**
 * Calculate retrievability for a given FSRS state and timestamp
 */
export function retrievability(fsrs: FSRSState | null | undefined, nowTs: number): number {
  if (!fsrs) return 1;
  let S = fsrs.stability || 0;
  const last = fsrs.lastReview ? new Date(fsrs.lastReview).getTime() : null;
  if (!last) return 1;
  if (!S || S <= 0) S = 0.1;
  const t = Math.max(0, daysBetween(last, nowTs));
  const decay = getFsrsDecay();
  const factor = getFsrsFactor();
  const R = Math.pow(t / S * factor + 1.0, -decay);
  return clamp(R, 0, 1);
}

/**
 * Calculate initial difficulty from first rating
 */
function initialDifficulty(rating: number): number {
  const D0 = w[4] - Math.exp(w[5] * (rating - 1)) + 1;
  return clamp(D0, 1, 10);
}

/**
 * Update difficulty after a rating
 */
function updateDifficulty(D: number, rating: number): number {
  let Dval = D;
  if (!Dval || Dval <= 0) Dval = 5;
  const Dp = Dval - w[6] * (rating - 3);
  return clamp(Dp, 1, 10);
}

/**
 * Calculate new stability after successful recall
 */
function stabilityAfterSuccess(S: number, D: number, R: number): number {
  let Sval = S;
  let Dval = D;
  if (!Sval || Sval <= 0) Sval = 1;
  if (!Dval || Dval <= 0) Dval = 5;
  const term = (Math.exp(w[8]) * (11 - Dval) * Math.pow(Sval, -w[9]) * (Math.exp(w[10] * (1 - R)) - 1) + 1);
  const Sp = Sval * term;
  return clamp(Sp, 0.1, 3650);
}

/**
 * Calculate new stability after forgetting
 */
function stabilityAfterForget(S: number, D: number, R: number): number {
  let Sval = S;
  let Dval = D;
  if (!Sval || Sval < 0) Sval = 1;
  if (!Dval || Dval <= 0) Dval = 5;
  const Sp = w[11] * Math.pow(Dval, -w[12]) * (Math.pow((Sval + 1), w[13]) - 1) * Math.exp(w[14] * (1 - R));
  return clamp(Sp, 0.1, 3650);
}

/**
 * Calculate next interval in days for a given stability and desired retention
 */
function nextIntervalDays(S: number, desiredRetention?: number): number {
  let r = desiredRetention || 0.9;
  r = clamp(r, 0.80, 0.95);
  const decay = getFsrsDecay();
  const factor = getFsrsFactor();
  // FSRS-6: t = S / factor * (R^(-1/decay) - 1)
  return Math.max(0.1, S / factor * (Math.pow(r, -1.0 / decay) - 1.0));
}

/**
 * Schedule an item using FSRS algorithm
 * SACRED: Do not modify logic
 */
function scheduleFsrs(
  item: StudyItem,
  rating: number,
  nowTs: number,
  allowWrite: boolean
): { intervalDays: number; retr: number } {
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

  let interval = nextIntervalDays(newS, settings.value.desiredRetention);
  if (first && interval < 1) {
    interval = 1;
  }
  const dueTs = nowTs + interval * 24 * 60 * 60 * 1000;
  f.due = new Date(dueTs).toISOString();

  if (allowWrite) item.fsrs = f;
  return { intervalDays: interval, retr: R };
}

/**
 * Reweight tier profile based on available unique items
 */
function reweightProfile(
  profile: Record<string, number>,
  tierBuckets: Record<string, Array<{ id: string }>>,
  targetTotal: number
): Record<string, number> {
  const tierOrder = ['quickfire', 'explain', 'apply', 'distinguish', 'mock', 'worked'];
  const counts: Record<string, number> = {};

  // Pass 1: cap each tier at available unique items
  const uniqueAvailable: Record<string, number> = {};
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
  const uncapped: string[] = [];
  tierOrder.forEach((t) => {
    if (counts[t] > uniqueAvailable[t]) {
      excess += counts[t] - uniqueAvailable[t];
      counts[t] = uniqueAvailable[t];
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
        const maxAdd = uniqueAvailable[t] - counts[t];
        counts[t] += Math.min(bonus, maxAdd);
      });
    }
  }

  // Minimum floor: 1 item per tier if any available and target allows
  tierOrder.forEach((t) => {
    if (counts[t] === 0 && uniqueAvailable[t] > 0 && targetTotal > tierOrder.length) {
      counts[t] = 1;
    }
  });

  return counts;
}

// Only expose what Session.tsx needs via window
if (typeof window !== 'undefined') {
  const win = window as unknown as Record<string, unknown>;
  win.scheduleFsrs = scheduleFsrs;
  win.reweightProfile = reweightProfile;
}

export { reweightProfile, scheduleFsrs, optimizeFsrsParams };

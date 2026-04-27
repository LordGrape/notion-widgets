import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  composeLearnerModelFingerprint,
  computeRecommendedSegmentMix,
  defaultLearnerModel,
  loadLearnerModel,
  recordSessionOutcome,
  saveLearnerModel,
  LEARNER_MODEL_STORAGE_KEY
} from './learner-model';

describe('learner-model', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k)
    });
  });

  it('returns neutral default shape', () => {
    const model = defaultLearnerModel();
    expect(model.version).toBe(1);
    expect(model.sessionCount).toBe(0);
    expect(model.checkTypeStrengths.elaborative).toBe(0.5);
    expect(Object.values(model.recommendedSegmentMix).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it('caps rolling session count at 200', () => {
    let model = defaultLearnerModel();
    for (let i = 0; i < 220; i++) {
      model = recordSessionOutcome(model, { profile: 'theory', checkTypeVerdicts: [{ checkType: 'elaborative', verdict: 'deep' }] });
    }
    expect(model.sessionCount).toBe(200);
  });

  it('decays old strength values', () => {
    let model = defaultLearnerModel();
    model.checkTypeStrengths.elaborative = 1;
    model = recordSessionOutcome(model, { profile: 'theory', checkTypeVerdicts: [{ checkType: 'elaborative', verdict: 'surface' }] });
    expect(model.checkTypeStrengths.elaborative).toBeLessThan(1);
  });

  it('boosts weakest check type in segment mix', () => {
    const model = defaultLearnerModel();
    model.checkTypeStrengths.predictive = 0.1;
    model.checkTypeStrengths.elaborative = 0.9;
    const mix = computeRecommendedSegmentMix(model);
    expect(mix.predictive).toBeGreaterThan(mix.elaborative);
  });

  it('excludes cloze until language data exists', () => {
    const mix = computeRecommendedSegmentMix(defaultLearnerModel());
    expect(mix.cloze).toBe(0);
    const model = defaultLearnerModel();
    model.profileSuccess.language = { sessions: 1, deepRate: 0.4, partialRate: 0.3, surfaceRate: 0.3 };
    const withLanguage = computeRecommendedSegmentMix(model);
    expect(withLanguage.cloze).toBeGreaterThan(0);
  });

  it('tracks calibration drift after repeated sessions', () => {
    let model = defaultLearnerModel();
    for (let i = 0; i < 20; i++) {
      model = recordSessionOutcome(model, { profile: 'factual', checkTypeVerdicts: [{ checkType: 'predictive', verdict: 'deep' }], jolCalibrationDelta: 0.6 });
    }
    expect(model.calibration.sampleSize).toBe(20);
    expect(model.calibration.overconfidenceBias).toBeGreaterThan(0.3);
  });

  it('fingerprint is stable under tiny noise', () => {
    const model = defaultLearnerModel();
    model.recommendedSegmentMix.elaborative = 0.2001;
    const a = composeLearnerModelFingerprint(model);
    model.recommendedSegmentMix.elaborative = 0.2002;
    const b = composeLearnerModelFingerprint(model);
    expect(a).toBe(b);
  });

  it('fingerprint changes past 0.05 threshold', () => {
    const model = defaultLearnerModel();
    const a = composeLearnerModelFingerprint(model);
    model.recommendedSegmentMix.elaborative = 0.4;
    const b = composeLearnerModelFingerprint(model);
    expect(a).not.toBe(b);
  });

  it('updates source type lapse rate', () => {
    let model = defaultLearnerModel();
    model = recordSessionOutcome(model, {
      profile: 'procedural',
      checkTypeVerdicts: [{ checkType: 'worked_example', verdict: 'partial' }],
      sourceTypeLapses: [{ sourceType: 'manual', maintainingReviews: 10, lapses: 3 }]
    });
    expect((model.sourceTypeLapseRate.manual || 0)).toBeGreaterThan(0);
  });

  it('consolidation half-life requires >=5 samples', () => {
    let model = defaultLearnerModel();
    model = recordSessionOutcome(model, {
      profile: 'theory',
      checkTypeVerdicts: [{ checkType: 'elaborative', verdict: 'deep' }],
      lifecycleTransitions: Array.from({ length: 4 }).map((_, idx) => ({
        from: 'consolidating', to: 'maintaining', success: true,
        startedAt: new Date(2026, 0, 1 + idx).toISOString(),
        endedAt: new Date(2026, 0, 3 + idx).toISOString()
      }))
    });
    expect(model.consolidationHalfLifeDays).toBeNull();

    model = recordSessionOutcome(model, {
      profile: 'theory',
      checkTypeVerdicts: [{ checkType: 'elaborative', verdict: 'deep' }],
      lifecycleTransitions: Array.from({ length: 5 }).map((_, idx) => ({
        from: 'consolidating', to: 'maintaining', success: true,
        startedAt: new Date(2026, 0, 10 + idx).toISOString(),
        endedAt: new Date(2026, 0, 14 + idx).toISOString()
      }))
    });
    expect(model.consolidationHalfLifeDays).not.toBeNull();
  });

  it('load/save roundtrip works', () => {
    const model = defaultLearnerModel();
    model.sessionCount = 12;
    saveLearnerModel(model);
    const raw = globalThis.localStorage.getItem(LEARNER_MODEL_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const loaded = loadLearnerModel();
    expect(loaded.sessionCount).toBe(12);
  });
});

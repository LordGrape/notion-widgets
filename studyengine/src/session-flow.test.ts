import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyLearnHandoff, buildSessionQueue, computeSessionCalibration, evaluateRelearningTriggers, recordJol } from './session-flow';

const nowTs = Date.UTC(2026, 0, 1, 0, 0, 0);

function installBridge(items: Record<string, any>): void {
  (globalThis as any).__studyEngineSessionFlow = {
    state: { items, calibration: {}, stats: {}, courses: {}, learnProgress: {} },
    settings: { sessionLimit: 20, feedbackMode: 'self_rate' },
    getSelectedCourse: () => 'Biology',
    getSelectedTopic: () => 'All',
    getSidebarSelection: () => null,
    getIsEmbedded: () => true,
    getSleepAwareAdvice: () => ({ bias: 'new' }),
    getEffectiveProfile: () => ({ quickfire: 1, explain: 1, apply: 1, distinguish: 1, mock: 1, worked: 1 }),
    detectSupportedTiers: () => ['quickfire'],
    getCramState: () => ({ active: false, sessionMod: 1, intervalMod: 1 }),
    priorityWeight: () => 1,
    getOverconfidentTopics: () => [],
    getModuleById: () => null,
    saveState: vi.fn()
  };
}

describe('applyLearnHandoff seeding', () => {
  it('seeds rating 4 to 14d/14 stability', () => {
    const item = {
      id: 'a',
      prompt: 'p',
      modelAnswer: 'a',
      course: 'Biology',
      created: new Date(nowTs).toISOString(),
      learnStatus: 'unlearned',
      fsrs: { stability: 0, difficulty: 0, due: new Date(nowTs).toISOString(), reps: 0, lapses: 0, lastReview: null, state: 'new' }
    };
    installBridge({ a: item });
    applyLearnHandoff(new Map([['a', { status: 'consolidated', consolidationRating: 4 }]]), nowTs);
    expect(item.fsrs.stability).toBe(14);
    expect(new Date(item.fsrs.due).getTime()).toBe(nowTs + 14 * 24 * 60 * 60 * 1000);
  });

  it('seeds rating 3 to 5d/5 stability and rating 2 unchanged at 0.5', () => {
    const item3: any = {
      id: 'a3',
      prompt: 'p',
      modelAnswer: 'a',
      course: 'Biology',
      created: new Date(nowTs).toISOString(),
      learnStatus: 'unlearned',
      fsrs: { stability: 0, difficulty: 0, due: new Date(nowTs).toISOString(), reps: 0, lapses: 0, lastReview: null, state: 'new' }
    };
    const item2: any = {
      id: 'a2',
      prompt: 'p',
      modelAnswer: 'a',
      course: 'Biology',
      created: new Date(nowTs).toISOString(),
      learnStatus: 'unlearned',
      fsrs: { stability: 0, difficulty: 0, due: new Date(nowTs).toISOString(), reps: 0, lapses: 0, lastReview: null, state: 'new' }
    };
    installBridge({ a3: item3, a2: item2 });
    applyLearnHandoff(new Map([
      ['a3', { status: 'consolidated', consolidationRating: 3 }],
      ['a2', { status: 'consolidated', consolidationRating: 2 }]
    ]), nowTs);

    expect(item3.fsrs.stability).toBe(5);
    expect(new Date(item3.fsrs.due).getTime()).toBe(nowTs + 5 * 24 * 60 * 60 * 1000);
    expect(item2.fsrs.stability).toBe(0.5);
  });
});

describe('buildSessionQueue', () => {
  it('excludes retired cards', () => {
    installBridge({
      kept: {
        id: 'kept',
        prompt: 'p',
        modelAnswer: 'a',
        course: 'Biology',
        created: new Date(nowTs).toISOString(),
        fsrs: { stability: 0, difficulty: 0, due: new Date(nowTs - 1000).toISOString(), reps: 0, lapses: 0, lastReview: null, state: 'new' }
      },
      retired: {
        id: 'retired',
        prompt: 'p',
        modelAnswer: 'a',
        course: 'Biology',
        created: new Date(nowTs).toISOString(),
        lifecycleStage: 'retired',
        fsrs: { stability: 0, difficulty: 0, due: new Date(nowTs - 1000).toISOString(), reps: 0, lapses: 0, lastReview: null, state: 'new' }
      }
    });
    const q = buildSessionQueue();
    expect(q.map((item) => item.id)).toEqual(['kept']);
  });
});

describe('evaluateRelearningTriggers', () => {
  it('handles manual, lapse-cluster, and low-stability triggers', () => {
    const manual: any = {
      fsrs: { state: 'review', stability: 10, due: new Date(nowTs + 5000).toISOString(), reps: 4, lapses: 0, lastReview: new Date(nowTs).toISOString() },
      reviewLog: []
    };
    expect(evaluateRelearningTriggers(manual, nowTs, { manual: true })).toBe(true);
    expect(manual.fsrs.state).toBe('relearning');
    expect(manual.lifecycleStage).toBe('relearning');

    const lapseCluster: any = {
      fsrs: { state: 'review', stability: 10, due: new Date(nowTs + 5000).toISOString(), reps: 4, lapses: 0, lastReview: new Date(nowTs).toISOString() },
      reviewLog: [
        { at: nowTs - 1_000, rating: 1 },
        { at: nowTs - 2_000, rating: 1 },
        { at: nowTs - 3_000, rating: 1 }
      ]
    };
    expect(evaluateRelearningTriggers(lapseCluster, nowTs)).toBe(true);
    expect(lapseCluster.fsrs.state).toBe('relearning');

    const lowStability: any = {
      fsrs: { state: 'review', stability: 2.5, due: new Date(nowTs + 5000).toISOString(), reps: 4, lapses: 0, lastReview: new Date(nowTs).toISOString() },
      reviewLog: []
    };
    expect(evaluateRelearningTriggers(lowStability, nowTs)).toBe(true);
    expect(lowStability.fsrs.state).toBe('relearning');
  });
});

describe('run-1 JOL calibration', () => {
  it('maps ratings to actual scale and caps history at 20 FIFO', () => {
    const item: any = { id: 'j1', jolHistory: [] };
    for (let i = 0; i < 22; i++) {
      const rating = ((i % 4) + 1) as 1 | 2 | 3 | 4;
      recordJol(item, 50, rating, nowTs + i);
    }
    expect(item.jolHistory).toHaveLength(20);
    expect(item.jolHistory[0].actual).toBe(67);
    expect(item.jolHistory[item.jolHistory.length - 1].actual).toBe(33);
  });

  it('computes mean absolute delta for current session only', () => {
    (globalThis as any).__studyEngineSessionFlow = {
      ...(globalThis as any).__studyEngineSessionFlow,
      getSession: () => ({ startedAt: nowTs })
    };
    const items: any[] = [
      { id: 'a', jolHistory: [
        { ts: new Date(nowTs - 1000).toISOString(), predicted: 50, actual: 0, delta: 50, cardId: 'a' },
        { ts: new Date(nowTs + 1000).toISOString(), predicted: 50, actual: 67, delta: -17, cardId: 'a' }
      ] },
      { id: 'b', jolHistory: [{ ts: new Date(nowTs + 2000).toISOString(), predicted: 80, actual: 33, delta: 47, cardId: 'b' }] }
    ];
    expect(computeSessionCalibration(items as any)).toBe(32);
  });
});

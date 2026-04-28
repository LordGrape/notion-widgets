import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyLearnStatusMigration, classifyComplexCards, deriveLifecycleStage, pickProbeCard, runRelearningBurst, streamLearnPlan, substringVerified } from './learn-mode';

describe('substringVerified', () => {
  it('keeps segments with valid grounding snippets', () => {
    const items: any[] = [
      { id: 'a', prompt: 'Define opportunity cost', modelAnswer: 'Opportunity cost is the value of the next best alternative.' }
    ];
    const segments: any[] = [
      {
        id: 'seg-1',
        title: 'Opportunity cost',
        mechanism: 'worked_example',
        objective: 'Understand opportunity cost',
        tutorPrompt: 'Explain it',
        expectedAnswer: '...',
        linkedCardIds: ['a'],
        groundingSnippets: [{ cardId: 'a', quote: 'value of the next best alternative' }]
      }
    ];

    const verified = substringVerified(segments, items as any);
    expect(verified).toHaveLength(1);
  });

  it('rejects segments with non-substring grounding', () => {
    const items: any[] = [
      { id: 'a', prompt: 'Define opportunity cost', modelAnswer: 'Opportunity cost is the value of the next best alternative.' }
    ];
    const segments: any[] = [
      {
        id: 'seg-2',
        title: 'Bad grounding',
        mechanism: 'worked_example',
        objective: 'x',
        tutorPrompt: 'x',
        expectedAnswer: 'x',
        linkedCardIds: ['a'],
        groundingSnippets: [{ cardId: 'a', quote: 'completely unrelated quote text' }]
      }
    ];

    const verified = substringVerified(segments, items as any);
    expect(verified).toHaveLength(0);
  });
});

describe('run-1 helper selection', () => {
  it('pickProbeCard uses median model-answer length and null for <= 5 cards', () => {
    const tiny = Array.from({ length: 5 }).map((_, i) => ({ id: `t-${i}`, prompt: 'p', modelAnswer: 'one two' }));
    expect(pickProbeCard(tiny as any)).toBeNull();

    const cards = [
      { id: 'a', prompt: 'p', modelAnswer: '1 2 3 4 5 6 7 8 9 10' },
      { id: 'b', prompt: 'p', modelAnswer: '1 2 3' },
      { id: 'c', prompt: 'p', modelAnswer: '1 2 3 4 5 6' },
      { id: 'd', prompt: 'p', modelAnswer: '1 2 3 4' },
      { id: 'e', prompt: 'p', modelAnswer: '1 2 3 4 5' },
      { id: 'f', prompt: 'p', modelAnswer: '1 2' }
    ];
    expect(pickProbeCard(cards as any)?.id).toBe('e');
  });

  it('classifyComplexCards supports word-count and source metadata depth', () => {
    const fiftyWords = Array.from({ length: 50 }).map((_, i) => `w${i}`).join(' ');
    const fiftyOneWords = `${fiftyWords} extra`;
    const ids = classifyComplexCards([
      { id: 'a', prompt: 'p', modelAnswer: fiftyWords },
      { id: 'b', prompt: 'p', modelAnswer: fiftyOneWords },
      { id: 'c', prompt: 'p', modelAnswer: 'short', sourceMeta: { qec: { eDepth: 3 } } as any },
      { id: 'd', prompt: 'p', modelAnswer: 'short' }
    ] as any);
    expect(ids).toEqual(['b', 'c']);
  });
});

describe('deriveLifecycleStage', () => {
  const mkItem = (overrides: Record<string, unknown> = {}): any => ({
    id: 'card-1',
    prompt: 'p',
    modelAnswer: 'a',
    fsrs: {
      difficulty: 5,
      stability: 0,
      due: new Date().toISOString(),
      reps: 0,
      lapses: 0,
      lastReview: null,
      state: 'new'
    },
    created: new Date().toISOString(),
    ...overrides
  });

  it('derives all six lifecycle stages', () => {
    expect(deriveLifecycleStage(mkItem({ archived: true, suspended: true }))).toBe('retired');
    expect(deriveLifecycleStage(mkItem({ fsrs: { state: 'relearning' } }))).toBe('relearning');
    expect(deriveLifecycleStage(mkItem({ learnStatus: 'consolidated', fsrs: { state: 'review' } }))).toBe('maintaining');
    expect(deriveLifecycleStage(mkItem({ learnStatus: 'taught' }))).toBe('consolidating');
    expect(deriveLifecycleStage(mkItem({ learnStatus: 'unlearned' }))).toBe('encoding');
    expect(deriveLifecycleStage(mkItem({ learnStatus: null, fsrs: { lastReview: null } }))).toBe('new');
  });
});

describe('applyLearnStatusMigration', () => {
  it('writes lifecycle stage for each item and is idempotent', () => {
    const nowIso = new Date().toISOString();
    const items: Record<string, any> = {
      newCard: {
        id: 'newCard',
        prompt: 'p',
        modelAnswer: 'a',
        created: nowIso,
        fsrs: { difficulty: 0, stability: 0, due: nowIso, reps: 0, lapses: 0, lastReview: null, state: 'new' }
      },
      retired: {
        id: 'retired',
        prompt: 'p',
        modelAnswer: 'a',
        created: nowIso,
        archived: true,
        suspended: true,
        fsrs: { difficulty: 0, stability: 0, due: nowIso, reps: 0, lapses: 0, lastReview: null, state: 'new' }
      },
      maintaining: {
        id: 'maintaining',
        prompt: 'p',
        modelAnswer: 'a',
        created: nowIso,
        fsrs: { difficulty: 0, stability: 10, due: nowIso, reps: 5, lapses: 0, lastReview: nowIso, state: 'review' }
      }
    };

    applyLearnStatusMigration(items);
    expect(items.newCard.lifecycleStage).toBe('new');
    expect(items.retired.lifecycleStage).toBe('retired');
    expect(items.maintaining.lifecycleStage).toBe('maintaining');

    const firstHash = JSON.stringify(items);
    applyLearnStatusMigration(items);
    const secondHash = JSON.stringify(items);
    expect(secondHash).toBe(firstHash);
  });
});


afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runRelearningBurst', () => {
  it('calls learn-turn exactly once with segmentLimit: 1', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        ok: true,
        verdict: 'deep',
        understandingScore: 95,
        copyRatio: 0.1,
        missingConcepts: [],
        feedback: 'Great',
        followUp: null,
        advance: true
      })
    }));
    vi.stubGlobal('fetch', fetchMock);
    await runRelearningBurst({
      id: 'c1',
      prompt: 'Q?',
      modelAnswer: 'A',
      created: new Date().toISOString(),
      fsrs: { difficulty: 0, stability: 0, due: new Date().toISOString(), reps: 0, lapses: 0, lastReview: null, state: 'new' }
    } as any);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = (fetchMock.mock.calls as any[]);
    const requestInit = calls[0][1] as any;
    const payload = JSON.parse(requestInit.body);
    expect(payload.segmentLimit).toBe(1);
  });
});

describe('plan profile request wiring', () => {
  it('sends theory by default and factual when sub-deck default is set', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      body: null,
      text: async () => JSON.stringify({
        segments: [
          { id: 's1', title: 'T1', mechanism: 'worked_example', objective: 'o', teach: 'teach text one', tutorPrompt: 'tp', expectedAnswer: 'ea', linkedCardIds: ['c1'], groundingSnippets: [{ cardId: 'c1', quote: 'alpha beta gamma delta epsilon zeta eta theta iota kappa' }] },
          { id: 's2', title: 'T2', mechanism: 'worked_example', objective: 'o', teach: 'teach text two', tutorPrompt: 'tp', expectedAnswer: 'ea', linkedCardIds: ['c1'], groundingSnippets: [{ cardId: 'c1', quote: 'alpha beta gamma delta epsilon zeta eta theta iota kappa' }] }
        ],
        consolidationQuestions: []
      })
    }));
    vi.stubGlobal('fetch', fetchMock);

    const baseItem: any = {
      id: 'c1',
      prompt: 'P',
      modelAnswer: 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu',
      course: 'History',
      subDeck: 'sd-1',
      created: new Date().toISOString(),
      fsrs: { difficulty: 0, stability: 0, due: new Date().toISOString(), reps: 0, lapses: 0, lastReview: null, state: 'new' }
    };
    const stateDefault: any = { courses: { History: { name: 'History' } }, subDecks: { History: { 'sd-1': { name: 'SD', order: 0, created: Date.now() } } }, studyEngineFeatures: { run3Profiles: true } };
    await streamLearnPlan('History', 'sd-1', [baseItem], stateDefault, '', '', {}, undefined);
    let reqBody = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(reqBody.planProfile).toBe('theory');

    fetchMock.mockClear();
    const stateFactual: any = { courses: { History: { name: 'History' } }, subDecks: { History: { 'sd-1': { name: 'SD', order: 0, created: Date.now(), planProfile: 'factual' } } }, studyEngineFeatures: { run3Profiles: true } };
    await streamLearnPlan('History', 'sd-1', [baseItem], stateFactual, '', '', {}, undefined);
    reqBody = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(reqBody.planProfile).toBe('factual');
  });

  it('exposes resolveSessionPlanProfile on the bridge', () => {
    expect(typeof (globalThis as any).__studyEngineLearnMode.resolveSessionPlanProfile).toBe('function');
  });

  it('sends learner model hint when run6Adaptive is enabled', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      body: null,
      text: async () => JSON.stringify({
        segments: [
          { id: 's1', title: 'T1', mechanism: 'worked_example', objective: 'o', teach: 'teach text one', tutorPrompt: 'tp', expectedAnswer: 'ea', linkedCardIds: ['c1'], groundingSnippets: [{ cardId: 'c1', quote: 'alpha beta gamma delta epsilon zeta eta theta iota kappa' }] },
          { id: 's2', title: 'T2', mechanism: 'worked_example', objective: 'o', teach: 'teach text two', tutorPrompt: 'tp', expectedAnswer: 'ea', linkedCardIds: ['c1'], groundingSnippets: [{ cardId: 'c1', quote: 'alpha beta gamma delta epsilon zeta eta theta iota kappa' }] }
        ],
        consolidationQuestions: []
      })
    }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => null });
    const baseItem: any = { id: 'c1', prompt: 'P', modelAnswer: 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu', course: 'History', subDeck: 'sd-1', created: new Date().toISOString(), fsrs: { difficulty: 0, stability: 0, due: new Date().toISOString(), reps: 0, lapses: 0, lastReview: null, state: 'new' } };
    const enabledState: any = { courses: { History: { name: 'History' } }, subDecks: { History: { 'sd-1': { name: 'SD', order: 0, created: Date.now() } } }, studyEngineFeatures: { run3Profiles: true, run6Adaptive: true } };
    await streamLearnPlan('History', 'sd-1', [baseItem], enabledState, '', '', {}, undefined);
    const reqBody = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(reqBody.learnerModelHint).toBeTruthy();
    expect(reqBody.learnerModelFingerprint).toBeTruthy();
  });

  it('omits learner model hint when run6Adaptive is disabled', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      body: null,
      text: async () => JSON.stringify({
        segments: [
          { id: 's1', title: 'T1', mechanism: 'worked_example', objective: 'o', teach: 'teach text one', tutorPrompt: 'tp', expectedAnswer: 'ea', linkedCardIds: ['c1'], groundingSnippets: [{ cardId: 'c1', quote: 'alpha beta gamma delta epsilon zeta eta theta iota kappa' }] },
          { id: 's2', title: 'T2', mechanism: 'worked_example', objective: 'o', teach: 'teach text two', tutorPrompt: 'tp', expectedAnswer: 'ea', linkedCardIds: ['c1'], groundingSnippets: [{ cardId: 'c1', quote: 'alpha beta gamma delta epsilon zeta eta theta iota kappa' }] }
        ],
        consolidationQuestions: []
      })
    }));
    vi.stubGlobal('fetch', fetchMock);
    const baseItem: any = { id: 'c1', prompt: 'P', modelAnswer: 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu', course: 'History', subDeck: 'sd-1', created: new Date().toISOString(), fsrs: { difficulty: 0, stability: 0, due: new Date().toISOString(), reps: 0, lapses: 0, lastReview: null, state: 'new' } };
    const disabledState: any = { courses: { History: { name: 'History' } }, subDecks: { History: { 'sd-1': { name: 'SD', order: 0, created: Date.now() } } }, studyEngineFeatures: { run3Profiles: true, run6Adaptive: false } };
    await streamLearnPlan('History', 'sd-1', [baseItem], disabledState, '', '', {}, undefined);
    const reqBody = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(reqBody.learnerModelHint).toBeUndefined();
    expect(reqBody.learnerModelFingerprint).toBeUndefined();
  });

  it('times out stalled streaming generation and reports fallback', async () => {
    vi.useFakeTimers();
    let canceled = false;
    let resolveRead: ((v: { done: boolean; value?: Uint8Array }) => void) | null = null;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'text/event-stream' },
      body: {
        getReader: () => ({
          read: () => new Promise((resolve) => { resolveRead = resolve; }),
          cancel: async () => {
            canceled = true;
            if (resolveRead) resolveRead({ done: true });
          },
          releaseLock: () => undefined
        })
      }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const errors: Array<{ message: string; hasSegments: boolean }> = [];
    const baseItem: any = {
      id: 'c1',
      prompt: 'P',
      modelAnswer: 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu',
      course: 'History',
      subDeck: 'sd-1',
      created: new Date().toISOString(),
      fsrs: { difficulty: 0, stability: 0, due: new Date().toISOString(), reps: 0, lapses: 0, lastReview: null, state: 'new' }
    };
    const stateDefault: any = {
      courses: { History: { name: 'History' } },
      subDecks: { History: { 'sd-1': { name: 'SD', order: 0, created: Date.now() } } },
      studyEngineFeatures: { run3Profiles: true }
    };

    const promise = streamLearnPlan('History', 'sd-1', [baseItem], stateDefault, '', '', {
      onError: (message, opts) => errors.push({ message, hasSegments: !!opts?.hasSegments })
    }, undefined);
    await vi.advanceTimersByTimeAsync(15_100);
    await promise;

    // B4-2: stalled streams should timeout and unblock the UI path.
    expect(canceled).toBe(true);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('timed out');
    expect(errors[0].hasSegments).toBe(false);
    vi.useRealTimers();
  });
});

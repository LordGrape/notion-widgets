import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockBuildSessionQueue,
  mockStartSession,
  mockGetCardsInScope,
  mockResolveCourseLearnEntry
} = vi.hoisted(() => ({
  mockBuildSessionQueue: vi.fn(),
  mockStartSession: vi.fn(),
  mockGetCardsInScope: vi.fn(),
  mockResolveCourseLearnEntry: vi.fn()
}));

vi.mock('./session-flow', () => ({
  buildSessionQueue: mockBuildSessionQueue,
  startSession: mockStartSession
}));

vi.mock('./sub-decks', () => ({
  getCardsInScope: mockGetCardsInScope
}));

vi.mock('./learn-mode', () => ({
  resolveCourseLearnEntry: mockResolveCourseLearnEntry
}));

import { startStudySession, summarizeAllCaughtUp } from './study-flow';

describe('startStudySession', () => {
  beforeEach(() => {
    mockBuildSessionQueue.mockReset();
    mockStartSession.mockReset();
    mockGetCardsInScope.mockReset();
    mockResolveCourseLearnEntry.mockReset();
    (globalThis as any).__studyEngineStudyFlow = {
      state: { items: {} },
      startReviewSession: vi.fn((_scope: any, onComplete?: () => void) => onComplete?.()),
      startLearnSessionForScope: vi.fn(),
      showAllCaughtUp: vi.fn()
    };
  });

  it('handles review-only scope', async () => {
    mockGetCardsInScope.mockReturnValue([{ id: 'r1', lifecycleStage: 'maintaining' }]);
    mockBuildSessionQueue.mockReturnValue([{ id: 'r1', lifecycleStage: 'maintaining' }]);
    mockResolveCourseLearnEntry.mockReturnValue({ kind: 'single', subDeckKey: 'sd-1' });

    await startStudySession({ course: 'Bio' });

    expect((globalThis as any).__studyEngineStudyFlow.startReviewSession).toHaveBeenCalledOnce();
    expect((globalThis as any).__studyEngineStudyFlow.startLearnSessionForScope).not.toHaveBeenCalled();
  });

  it('handles learn-only scope', async () => {
    mockGetCardsInScope.mockReturnValue([{ id: 'l1', learnStatus: 'unlearned', lifecycleStage: 'encoding' }]);
    mockBuildSessionQueue.mockReturnValue([]);
    mockResolveCourseLearnEntry.mockReturnValue({ kind: 'single', subDeckKey: 'sd-1' });

    await startStudySession({ course: 'Bio' });

    expect((globalThis as any).__studyEngineStudyFlow.startLearnSessionForScope).toHaveBeenCalledOnce();
    expect((globalThis as any).__studyEngineStudyFlow.startReviewSession).not.toHaveBeenCalled();
  });

  it('runs review before learn when both are available', async () => {
    mockGetCardsInScope.mockReturnValue([
      { id: 'r1', lifecycleStage: 'maintaining' },
      { id: 'l1', learnStatus: 'unlearned', lifecycleStage: 'encoding' }
    ]);
    mockBuildSessionQueue.mockReturnValue([{ id: 'r1', lifecycleStage: 'maintaining' }]);
    mockResolveCourseLearnEntry.mockReturnValue({ kind: 'single', subDeckKey: 'sd-1' });

    await startStudySession({ course: 'Bio' });

    const reviewCallOrder = (globalThis as any).__studyEngineStudyFlow.startReviewSession.mock.invocationCallOrder[0];
    const learnCallOrder = (globalThis as any).__studyEngineStudyFlow.startLearnSessionForScope.mock.invocationCallOrder[0];
    expect(reviewCallOrder).toBeLessThan(learnCallOrder);
  });

  it('shows all caught up for empty scope', async () => {
    mockGetCardsInScope.mockReturnValue([]);
    mockBuildSessionQueue.mockReturnValue([]);
    mockResolveCourseLearnEntry.mockReturnValue({ kind: 'empty-prompt' });

    await startStudySession({ course: 'Bio' });

    expect((globalThis as any).__studyEngineStudyFlow.showAllCaughtUp).toHaveBeenCalledOnce();
  });
});

describe('summarizeAllCaughtUp', () => {
  it('reports next due time when all cards are already reviewed', () => {
    const now = Date.UTC(2026, 0, 1, 0, 0, 0);
    const msg = summarizeAllCaughtUp([
      { id: 'a', fsrs: { lastReview: new Date(now - 1000).toISOString(), due: new Date(now + 24 * 60 * 60 * 1000).toISOString() } },
      { id: 'b', fsrs: { lastReview: new Date(now - 1000).toISOString(), due: new Date(now + 36 * 60 * 60 * 1000).toISOString() } }
    ] as any, now);

    // B3: avoid ambiguous "All caught up" on newly-rated decks.
    expect(msg).toBe('All 2 cards reviewed. Next due in ~24h.');
  });
});

import { describe, expect, it } from 'vitest';
import {
  createLearnFlow,
  markSegmentEntered,
  markTurnSubmitted,
  markTurnContinuation,
  markSessionCompleted,
  markAbandoned,
  computeLearnMasteryProjection,
  getLearnTelemetrySummary,
  submitConsolidationRating,
  enterConsolidation
} from './learn-flow';
import type { ConsolidationQuestion, LearnPlan } from './learn-mode';

/**
 * Phase B telemetry action tests. These verify the pure actions that
 * capture time-to-submit, turn counts, and abandonment phase. They do
 * NOT verify that any of these fields influence FSRS scheduling; that
 * isolation is a contractual invariant and is tested indirectly by the
 * existing applyLearnHandoff / getFsrsHandoffPlan tests (which do not
 * read telemetry fields).
 */

function planWith(segIds: string[]): LearnPlan {
  return {
    segments: segIds.map((id) => ({
      id,
      title: id,
      mechanism: 'worked_example',
      objective: 'x',
      teach: 'x',
      tutorPrompt: 'x',
      expectedAnswer: 'x',
      linkedCardIds: [],
      groundingSnippets: []
    })),
    consolidationQuestions: []
  };
}

/**
 * Builds a plan where each segment is linked to exactly one card; card ids
 * are deterministic (`c-${segmentId}`). Consolidation questions each link
 * to a single segment's card, so ratings map one-to-one.
 */
function planWithCards(segIds: string[], qLinks: string[][] = []): LearnPlan {
  const segments = segIds.map((id) => ({
    id,
    title: id,
    mechanism: 'worked_example' as const,
    objective: 'x',
    teach: 'x',
    tutorPrompt: 'x',
    expectedAnswer: 'x',
    linkedCardIds: [`c-${id}`],
    groundingSnippets: []
  }));
  const consolidationQuestions: ConsolidationQuestion[] = qLinks.map((cardIds, i) => ({
    question: `q${i}`,
    answer: `a${i}`,
    linkedCardIds: cardIds
  }));
  return { segments, consolidationQuestions };
}

/**
 * Seed a flow that has completed all listed segments (so their linked cards
 * become "covered") and entered consolidation with the given questions.
 */
function completedFlowWithRatings(segIds: string[], qLinks: string[][], ratings: Array<1 | 2 | 3 | 4 | undefined>) {
  let flow = createLearnFlow(planWithCards(segIds, qLinks), 'c', 'sd');
  flow = { ...flow, completedSegmentIds: segIds.slice() };
  flow = enterConsolidation(flow, flow.consolidationQuestions);
  ratings.forEach((r, idx) => {
    if (r != null) flow = submitConsolidationRating(flow, idx, r);
  });
  return flow;
}

describe('Phase B telemetry: factory seeds', () => {
  it('createLearnFlow seeds telemetry fields to empty/zero', () => {
    const flow = createLearnFlow(planWith(['s1']), 'Course', 'sub');
    expect(flow.turnTimings).toEqual([]);
    expect(flow.segmentEnteredAt).toEqual({});
    expect(flow.totalTurnsPerSegment).toEqual({});
    expect(flow.completedAt).toBeUndefined();
    expect(flow.abandonmentPhase).toBeUndefined();
  });
});

describe('Phase B telemetry: markSegmentEntered', () => {
  it('opens turnIndex=0 timing and stamps segmentEnteredAt', () => {
    const flow0 = createLearnFlow(planWith(['s1', 's2']), 'c', 'sd');
    const flow1 = markSegmentEntered(flow0, 's1', 1000);
    expect(flow1.segmentEnteredAt['s1']).toBe(1000);
    expect(flow1.turnTimings).toEqual([{ segmentId: 's1', turnIndex: 0, enteredAt: 1000 }]);
  });

  it('is idempotent on repeat entry for the same segment', () => {
    const flow0 = createLearnFlow(planWith(['s1']), 'c', 'sd');
    const flow1 = markSegmentEntered(flow0, 's1', 1000);
    const flow2 = markSegmentEntered(flow1, 's1', 2000);
    expect(flow2).toBe(flow1);
    expect(flow2.segmentEnteredAt['s1']).toBe(1000);
    expect(flow2.turnTimings.length).toBe(1);
  });

  it('opens a separate entry for each distinct segment', () => {
    const flow0 = createLearnFlow(planWith(['s1', 's2']), 'c', 'sd');
    const flow1 = markSegmentEntered(flow0, 's1', 1000);
    const flow2 = markSegmentEntered(flow1, 's2', 2500);
    expect(flow2.segmentEnteredAt).toEqual({ s1: 1000, s2: 2500 });
    expect(flow2.turnTimings.map((t) => t.segmentId)).toEqual(['s1', 's2']);
  });
});

describe('markSegmentEntered cross-render idempotency', () => {
  it('keeps first-entry timestamp and does not seed new turns on re-renders', () => {
    let flow = createLearnFlow(planWith(['s1']), 'c', 'sd');
    const segmentId = 's1';

    flow = markSegmentEntered(flow, segmentId, 1000);
    expect(flow.segmentEnteredAt[segmentId]).toBe(1000);
    expect(flow.turnTimings.length).toBe(1);
    expect(flow.turnTimings[0].turnIndex).toBe(0);
    expect(flow.turnTimings[0].submittedAt).toBeUndefined();

    flow = markSegmentEntered(flow, segmentId, 2000);
    expect(flow.segmentEnteredAt[segmentId]).toBe(1000);
    expect(flow.turnTimings.length).toBe(1);
    expect(flow.turnTimings[0].turnIndex).toBe(0);
    expect(flow.turnTimings[0].submittedAt).toBeUndefined();

    flow = markTurnSubmitted(flow, segmentId, 42, 3000);
    flow = markSegmentEntered(flow, segmentId, 4000);
    // Invariant: markSegmentEntered is strictly first-entry-only; re-renders never open continuation turns.
    expect(flow.turnTimings.length).toBe(1);
    expect(flow.turnTimings[0].turnIndex).toBe(0);
    expect(flow.turnTimings[0].submittedAt).toBe(3000);
  });
});

describe('Phase B telemetry: markTurnSubmitted', () => {
  it('closes the most recent open turn for the segment and increments count', () => {
    let flow = createLearnFlow(planWith(['s1']), 'c', 'sd');
    flow = markSegmentEntered(flow, 's1', 1000);
    flow = markTurnSubmitted(flow, 's1', 42, 3000);
    expect(flow.turnTimings[0].submittedAt).toBe(3000);
    expect(flow.turnTimings[0].turnResponseCharCount).toBe(42);
    expect(flow.totalTurnsPerSegment['s1']).toBe(1);
  });

  it('does not close an already-closed turn; only bumps counter defensively', () => {
    let flow = createLearnFlow(planWith(['s1']), 'c', 'sd');
    flow = markSegmentEntered(flow, 's1', 1000);
    flow = markTurnSubmitted(flow, 's1', 10, 2000);
    flow = markTurnSubmitted(flow, 's1', 20, 3000);
    // First turn stays closed at its original submittedAt; counter still ticks.
    expect(flow.turnTimings[0].submittedAt).toBe(2000);
    expect(flow.turnTimings[0].turnResponseCharCount).toBe(10);
    expect(flow.totalTurnsPerSegment['s1']).toBe(2);
  });
});

describe('Phase B telemetry: markTurnContinuation', () => {
  it('opens turnIndex+1 after a submitted turn', () => {
    let flow = createLearnFlow(planWith(['s1']), 'c', 'sd');
    flow = markSegmentEntered(flow, 's1', 1000);
    flow = markTurnSubmitted(flow, 's1', 25, 2000);
    flow = markTurnContinuation(flow, 's1', 2500);
    expect(flow.turnTimings).toHaveLength(2);
    expect(flow.turnTimings[1]).toEqual({ segmentId: 's1', turnIndex: 1, enteredAt: 2500 });
  });

  it('computes turnIndex independently per segment', () => {
    let flow = createLearnFlow(planWith(['s1', 's2']), 'c', 'sd');
    flow = markSegmentEntered(flow, 's1', 1000);
    flow = markTurnSubmitted(flow, 's1', 5, 1500);
    flow = markTurnContinuation(flow, 's1', 1600);
    flow = markSegmentEntered(flow, 's2', 2000);
    flow = markTurnContinuation(flow, 's2', 2100);
    const s1Timings = flow.turnTimings.filter((t) => t.segmentId === 's1');
    const s2Timings = flow.turnTimings.filter((t) => t.segmentId === 's2');
    expect(s1Timings.map((t) => t.turnIndex)).toEqual([0, 1]);
    expect(s2Timings.map((t) => t.turnIndex)).toEqual([0, 1]);
  });
});

describe('markTurnContinuation after parked-turn flush', () => {
  it('opens the next turn on flush and preserves per-segment counters across segment advance', () => {
    let flow = createLearnFlow(planWith(['s1', 's2']), 'c', 'sd');
    const seg0 = 's1';
    const seg1 = 's2';

    flow = markSegmentEntered(flow, seg0, 1000);
    flow = markTurnSubmitted(flow, seg0, 30, 2000);
    flow = markTurnContinuation(flow, seg0, 3000);

    let seg0Timings = flow.turnTimings.filter((t) => t.segmentId === seg0);
    expect(seg0Timings).toHaveLength(2);
    expect(seg0Timings[1].turnIndex).toBe(1);
    expect(seg0Timings[1].enteredAt).toBe(3000);
    expect(seg0Timings[1].submittedAt).toBeUndefined();

    flow = markTurnSubmitted(flow, seg0, 25, 4000);
    flow = markSegmentEntered(flow, seg1, 5000);

    seg0Timings = flow.turnTimings.filter((t) => t.segmentId === seg0);
    const seg1Timings = flow.turnTimings.filter((t) => t.segmentId === seg1);
    expect(seg0Timings).toHaveLength(2);
    expect(seg0Timings.every((t) => t.submittedAt != null)).toBe(true);
    expect(seg1Timings).toHaveLength(1);
    expect(flow.totalTurnsPerSegment[seg0]).toBe(2);
    expect(flow.totalTurnsPerSegment[seg1]).toBe(0);
  });
});

describe('Phase B telemetry: session finalization', () => {
  it('markSessionCompleted stamps completedAt and is idempotent', () => {
    const flow0 = createLearnFlow(planWith(['s1']), 'c', 'sd');
    const flow1 = markSessionCompleted(flow0, 5000);
    expect(flow1.completedAt).toBe(5000);
    const flow2 = markSessionCompleted(flow1, 9000);
    expect(flow2).toBe(flow1);
    expect(flow2.completedAt).toBe(5000);
  });

  it('markAbandoned stamps abandonmentPhase + completedAt and is idempotent', () => {
    const flow0 = createLearnFlow(planWith(['s1']), 'c', 'sd');
    const flow1 = markAbandoned(flow0, 'tutor', 4000);
    expect(flow1.abandonmentPhase).toBe('tutor');
    expect(flow1.completedAt).toBe(4000);
    const flow2 = markAbandoned(flow1, 'consolidating', 7000);
    expect(flow2).toBe(flow1);
  });

  it('markAbandoned is a no-op after markSessionCompleted', () => {
    const flow0 = createLearnFlow(planWith(['s1']), 'c', 'sd');
    const flow1 = markSessionCompleted(flow0, 3000);
    const flow2 = markAbandoned(flow1, 'tutor', 5000);
    expect(flow2).toBe(flow1);
    expect(flow2.abandonmentPhase).toBeUndefined();
  });

  it('markSessionCompleted is a no-op after markAbandoned', () => {
    const flow0 = createLearnFlow(planWith(['s1']), 'c', 'sd');
    const flow1 = markAbandoned(flow0, 'streaming', 3000);
    const flow2 = markSessionCompleted(flow1, 5000);
    expect(flow2.completedAt).toBe(3000); // Abandonment timestamp preserved.
    expect(flow2.abandonmentPhase).toBe('streaming');
  });
});

describe('Phase C: computeLearnMasteryProjection', () => {
  it('returns zero counts when nothing is covered', () => {
    const flow = createLearnFlow(planWithCards(['s1', 's2']), 'c', 'sd');
    const proj = computeLearnMasteryProjection(flow);
    expect(proj.coveredCards).toBe(0);
    expect(proj.consolidatedCards).toBe(0);
    expect(proj.taughtCards).toBe(0);
    expect(proj.masteryScore).toBe(0);
    expect(proj.ratingsBreakdown).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 });
  });

  it('treats covered-but-unrated cards as taught at weight 0.25', () => {
    const flow = completedFlowWithRatings(['s1', 's2'], [], []);
    const proj = computeLearnMasteryProjection(flow);
    expect(proj.coveredCards).toBe(2);
    expect(proj.taughtCards).toBe(2);
    expect(proj.consolidatedCards).toBe(0);
    expect(proj.masteryScore).toBeCloseTo(0.25, 6);
  });

  it('computes per-rating breakdown and weighted mean for consolidated cards', () => {
    // s1 rated 4, s2 rated 3, s3 rated 1.
    const flow = completedFlowWithRatings(
      ['s1', 's2', 's3'],
      [['c-s1'], ['c-s2'], ['c-s3']],
      [4, 3, 1]
    );
    const proj = computeLearnMasteryProjection(flow);
    expect(proj.coveredCards).toBe(3);
    expect(proj.consolidatedCards).toBe(3);
    expect(proj.taughtCards).toBe(0);
    expect(proj.ratingsBreakdown).toEqual({ 1: 1, 2: 0, 3: 1, 4: 1 });
    // (1.0 + 0.75 + 0.25) / 3 = 2.0 / 3 ~= 0.6667
    expect(proj.masteryScore).toBeCloseTo((1.0 + 0.75 + 0.25) / 3, 6);
  });

  it('all-Easy ratings yield masteryScore = 1.0', () => {
    const flow = completedFlowWithRatings(
      ['s1', 's2'],
      [['c-s1'], ['c-s2']],
      [4, 4]
    );
    const proj = computeLearnMasteryProjection(flow);
    expect(proj.masteryScore).toBe(1);
  });

  it('mixed covered: some rated, some not', () => {
    // s1 rated 4, s2 completed but unrated (taught).
    const flow = completedFlowWithRatings(
      ['s1', 's2'],
      [['c-s1']], // only one consolidation question, for s1
      [4]
    );
    const proj = computeLearnMasteryProjection(flow);
    expect(proj.coveredCards).toBe(2);
    expect(proj.consolidatedCards).toBe(1);
    expect(proj.taughtCards).toBe(1);
    // (1.0 + 0.25) / 2 = 0.625
    expect(proj.masteryScore).toBeCloseTo(0.625, 6);
  });
});

describe('Phase C: getLearnTelemetrySummary', () => {
  it('returns safe zero/null defaults for a fresh flow', () => {
    const flow = createLearnFlow(planWith(['s1', 's2']), 'c', 'sd');
    const s = getLearnTelemetrySummary(flow);
    expect(s.totalSegments).toBe(2);
    expect(s.completedSegments).toBe(0);
    expect(s.totalTurns).toBe(0);
    expect(s.avgTurnsPerCompletedSegment).toBeNull();
    expect(s.avgTimePerTurnMs).toBeNull();
    expect(s.completedAt).toBeNull();
    expect(s.abandonmentPhase).toBeNull();
  });

  it('aggregates turn counts and average turn duration across segments', () => {
    let flow = createLearnFlow(planWith(['s1', 's2']), 'c', 'sd');
    flow = markSegmentEntered(flow, 's1', 1000);
    flow = markTurnSubmitted(flow, 's1', 10, 1800); // 800 ms
    flow = markTurnContinuation(flow, 's1', 2000);
    flow = markTurnSubmitted(flow, 's1', 20, 3200); // 1200 ms
    flow = { ...flow, completedSegmentIds: ['s1'] };
    flow = markSegmentEntered(flow, 's2', 4000);
    flow = markTurnSubmitted(flow, 's2', 30, 4400); // 400 ms
    flow = { ...flow, completedSegmentIds: ['s1', 's2'] };

    const s = getLearnTelemetrySummary(flow);
    expect(s.totalTurns).toBe(3);
    expect(s.completedSegments).toBe(2);
    expect(s.avgTurnsPerCompletedSegment).toBe(1.5);
    // Mean of 800, 1200, 400 = 800
    expect(s.avgTimePerTurnMs).toBe(800);
  });

  it('elapsedMs uses completedAt when available', () => {
    const iso = new Date(5000).toISOString();
    let flow = createLearnFlow(planWith(['s1']), 'c', 'sd');
    flow = { ...flow, startedAt: iso };
    flow = markSessionCompleted(flow, 7500);
    const s = getLearnTelemetrySummary(flow);
    expect(s.completedAt).toBe(7500);
    expect(s.startedAt).toBe(5000);
    expect(s.elapsedMs).toBe(2500);
  });

  it('elapsedMs falls back to now when session still active', () => {
    const iso = new Date(1000).toISOString();
    let flow = createLearnFlow(planWith(['s1']), 'c', 'sd');
    flow = { ...flow, startedAt: iso };
    const s = getLearnTelemetrySummary(flow, 4500);
    expect(s.completedAt).toBeNull();
    expect(s.elapsedMs).toBe(3500);
  });

  it('surfaces abandonmentPhase on abandoned sessions', () => {
    let flow = createLearnFlow(planWith(['s1']), 'c', 'sd');
    flow = markAbandoned(flow, 'tutor', 2000);
    const s = getLearnTelemetrySummary(flow);
    expect(s.abandonmentPhase).toBe('tutor');
    expect(s.completedAt).toBe(2000);
  });
});

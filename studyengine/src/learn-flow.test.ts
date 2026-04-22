import { describe, expect, it } from 'vitest';
import {
  createLearnFlow,
  markSegmentEntered,
  markTurnSubmitted,
  markTurnContinuation,
  markSessionCompleted,
  markAbandoned
} from './learn-flow';
import type { LearnPlan } from './learn-mode';

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

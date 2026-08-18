/**
 * Application layer (L2): Phase B telemetry actions and summary selector.
 * Split verbatim from src/learn-flow.ts in Phase V2c (2026-08-18).
 *
 * These capture wall-clock timing of the tutor-turn loop so future phases
 * can report time-to-submit and abandonment rates. They are deliberately
 * side-channel: `applyLearnHandoff` and `getFsrsHandoffPlan` do not read
 * any of these fields. All actions take an explicit `now: number` so the
 * function remains pure — callers inject `Date.now()` at the call site.
 *
 * Idempotency:
 *   - `markSegmentEntered` is a no-op if the segment already has a recorded
 *     entry timestamp. Firing on every render is safe.
 *   - `markSessionCompleted` is a no-op if `completedAt` is already set.
 *   - `markAbandoned` is a no-op if the session already has either
 *     `completedAt` or `abandonmentPhase` set. An abandoned session cannot
 *     later be flipped to completed or vice versa.
 */
import type { LearnAbandonmentPhase, LearnFlowState, LearnTelemetrySummary } from './types';

/**
 * Record first entry into a segment. Writes `segmentEnteredAt[segmentId]`
 * and opens a fresh `turnTimings` entry at `turnIndex=0`. No-op if the
 * segment has already been entered.
 */
export function markSegmentEntered(flow: LearnFlowState, segmentId: string, now: number): LearnFlowState {
  if (!flow || !segmentId) return flow;
  if (flow.segmentEnteredAt[segmentId] != null) return flow;
  const segmentEnteredAt = { ...flow.segmentEnteredAt, [segmentId]: now };
  const turnTimings = flow.turnTimings.concat([{ segmentId, turnIndex: 0, enteredAt: now }]);
  return { ...flow, segmentEnteredAt, turnTimings };
}

/**
 * Record a turn submission. Closes the most recent open (submittedAt-less)
 * timing entry for `segmentId` and increments `totalTurnsPerSegment`.
 * Safe to call even if no open entry exists (defensive — the counter still
 * increments so the submission is not lost).
 */
export function markTurnSubmitted(
  flow: LearnFlowState,
  segmentId: string,
  responseCharCount: number,
  now: number
): LearnFlowState {
  if (!flow || !segmentId) return flow;
  const turnTimings = flow.turnTimings.slice();
  for (let i = turnTimings.length - 1; i >= 0; i--) {
    const t = turnTimings[i];
    if (t.segmentId === segmentId && t.submittedAt == null) {
      turnTimings[i] = { ...t, submittedAt: now, turnResponseCharCount: responseCharCount };
      break;
    }
  }
  const prev = flow.totalTurnsPerSegment[segmentId] || 0;
  const totalTurnsPerSegment = { ...flow.totalTurnsPerSegment, [segmentId]: prev + 1 };
  return { ...flow, turnTimings, totalTurnsPerSegment };
}

/**
 * Open a new turn entry at `turnIndex+1` for a segment that just returned
 * `isSegmentComplete: false`. The previous entry for this segment should
 * already have `submittedAt` set via `markTurnSubmitted`.
 */
export function markTurnContinuation(flow: LearnFlowState, segmentId: string, now: number): LearnFlowState {
  if (!flow || !segmentId) return flow;
  let lastIndex = -1;
  for (const t of flow.turnTimings) {
    if (t.segmentId === segmentId && t.turnIndex > lastIndex) lastIndex = t.turnIndex;
  }
  const nextIndex = lastIndex + 1;
  const turnTimings = flow.turnTimings.concat([{ segmentId, turnIndex: nextIndex, enteredAt: now }]);
  return { ...flow, turnTimings };
}

/**
 * Mark the session as completed (the user reached `'done'` naturally).
 * Idempotent — returns flow unchanged if `completedAt` is already set.
 */
export function markSessionCompleted(flow: LearnFlowState, now: number): LearnFlowState {
  if (!flow) return flow;
  if (flow.completedAt != null) return flow;
  return { ...flow, completedAt: now };
}

/**
 * Mark the session as abandoned at the given pane. Idempotent — returns
 * flow unchanged if the session is already finalized (either completed or
 * previously marked abandoned). `completedAt` is set so downstream analytics
 * still see an end time.
 */
// Abandonment-phase contract: closeLearnSessionImmediate maps streaming→streaming, consolidating→consolidating, and {tutor,loading,error}→tutor. Loading/error coercion preserves the semantic "user was in a tutor segment when they abandoned" for telemetry analysis.
export function markAbandoned(
  flow: LearnFlowState,
  phase: LearnAbandonmentPhase,
  now: number
): LearnFlowState {
  if (!flow) return flow;
  if (flow.completedAt != null || flow.abandonmentPhase != null) return flow;
  return { ...flow, abandonmentPhase: phase, completedAt: now };
}

export function getLearnTelemetrySummary(flow: LearnFlowState, now?: number): LearnTelemetrySummary {
  const empty: LearnTelemetrySummary = {
    totalSegments: 0,
    completedSegments: 0,
    totalTurns: 0,
    avgTurnsPerCompletedSegment: null,
    avgTimePerTurnMs: null,
    startedAt: null,
    completedAt: null,
    elapsedMs: null,
    abandonmentPhase: null
  };
  if (!flow) return empty;

  const totalSegments = Array.isArray(flow.plan?.segments) ? flow.plan.segments.length : 0;
  const completedSegments = Array.isArray(flow.completedSegmentIds) ? flow.completedSegmentIds.length : 0;
  let totalTurns = 0;
  Object.values(flow.totalTurnsPerSegment || {}).forEach((n) => { totalTurns += Number(n) || 0; });
  const avgTurnsPerCompletedSegment = completedSegments > 0 ? totalTurns / completedSegments : null;

  let closedTurns = 0;
  let totalTurnDurationMs = 0;
  (flow.turnTimings || []).forEach((t) => {
    if (t && typeof t.submittedAt === 'number' && typeof t.enteredAt === 'number' && t.submittedAt >= t.enteredAt) {
      closedTurns += 1;
      totalTurnDurationMs += t.submittedAt - t.enteredAt;
    }
  });
  const avgTimePerTurnMs = closedTurns > 0 ? totalTurnDurationMs / closedTurns : null;

  const startedAtMs = typeof flow.startedAt === 'string' ? Date.parse(flow.startedAt) : Number.NaN;
  const startedAt = Number.isFinite(startedAtMs) ? startedAtMs : null;
  const completedAt = typeof flow.completedAt === 'number' ? flow.completedAt : null;
  let elapsedMs: number | null = null;
  if (startedAt != null && completedAt != null) {
    elapsedMs = Math.max(0, completedAt - startedAt);
  } else if (startedAt != null && typeof now === 'number') {
    elapsedMs = Math.max(0, now - startedAt);
  }

  return {
    totalSegments,
    completedSegments,
    totalTurns,
    avgTurnsPerCompletedSegment,
    avgTimePerTurnMs,
    startedAt,
    completedAt,
    elapsedMs,
    abandonmentPhase: flow.abandonmentPhase || null
  };
}

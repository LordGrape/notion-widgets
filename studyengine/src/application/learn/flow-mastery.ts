/**
 * Application layer (L2): Phase C mastery projection selector.
 * Split verbatim from src/learn-flow.ts in Phase V2c (2026-08-18).
 *
 * Read-only view over the state captured by Phase B telemetry actions and
 * the Phase 3 consolidation battery. Does NOT mutate the flow and NEVER
 * influences FSRS scheduling — it exists so the monolith can render a
 * mastery chip during the session and a forward-looking FSRS projection
 * card on the summary pane.
 *
 * Mastery semantics (`computeLearnMasteryProjection`):
 *   - A card is "covered" if it is linked to at least one completed segment.
 *   - A covered card is "consolidated" if it received a consolidation
 *     rating through at least one question in the Phase 3 battery; the
 *     lowest rating wins (mirrors `getFsrsHandoffPlan`).
 *   - Otherwise the covered card is "taught".
 *   - Per-card mastery weights: rating 4 = 1.0, rating 3 = 0.75,
 *     rating 2 = 0.5, rating 1 = 0.25, taught = 0.25. The score is the
 *     unweighted mean across covered cards. Returns 0 when nothing is
 *     covered yet (no division-by-zero surprises at the UI layer).
 */
import type { LearnFlowState, LearnMasteryProjection } from './types';
import { getFsrsHandoffPlan } from './flow-consolidation';

const MASTERY_WEIGHT_BY_RATING: Record<1 | 2 | 3 | 4, number> = {
  1: 0.25,
  2: 0.5,
  3: 0.75,
  4: 1.0
};
const MASTERY_WEIGHT_TAUGHT = 0.25;

export function computeLearnMasteryProjection(flow: LearnFlowState): LearnMasteryProjection {
  const breakdown: { 1: number; 2: number; 3: number; 4: number } = { 1: 0, 2: 0, 3: 0, 4: 0 };
  if (!flow) {
    return { coveredCards: 0, consolidatedCards: 0, taughtCards: 0, ratingsBreakdown: breakdown, masteryScore: 0 };
  }
  /* Reuse the same card-classification logic FSRS handoff uses so the
     chip can never disagree with what actually ends up in the handoff. */
  const plan = getFsrsHandoffPlan(flow, []);
  let covered = 0;
  let consolidated = 0;
  let taught = 0;
  let masterySum = 0;
  plan.forEach((entry) => {
    if (entry.status === 'unlearned') return;
    covered += 1;
    if (entry.status === 'consolidated' && entry.consolidationRating) {
      const r = entry.consolidationRating;
      breakdown[r] += 1;
      consolidated += 1;
      masterySum += MASTERY_WEIGHT_BY_RATING[r];
    } else {
      taught += 1;
      masterySum += MASTERY_WEIGHT_TAUGHT;
    }
  });
  const masteryScore = covered > 0 ? masterySum / covered : 0;
  return { coveredCards: covered, consolidatedCards: consolidated, taughtCards: taught, ratingsBreakdown: breakdown, masteryScore };
}

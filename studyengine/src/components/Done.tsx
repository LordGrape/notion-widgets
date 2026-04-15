/*
 * Done Component
 * Post-session summary view: XP, calibration, tier breakdown, dragon, AI summary
 */

import { useEffect, useState } from 'react';
import {
  currentView,
  sessionXP,
  sessionReviewsByTier,
  sessionQueue,
  sessionIndex,
  dragonState,
  settings,
  calibration as calibrationSignal,
  saveState
} from '../signals';
import { SESSION_SUMMARY_ENDPOINT } from '../constants';

const TIER_NAMES: Record<string, string> = {
  quickfire: 'Quick Fire',
  explain: 'Explain',
  apply: 'Apply',
  distinguish: 'Distinguish',
  mock: 'Mock',
  worked: 'Worked Example'
};

const TIER_COLOURS: Record<string, string> = {
  quickfire: 'var(--tier-qf)',
  explain: 'var(--tier-ex)',
  apply: 'var(--tier-ap)',
  distinguish: 'var(--tier-di)',
  mock: 'var(--tier-mk)',
  worked: 'var(--tier-we)'
};

// Worker URL imported from constants

// Dragon stage info
const DRAGON_STAGES = [
  { emoji: '🥚', rank: 'RECRUIT', min: 0 },
  { emoji: '🐣', rank: 'OFFICER CADET', min: 100 },
  { emoji: '🦎', rank: 'SECOND LIEUTENANT', min: 300 },
  { emoji: '🐉', rank: 'LIEUTENANT', min: 700 },
  { emoji: '🔥', rank: 'CAPTAIN', min: 1500 },
  { emoji: '⚡', rank: 'MAJOR', min: 3000 }
];

function getDragonStage(xp: number) {
  let stage = DRAGON_STAGES[0];
  for (const s of DRAGON_STAGES) {
    if (xp >= s.min) stage = s;
  }
  return stage;
}

function computeCalibration(): { score: number | null; label: string } {
  const cal = calibrationSignal.value;
  if (!cal || !cal.totalSelfRatings) return { score: null, label: 'No data yet' };
  const score = (cal.totalActualCorrect || 0) / cal.totalSelfRatings;
  const label = score >= 0.75 ? 'Well calibrated' : score >= 0.55 ? 'Slight overconfidence' : 'Significant miscalibration';
  return { score, label };
}

export function Done() {
  const xp = sessionXP.value;
  const reviewsByTier = sessionReviewsByTier.value;
  const dragon = dragonState.value;
  const gamMode = settings.value.gamificationMode || 'clean';

  const totalReviewed = Object.values(reviewsByTier).reduce((s, v) => s + v, 0);
  const { score: calScore, label: calLabel } = computeCalibration();
  const totalXP = (dragon as unknown as { totalXP?: number }).totalXP || 0;
  const stage = getDragonStage(totalXP + xp);

  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    const maybeCore = (window as unknown as { Core?: { confetti?: { launch?: () => void }; audio?: { play?: (name: string) => void } } }).Core;
    maybeCore?.confetti?.launch?.();
    maybeCore?.audio?.play?.('complete');

    if (totalReviewed === 0) return;
    setAiLoading(true);
    const sessionData = {
      reviewedCount: totalReviewed,
      xpEarned: xp,
      reviewsByTier
    };
    fetch(SESSION_SUMMARY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: sessionData })
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.summary) setAiSummary(data.summary);
      })
      .catch(() => {})
      .finally(() => setAiLoading(false));
  }, []);

  const handleBack = () => {
    sessionXP.value = 0;
    sessionReviewsByTier.value = { quickfire: 0, explain: 0, apply: 0, distinguish: 0, mock: 0, worked: 0 };
    sessionQueue.value = [];
    sessionIndex.value = 0;
    saveState();
    currentView.value = 'dashboard';
  };

  return (
    <div className="view view-done active se-done" id="viewDone">
      {/* Celebration header */}
      <div className="se-done-header" id="doneCelebration">
        <div className="se-done-sparkles" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => <span key={`hdr-${i}`} />)}
        </div>
        <div className="se-done-title" id="doneTitle">{totalReviewed} item{totalReviewed !== 1 ? 's' : ''} reviewed</div>
        <div className="se-done-subtitle" id="doneSub">
          {totalReviewed === 0 ? 'Nothing reviewed this session' :
           totalReviewed < 5 ? 'Good start — keep going!' :
           totalReviewed < 15 ? 'Solid session!' : 'Excellent session! 🎉'}
        </div>
      </div>

      {/* XP + Calibration */}
      {gamMode !== 'off' && (
        <div className="se-done-stats-row">
          <div className="stat se-done-stat" id="doneXPSection">
            <div className="k">XP Earned</div>
            <div className="v v--xp" id="doneXP">{xp}</div>
            <div className="s" style={{ marginTop: '6px' }}>Pushed to dragon</div>
          </div>
          <div className="stat se-done-stat">
            <div className="k">Calibration</div>
            <div className="v" id="doneCal">{calScore !== null ? Math.round(calScore * 100) + '%' : '—'}</div>
            <div className="s" id="doneTrend">{calLabel}</div>
          </div>
        </div>
      )}

      {/* Tier breakdown */}
      <div className="se-done-breakdown" id="doneBreakdown">
        {Object.entries(TIER_NAMES).map(([tier, name]) => {
          const count = reviewsByTier[tier] || 0;
          if (count === 0) return null;
          return (
            <span
              key={tier}
              className="tier-pill"
              style={{ borderColor: TIER_COLOURS[tier] }}
            >
              <span className="tier-dot" style={{ background: TIER_COLOURS[tier] }} />
              {name}: {count}
            </span>
          );
        })}
      </div>

      {/* Dragon section */}
      {gamMode !== 'off' && (
        <div className="se-done-dragon" id="doneDragonSection">
          <div className="se-done-sparkles" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => <span key={`dragon-${i}`} />)}
          </div>
          <div className="se-done-dragon-emoji" id="doneDragonOrb">{stage.emoji}</div>
          <div className="se-done-dragon-rank" id="doneDragonRank">{stage.rank}</div>
          <div className="se-done-dragon-note" id="doneDragonFlavour">
            {xp > 0 ? `+${xp} XP this session` : 'Keep reviewing to earn XP'}
          </div>
        </div>
      )}

      {/* AI Session Summary */}
      {totalReviewed > 0 && (
        <details className="se-done-summary" id="sessionAiSummaryWrap" open>
          <summary className="ss-header">
            <span className="ss-icon">✨</span>
            <span className="ss-title">AI session summary</span>
          </summary>
          <div className="ss-body" id="sessionAiSummaryBody">
            {aiLoading ? (
              <div className="se-done-skeleton" id="sessionAiSummaryLoading" aria-label="Generating summary">
                <span />
                <span />
                <span />
              </div>
            ) : aiSummary ? (
              <div>{aiSummary}</div>
            ) : (
              <div className="se-done-empty">Summary unavailable</div>
            )}
          </div>
        </details>
      )}

      {/* Back to dashboard */}
      <button className="big-btn se-done-back-btn" id="backBtn" onClick={handleBack}>
        Back to Dashboard
      </button>
    </div>
  );
}

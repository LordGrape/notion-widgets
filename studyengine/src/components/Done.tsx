/*
 * Done Component
 * Post-session summary view: XP, calibration, tier breakdown, dragon, AI summary
 */

import { Fragment, useEffect, useState } from 'react';
import {
  currentView,
  sessionXP,
  sessionReviewsByTier,
  dragonState,
  settings,
  calibration as calibrationSignal
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
  quickfire: '#3b82f6',
  explain: '#22c55e',
  apply: '#f59e0b',
  distinguish: '#8b5cf6',
  mock: '#ef4444',
  worked: '#06b6d4'
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
    currentView.value = 'dashboard';
  };

  return (
    <div className="view view-done active" id="viewDone">
      {/* Celebration header */}
      <div className="done-celebration" id="doneCelebration">
        <div className="done-emoji">
          <svg width="40" height="40" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round">
            <circle cx="8" cy="8" r="6"/>
            <circle cx="8" cy="8" r="3.5"/>
            <circle cx="8" cy="8" r="1"/>
          </svg>
        </div>
        <div className="done-headline" id="doneTitle">{totalReviewed} item{totalReviewed !== 1 ? 's' : ''} reviewed</div>
        <div className="done-subtitle" id="doneSub">
          {totalReviewed === 0 ? 'Nothing reviewed this session' :
           totalReviewed < 5 ? 'Good start — keep going!' :
           totalReviewed < 15 ? 'Solid session!' : 'Excellent session! 🎉'}
        </div>
      </div>

      {/* XP + Calibration */}
      {gamMode !== 'off' && (
        <div className="done-stats">
          <div className="stat" style={{ textAlign: 'center' }} id="doneXPSection">
            <div className="k">XP Earned</div>
            <div className="xp-badge">
              <span id="doneXP">{xp}</span>
              <span className="xp-label">XP</span>
            </div>
            <div className="s" style={{ marginTop: '6px' }}>Pushed to dragon</div>
          </div>
          <div className="stat" style={{ textAlign: 'center' }}>
            <div className="k">Calibration</div>
            <div className="v" id="doneCal">{calScore !== null ? Math.round(calScore * 100) + '%' : '—'}</div>
            <div className="s" id="doneTrend">{calLabel}</div>
          </div>
        </div>
      )}

      {/* Tier breakdown */}
      <div className="breakdown" id="doneBreakdown">
        {Object.entries(TIER_NAMES).map(([tier, name]) => {
          const count = reviewsByTier[tier] || 0;
          if (count === 0) return null;
          return (
            <span
              key={tier}
              className="tier-pill"
              style={{ borderColor: TIER_COLOURS[tier] + '30' }}
            >
              <span className="tier-dot" style={{ background: TIER_COLOURS[tier] }} />
              {name}: {count}
            </span>
          );
        })}
      </div>

      {/* Dragon section */}
      {gamMode !== 'off' && (
        <div className="done-dragon-section" id="doneDragonSection">
          <div className="done-dragon-wrap" id="doneDragonWrap">
            {Array.from({ length: 12 }, (_, i) => <div key={i} className="dragon-ember" />)}
            <div className="done-dragon-orb" id="doneDragonOrb">{stage.emoji}</div>
          </div>
          <div className="done-dragon-rank" id="doneDragonRank">{stage.rank}</div>
          <div className="done-dragon-flavour" id="doneDragonFlavour">
            {xp > 0 ? `+${xp} XP this session` : 'Keep reviewing to earn XP'}
          </div>
        </div>
      )}

      {/* AI Session Summary */}
      {totalReviewed > 0 && (
        <details className="session-summary" id="sessionAiSummaryWrap" open>
          <summary className="ss-header">
            <span className="ss-icon">✨</span>
            <span className="ss-title">AI session summary</span>
          </summary>
          <div className="ss-body" id="sessionAiSummaryBody">
            {aiLoading ? (
              <div className="syllabus-status" id="sessionAiSummaryLoading">
                <span className="af-spinner" /> Generating summary…
              </div>
            ) : aiSummary ? (
              <div style={{ fontSize: '12px', lineHeight: '1.6', color: 'var(--text-secondary)' }}>{aiSummary}</div>
            ) : (
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Summary unavailable</div>
            )}
          </div>
        </details>
      )}

      {/* Back to dashboard */}
      <button className="big-btn" id="backBtn" onClick={handleBack}>
        Back to Dashboard
      </button>
    </div>
  );
}

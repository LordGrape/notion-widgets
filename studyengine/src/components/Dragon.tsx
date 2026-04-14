/*
 * Dragon Component
 * Dragon stage display and evolution
 */

import { h, Fragment } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { dragonState, sessionXP } from '../signals';
import type { DragonState } from '../types';

// Dragon stage thresholds
const STAGE_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2100, 2800];

const STAGE_NAMES = [
  'Egg',
  'Hatchling',
  'Wyrmling',
  'Drake',
  'Dragon',
  'Elder Dragon',
  'Ancient Dragon',
  'Dragon Lord'
];

const STAGE_EMOJIS = ['🥚', '🐣', '🦎', '🐉', '🐲', '🔥', '⚡', '👑'];

// Compute dragon stage from XP
function computeDragonStage(xp: number): number {
  for (let i = STAGE_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= STAGE_THRESHOLDS[i]) return i;
  }
  return 0;
}

// Get progress to next stage
function getStageProgress(xp: number): number {
  const stage = computeDragonStage(xp);
  const currentThreshold = STAGE_THRESHOLDS[stage];
  const nextThreshold = STAGE_THRESHOLDS[stage + 1] || currentThreshold + 500;
  const progress = (xp - currentThreshold) / (nextThreshold - currentThreshold);
  return Math.max(0, Math.min(1, progress));
}

interface DragonProps {
  compact?: boolean;
  showXP?: boolean;
}

export function Dragon({ compact = false, showXP = true }: DragonProps) {
  const dragon = dragonState.value;
  const xp = dragon?.xp || 0;
  const stage = computeDragonStage(xp);
  const stageName = STAGE_NAMES[stage] || 'Egg';
  const emoji = STAGE_EMOJIS[stage] || '🥚';
  const progress = getStageProgress(xp);
  const nextThreshold = STAGE_THRESHOLDS[stage + 1] || xp + 500;
  const xpToNext = nextThreshold - xp;

  if (compact) {
    return (
      <div class="dragon-card compact">
        <div class="dragon-emoji">{emoji}</div>
        <div class="dragon-info">
          <div class="dragon-stage">{stageName}</div>
          {showXP && <div class="dragon-xp">{xp} XP</div>}
        </div>
      </div>
    );
  }

  return (
    <div class="dragon-card">
      <div class="dragon-display">
        <div class="dragon-emoji large">{emoji}</div>
        <div class="dragon-stage-name">{stageName}</div>
      </div>
      
      {showXP && (
        <div class="dragon-xp-section">
          <div class="xp-bar">
            <div class="xp-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <div class="xp-text">
            {xp} XP • {xpToNext} to next stage
          </div>
        </div>
      )}

      <div class="dragon-stages">
        {STAGE_NAMES.map((name, i) => (
          <div 
            key={name}
            class={`stage-dot ${i === stage ? 'current' : ''} ${i < stage ? 'completed' : ''}`}
            title={name}
          >
            {STAGE_EMOJIS[i]}
          </div>
        ))}
      </div>
    </div>
  );
}

// Dragon for session completion view
export function DragonCompletion() {
  const dragon = dragonState.value;
  const earnedXP = sessionXP.value;
  const totalXP = (dragon?.xp || 0) + earnedXP;
  const stage = computeDragonStage(totalXP);
  const stageName = STAGE_NAMES[stage] || 'Egg';
  const emoji = STAGE_EMOJIS[stage] || '🥚';

  return (
    <div class="dragon-completion">
      <div class="completion-header">
        <h2>Session Complete!</h2>
      </div>
      
      <div class="dragon-celebration">
        <div class="dragon-emoji animated">{emoji}</div>
        <div class="xp-earned">+{earnedXP} XP</div>
      </div>

      <div class="dragon-status">
        <div class="stage-name">{stageName}</div>
        <div class="total-xp">Total: {totalXP} XP</div>
      </div>

      <button 
        class="back-btn"
        onClick={() => {
          // Update dragon state with earned XP
          dragonState.value = { ...dragon, xp: totalXP };
          // Return to dashboard
          const win = window as unknown as { currentView?: { value: string } };
          if (win.currentView) win.currentView.value = 'dashboard';
        }}
      >
        Back to Dashboard
      </button>
    </div>
  );
}

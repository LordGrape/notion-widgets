/*
 * Dashboard Preact Component
 * Phase 4: Converted from dashboard.js
 */

import { Fragment, useEffect, useRef, useCallback } from 'react';
import { computed, signal } from '@preact/signals-react';
import { 
  items, courses, settings, dragonState, currentView, selectedCourse, dueItems,
  calibration as calibrationSignal, stats as statsSignal
} from '../signals';
import type { StudyItem, Course, CramState } from '../types';
import { Dragon } from './Dragon';

// Local signals for dashboard state
const resumeSnapshot = signal<{ _remaining: number } | null>(null);

// Type guard for resume snapshot
function hasResumeSnapshot(s: unknown): s is { _remaining: number } {
  return s !== null && typeof s === 'object' && '_remaining' in s && typeof (s as { _remaining: unknown })._remaining === 'number';
}

// Stats computation helpers
function computeDueCounts(itemsData: Record<string, StudyItem>) {
  let total = 0;
  const byTier: Record<string, number> = { quickfire: 0, explain: 0, apply: 0, distinguish: 0, mock: 0, worked: 0 };
  
  for (const id in itemsData) {
    const it = itemsData[id];
    if (!it || it.archived) continue;
    
    const f = it.fsrs;
    if (!f || !f.lastReview || !f.due) {
      total++;
      const tier = it.tier || 'quickfire';
      byTier[tier] = (byTier[tier] || 0) + 1;
    } else {
      const dueDate = new Date(f.due);
      if (dueDate <= new Date()) {
        total++;
        const tier = it.tier || 'quickfire';
        byTier[tier] = (byTier[tier] || 0) + 1;
      }
    }
  }
  
  return { total, byTier };
}

function computeMasteredCount(itemsData: Record<string, StudyItem>) {
  let count = 0;
  for (const id in itemsData) {
    const it = itemsData[id];
    if (!it || it.archived || !it.fsrs) continue;
    if ((it.fsrs.stability || 0) > 30 && (it.fsrs.lapses || 0) === 0) count++;
  }
  return count;
}

function computeAvgRetention(itemsData: Record<string, StudyItem>) {
  let sum = 0, count = 0;
  const now = Date.now();
  
  for (const id in itemsData) {
    const it = itemsData[id];
    if (!it || it.archived || !it.fsrs || !it.fsrs.lastReview) continue;
    
    // Compute retrievability
    const f = it.fsrs;
    const lastReview = f.lastReview;
    if (!lastReview) continue;
    const elapsed = (now - new Date(lastReview).getTime()) / (1000 * 60 * 60 * 24);
    const ret = Math.exp(Math.log(0.9) * elapsed / (f.stability || 1));
    sum += Math.max(0, Math.min(1, ret));
    count++;
  }
  
  return count > 0 ? sum / count : null;
}

function computeCalibration(calibrationData: { totalSelfRatings?: number; totalActualCorrect?: number }) {
  const total = calibrationData?.totalSelfRatings || 0;
  const correct = calibrationData?.totalActualCorrect || 0;
  if (total === 0) return null;
  return correct / total;
}

// Tier colors
const tierColours: Record<string, string> = {
  quickfire: '#3b82f6',
  explain: '#22c55e',
  apply: '#f59e0b',
  distinguish: '#8b5cf6',
  mock: '#ef4444',
  worked: '#06b6d4'
};

const tierNames: Record<string, string> = {
  quickfire: 'Quick Fire',
  explain: 'Explain',
  apply: 'Apply',
  distinguish: 'Distinguish',
  mock: 'Mock',
  worked: 'Worked Example'
};

// Computed values
const dueCounts = computed(() => computeDueCounts(items.value));
const masteredCount = computed(() => computeMasteredCount(items.value));
const avgRetention = computed(() => computeAvgRetention(items.value));
const calibration = computed(() => {
  return computeCalibration(calibrationSignal.value || {});
});

const streakDays = computed(() => {
  return statsSignal.value?.streakDays || 0;
});

const totalItems = computed(() => {
  let count = 0;
  for (const id in items.value) {
    if (!items.value[id]?.archived) count++;
  }
  return count;
});

const coursesArray = computed(() => Object.values(courses.value));

// Cram state computation
const activeCrams = computed(() => {
  const crams: Array<{ name: string; cram: CramState }> = [];
  for (const c of coursesArray.value) {
    if (!c.name) continue;
    // Call global getCramState
    const cram = (window as unknown as { getCramState?: (name: string) => CramState }).getCramState?.(c.name);
    if (cram?.active) crams.push({ name: c.name, cram });
  }
  return crams.sort((a, b) => (a.cram.daysUntil || 9999) - (b.cram.daysUntil || 9999));
});

// Empty state component
function EmptyState() {
  const hasCourses = coursesArray.value.length > 0;
  
  return (
    <div className="empty-state" id="emptyState" style={{ display: 'block' }}>
      <div className="empty-icon">📚</div>
      <h2 className="empty-title">{hasCourses ? 'No items yet' : 'No decks yet'}</h2>
      <p className="empty-desc">
        {hasCourses 
          ? 'Add study items manually or import a JSON batch to start your first retrieval session.'
          : 'Create your first deck to organize topics, track retention, and make the dashboard come alive.'
        }
      </p>
      {!hasCourses && (
        <button 
          className="big-btn"
          id="emptyAddDeckBtn"
          onClick={() => {
            if (typeof (window as unknown as { openCreateCourseFlow?: () => void }).openCreateCourseFlow === 'function') {
              (window as unknown as { openCreateCourseFlow: () => void }).openCreateCourseFlow();
            }
          }}
        >
          Create Your First Deck
        </button>
      )}
    </div>
  );
}

// Cram banner component
function CramBanner() {
  const crams = activeCrams.value;
  if (crams.length === 0) return null;
  
  return (
    <div className="cram-banner-container" id="cramBanner">
      {crams.map(entry => (
        <div 
          key={entry.name}
          className="cram-banner show"
          style={{
            background: 'linear-gradient(135deg,rgba(239,68,68,0.12),rgba(245,158,11,0.08))',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px',
            margin: '12px 0'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span className="cram-dashboard-fire" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>🔥</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '13px' }}>
                CRAM MODE — {entry.name} ({entry.cram.daysUntil} days)
              </div>
              <div style={{ fontSize: '11px', opacity: 0.7 }}>
                {entry.cram.intensity} intensity · {entry.cram.sessionMod}× session size · {entry.cram.intervalMod}× intervals
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Tier breakdown component
function TierBreakdown() {
  const due = dueCounts.value;
  
  return (
    <div className="tier-breakdown" id="tierBreakdown">
      {Object.entries(tierNames).map(([tier, name]) => {
        const count = due.byTier[tier] || 0;
        const color = tierColours[tier];
        return (
          <span 
            key={tier}
            className="tier-pill info-icon"
            data-count={count}
            style={{ borderColor: color + '30', cursor: 'help', position: 'relative' }}
          >
            <span 
              className="tier-dot" 
              style={{ background: color, boxShadow: `0 0 12px ${color}33` }}
            />
            {name}: {count}
          </span>
        );
      })}
    </div>
  );
}

// Main dashboard component
export function Dashboard() {
  const isEmpty = totalItems.value === 0;
  const due = dueCounts.value;
  const mastered = masteredCount.value;
  const retention = avgRetention.value;
  const cal = calibration.value;
  const streak = streakDays.value;
  const gamificationMode = settings.value.gamificationMode || 'clean';
  
  // Check for resumable session
  useEffect(() => {
    const checkResume = () => {
      const snap = (window as unknown as { checkForResumableSession?: () => unknown }).checkForResumableSession?.();
      resumeSnapshot.value = hasResumeSnapshot(snap) ? snap : null;
    };
    checkResume();
  }, []);
  
  if (isEmpty) {
    return <EmptyState />;
  }

  return (
    <div className="view view-dash active" id="viewDash">
      {/* Hero stat - Due count */}
      <div className="hero-stat" id="heroStat">
        <div className="hero-number" id="statDue">{due.total}</div>
        <div className="hero-label">items due</div>
        <div className="hero-hint" id="heroCourseHint">Across all tiers</div>
      </div>

      {/* Cram banner */}
      <CramBanner />

      {/* Stats grid */}
      <div className="stats-row">
        {/* Mastered */}
        <div className="stat-card" id="streakStatWrap" style={{ display: gamificationMode === 'off' ? 'none' : '' }}>
          <div className="stat-val" id="statStreak">{mastered}</div>
          <div className="stat-label">mastered</div>
          <div className="stat-sub">stability &gt;30 days, 0 lapses</div>
        </div>

        {/* Study streak */}
        <div className="stat-card" id="streakStatWrap">
          <div className="stat-val" id="statStudyStreak">{streak}</div>
          <div className="stat-label" id="streakSub">{streak === 1 ? 'day' : 'days'}</div>
          <div className="stat-sub">study streak</div>
        </div>

        {/* Avg retention */}
        <div className="stat-card">
          <div className="stat-val" id="statRet">
            {retention !== null ? Math.round(retention * 100) + '%' : '—'}
          </div>
          <div className="stat-label">avg retention</div>
          <div className="stat-sub">across all cards</div>
        </div>

        {/* Calibration */}
        <div className="stat-card calibration-card">
          <div className="stat-val" id="calVal">
            {cal !== null ? Math.round(cal * 100) + '%' : '—'}
          </div>
          <div className="stat-label">calibration</div>
          <div className="stat-sub" id="calSub">
            {cal === null ? 'Complete a session to begin' : 
             cal >= 0.75 ? 'Well calibrated' : 
             cal >= 0.55 ? 'Slight overconfidence' : 'Significant miscalibration'}
          </div>
          <div className="cal-arc" id="calArc" style={{ '--cal-pct': cal !== null ? cal : 0 }} />
        </div>
      </div>

      {/* Tier breakdown */}
      <TierBreakdown />

      {/* Actions */}
      <div className="dash-actions">
        {resumeSnapshot.value && resumeSnapshot.value._remaining > 0 ? (
          <div className="resume-session-wrap" id="resumeSessionWrap">
            <div className="resume-session-hint">
              <span className="resume-session-dot"></span>
              {resumeSnapshot.value._remaining} card{resumeSnapshot.value._remaining === 1 ? '' : 's'} remaining from your last session
            </div>
            <div className="resume-session-actions">
              <button 
                className="big-btn" 
                onClick={() => {
                  (window as unknown as { resumeSavedSession?: (s: unknown) => void }).resumeSavedSession?.(resumeSnapshot.value);
                }}
              >
                Continue Session
              </button>
              <button 
                className="big-btn ghost-btn"
                onClick={() => {
                  (window as unknown as { clearActiveSessionSnapshot?: () => void }).clearActiveSessionSnapshot?.();
                  resumeSnapshot.value = null;
                  currentView.value = 'session';
                }}
              >
                New Session
              </button>
            </div>
          </div>
        ) : (
          <button 
            className="big-btn"
            id="startBtn"
            disabled={due.total === 0}
            onClick={() => { currentView.value = 'session'; }}
          >
            Start Session
          </button>
        )}
        
        <div className="mini-actions" id="homeMiniActions">
          <button 
            className="mini-btn"
            onClick={() => {
              if (typeof (window as unknown as { openModal?: () => void }).openModal === 'function') {
                (window as unknown as { openModal: () => void }).openModal();
              }
            }}
          >
            ＋ Add Item
          </button>
          <button 
            className="mini-btn"
            onClick={() => {
              if (typeof (window as unknown as { openImportModal?: () => void }).openImportModal === 'function') {
                (window as unknown as { openImportModal: () => void }).openImportModal();
              }
            }}
          >
            📥 Import JSON
          </button>
        </div>
      </div>

      {/* Sleep advice banner placeholder */}
      <div className="break-banner" id="sleepAdviceBanner"></div>
    </div>
  );
}

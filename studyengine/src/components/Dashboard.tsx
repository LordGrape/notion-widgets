/*
 * Dashboard Preact Component
 * Phase 4: Converted from dashboard.js
 */

import { h, Fragment } from 'preact';
import { computed, signal } from '@preact/signals';
import { useEffect, useRef, useCallback } from 'preact/hooks';
import { 
  items, courses, settings, dragonState, currentView, selectedCourse, dueItems 
} from '../signals';
import type { StudyItem, Course, CramState } from '../types';

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
  // Read from window.state for now (until calibration is in signals)
  const st = (window as unknown as { state?: { calibration?: { totalSelfRatings?: number; totalActualCorrect?: number } } }).state;
  return computeCalibration(st?.calibration || {});
});

const streakDays = computed(() => {
  const st = (window as unknown as { state?: { stats?: { streakDays?: number } } }).state;
  return st?.stats?.streakDays || 0;
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
    <div class="empty-state" id="emptyState" style={{ display: 'block' }}>
      <div class="empty-icon">📚</div>
      <h2 class="empty-title">{hasCourses ? 'No items yet' : 'No decks yet'}</h2>
      <p class="empty-desc">
        {hasCourses 
          ? 'Add study items manually or import a JSON batch to start your first retrieval session.'
          : 'Create your first deck to organize topics, track retention, and make the dashboard come alive.'
        }
      </p>
      {!hasCourses && (
        <button 
          class="big-btn"
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
    <div class="cram-banner-container" id="cramBanner">
      {crams.map(entry => (
        <div 
          key={entry.name}
          class="cram-banner show"
          style={{
            background: 'linear-gradient(135deg,rgba(239,68,68,0.12),rgba(245,158,11,0.08))',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px',
            margin: '12px 0'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span class="cram-dashboard-fire" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>🔥</span>
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
    <div class="tier-breakdown" id="tierBreakdown">
      {Object.entries(tierNames).map(([tier, name]) => {
        const count = due.byTier[tier] || 0;
        const color = tierColours[tier];
        return (
          <span 
            key={tier}
            class="tier-pill info-icon"
            data-count={count}
            style={{ borderColor: color + '30', cursor: 'help', position: 'relative' }}
          >
            <span 
              class="tier-dot" 
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
    <div class="view view-dash active" id="viewDash">
      {/* Hero stat - Due count */}
      <div class="hero-stat" id="heroStat">
        <div class="hero-number" id="statDue">{due.total}</div>
        <div class="hero-label">items due</div>
        <div class="hero-hint" id="heroCourseHint">Across all tiers</div>
      </div>

      {/* Cram banner */}
      <CramBanner />

      {/* Stats grid */}
      <div class="stats-row">
        {/* Mastered */}
        <div class="stat-card" id="streakStatWrap" style={{ display: gamificationMode === 'off' ? 'none' : '' }}>
          <div class="stat-val" id="statStreak">{mastered}</div>
          <div class="stat-label">mastered</div>
          <div class="stat-sub">stability &gt;30 days, 0 lapses</div>
        </div>

        {/* Study streak */}
        <div class="stat-card" id="streakStatWrap">
          <div class="stat-val" id="statStudyStreak">{streak}</div>
          <div class="stat-label" id="streakSub">{streak === 1 ? 'day' : 'days'}</div>
          <div class="stat-sub">study streak</div>
        </div>

        {/* Avg retention */}
        <div class="stat-card">
          <div class="stat-val" id="statRet">
            {retention !== null ? Math.round(retention * 100) + '%' : '—'}
          </div>
          <div class="stat-label">avg retention</div>
          <div class="stat-sub">across all cards</div>
        </div>

        {/* Calibration */}
        <div class="stat-card calibration-card">
          <div class="stat-val" id="calVal">
            {cal !== null ? Math.round(cal * 100) + '%' : '—'}
          </div>
          <div class="stat-label">calibration</div>
          <div class="stat-sub" id="calSub">
            {cal === null ? 'Complete a session to begin' : 
             cal >= 0.75 ? 'Well calibrated' : 
             cal >= 0.55 ? 'Slight overconfidence' : 'Significant miscalibration'}
          </div>
          <div class="cal-arc" id="calArc" style={{ '--cal-pct': cal !== null ? cal : 0 }} />
        </div>
      </div>

      {/* Tier breakdown */}
      <TierBreakdown />

      {/* Actions */}
      <div class="dash-actions">
        {resumeSnapshot.value && resumeSnapshot.value._remaining > 0 ? (
          <div class="resume-session-wrap" id="resumeSessionWrap">
            <div class="resume-session-hint">
              <span class="resume-session-dot"></span>
              {resumeSnapshot.value._remaining} card{resumeSnapshot.value._remaining === 1 ? '' : 's'} remaining from your last session
            </div>
            <div class="resume-session-actions">
              <button 
                class="big-btn" 
                onClick={() => {
                  (window as unknown as { resumeSavedSession?: (s: unknown) => void }).resumeSavedSession?.(resumeSnapshot.value);
                }}
              >
                Continue Session
              </button>
              <button 
                class="big-btn ghost-btn"
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
            class="big-btn"
            id="startBtn"
            disabled={due.total === 0}
            onClick={() => { currentView.value = 'session'; }}
          >
            Start Session
          </button>
        )}
        
        <div class="mini-actions" id="homeMiniActions">
          <button 
            class="mini-btn"
            onClick={() => {
              if (typeof (window as unknown as { openModal?: () => void }).openModal === 'function') {
                (window as unknown as { openModal: () => void }).openModal();
              }
            }}
          >
            ＋ Add Item
          </button>
          <button 
            class="mini-btn"
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
      <div class="break-banner" id="sleepAdviceBanner"></div>
    </div>
  );
}

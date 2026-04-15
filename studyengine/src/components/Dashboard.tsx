import { computed } from '@preact/signals-react';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { calibration, courses, currentView, dragonState, items, settings, stats, sessionIndex, sessionQueue, sessionXP } from '../signals';
import type { CramState, StudyItem } from '../types';

const tierNames = [
  'quickfire',
  'explain',
  'apply',
  'distinguish',
  'mock',
  'worked',
] as const;

type TierName = typeof tierNames[number];

const tierLabels: Record<string, string> = {
  quickfire: 'Quick Fire',
  explain: 'Explain',
  apply: 'Apply',
  distinguish: 'Distinguish',
  mock: 'Mock',
  worked: 'Worked',
};

function getDueAndTierCounts(itemsData: Record<string, StudyItem>) {
  const byTier: Record<TierName, number> = { quickfire: 0, explain: 0, apply: 0, distinguish: 0, mock: 0, worked: 0 };
  let total = 0;
  const now = new Date();

  Object.values(itemsData).forEach((it) => {
    if (!it || it.archived) return;
    const due = !it.fsrs?.due || new Date(it.fsrs.due) <= now;
    if (!due) return;
    total += 1;
    const tier = (it.tier || 'quickfire') as TierName;
    byTier[tier] = (byTier[tier] || 0) + 1;
  });

  return { total, byTier };
}

function getAverageRetention(itemsData: Record<string, StudyItem>): number | null {
  const now = Date.now();
  let sum = 0;
  let count = 0;

  Object.values(itemsData).forEach((it) => {
    if (!it || it.archived || !it.fsrs?.lastReview) return;
    const stability = it.fsrs.stability || 1;
    const elapsedDays = (now - new Date(it.fsrs.lastReview).getTime()) / 86400000;
    const retrievability = Math.exp((Math.log(0.9) * elapsedDays) / stability);
    sum += Math.max(0, Math.min(1, retrievability));
    count += 1;
  });

  return count > 0 ? sum / count : null;
}

function getMasteredCount(itemsData: Record<string, StudyItem>): number {
  return Object.values(itemsData).filter((it) => {
    if (!it || it.archived || !it.fsrs) return false;
    return (it.fsrs.stability || 0) > 30 && (it.fsrs.lapses || 0) === 0;
  }).length;
}

function getCalibrationRatio(): number | null {
  const total = calibration.value?.totalSelfRatings || 0;
  if (!total) return null;
  return (calibration.value?.totalActualCorrect || 0) / total;
}

function getTopicReadiness(itemsData: Record<string, StudyItem>) {
  const topics = new Map<string, { cards: number; sum: number; seen: number }>();
  const now = Date.now();

  Object.values(itemsData).forEach((it) => {
    if (!it || it.archived || !it.topic) return;
    const topic = it.topic.trim();
    if (!topic) return;
    if (!topics.has(topic)) topics.set(topic, { cards: 0, sum: 0, seen: 0 });
    const bucket = topics.get(topic)!;
    bucket.cards += 1;
    if (it.fsrs?.lastReview) {
      const elapsedDays = (now - new Date(it.fsrs.lastReview).getTime()) / 86400000;
      const stability = it.fsrs.stability || 1;
      const ret = Math.exp((Math.log(0.9) * elapsedDays) / stability);
      bucket.sum += Math.max(0, Math.min(1, ret));
      bucket.seen += 1;
    }
  });

  return Array.from(topics.entries())
    .map(([name, data]) => {
      const pct = data.seen ? Math.round((data.sum / data.seen) * 100) : 0;
      const state = data.seen === 0 ? 'unseen' : pct >= 80 ? 'strong' : pct >= 60 ? 'developing' : 'weak';
      return { name, cards: data.cards, pct, state };
    })
    .sort((a, b) => b.cards - a.cards || a.name.localeCompare(b.name))
    .slice(0, 12);
}

const dashData = computed(() => {
  const itemMap = items.value;
  const due = getDueAndTierCounts(itemMap);
  const totalItems = Object.values(itemMap).filter((it) => it && !it.archived).length;
  const retention = getAverageRetention(itemMap);
  const calibrationRatio = getCalibrationRatio();
  const topicReadiness = getTopicReadiness(itemMap);
  const coursesList = Object.values(courses.value).filter((c) => c && !c.archived);
  const gamificationMode = settings.value.gamificationMode || 'clean';
  const streakDays = stats.value?.streakDays || 0;
  const mastered = getMasteredCount(itemMap);
  const xp = dragonState.value?.xp || 0;
  const rank = dragonState.value?.rank || 'RECRUIT';
  const rankEmoji = dragonState.value?.rankEmoji || '🥚';
  const xpPct = Math.min(100, Math.round((xp % 1000) / 10));

  const crams = coursesList
    .map((c) => ({ name: c.name, cram: (window as { getCramState?: (name: string) => CramState }).getCramState?.(c.name || '') }))
    .filter((entry): entry is { name: string; cram: CramState } => Boolean(entry.name && entry.cram?.active && (entry.cram.daysUntil || 99) <= 7))
    .sort((a, b) => (a.cram.daysUntil || 99) - (b.cram.daysUntil || 99));

  return {
    due,
    totalItems,
    retention,
    calibrationRatio,
    topicReadiness,
    gamificationMode,
    streakDays,
    mastered,
    xp,
    rank,
    rankEmoji,
    xpPct,
    crams,
  };
});

export function Dashboard() {
  const [activeSession, setActiveSession] = useState<{ queue: string[]; idx: number; xp: number } | null>(null);
  const emptyStateRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const se = (window as unknown as { SyncEngine?: { get: (ns: string, key: string) => unknown } }).SyncEngine;
    const snap = se?.get('studyengine', 'activeSession') as { queue?: string[]; idx?: number; xp?: number } | null | undefined;
    if (snap && Array.isArray(snap.queue) && typeof snap.idx === 'number') {
      setActiveSession({ queue: snap.queue, idx: snap.idx, xp: snap.xp || 0 });
    } else {
      setActiveSession(null);
    }
  }, []);

  const handleContinueSession = () => {
    if (!activeSession) return;
    const restoredQueue = activeSession.queue
      .map((id) => items.value[id])
      .filter((it): it is StudyItem => Boolean(it && !it.archived));
    if (restoredQueue.length === 0) return;
    sessionQueue.value = restoredQueue;
    sessionIndex.value = Math.max(0, Math.min(activeSession.idx, restoredQueue.length - 1));
    sessionXP.value = activeSession.xp || 0;
    currentView.value = 'session';
  };

  const d = dashData.value;
  const calPct = d.calibrationRatio !== null ? Math.round(d.calibrationRatio * 100) : null;
  const calStroke = 2 * Math.PI * 45;
  const calOffset = calPct !== null ? calStroke - (calPct / 100) * calStroke : calStroke;
  const totalItemKeys = Object.keys(items.value || {}).length;
  const isEmptyState = totalItemKeys === 0;

  useEffect(() => {
    if (!isEmptyState || !emptyStateRef.current) return;
    const gsapRef = (window as unknown as { gsap?: { fromTo: (target: Element, fromVars: Record<string, unknown>, toVars: Record<string, unknown>) => void } }).gsap;
    if (!gsapRef?.fromTo) return;
    gsapRef.fromTo(
      emptyStateRef.current,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }
    );
  }, [isEmptyState]);

  if (isEmptyState) {
    return (
      <div className="se-dash se-dash-empty">
        <div className="se-dash-empty-panel" ref={emptyStateRef}>
          <div className="se-dash-empty-icon" aria-hidden="true">🎓</div>
          <h2 className="se-dash-empty-title">Welcome to Study Engine</h2>
          <p className="se-dash-empty-subtitle">
            Create your first course to start building your spaced repetition library. Import cards, add lecture context, and let the AI tutor personalise your review sessions.
          </p>
          <button className="big-btn se-dash-empty-cta" onClick={() => (window as { openCreateCourseFlow?: () => void }).openCreateCourseFlow?.()}>
            ✦ Create Your First Course
          </button>
          <div className="se-dash-empty-hint">Or import a JSON card batch from the sidebar</div>
        </div>
      </div>
    );
  }

  return (
    <div className="se-dash">
      <div className="se-dash-hero hero-stat">
        <div className="se-dash-hero-value hero-value">{d.due.total}</div>
        <div className="hero-label">items due</div>
        <div className="hero-sub">Across all tiers</div>
      </div>

      {d.gamificationMode === 'motivated' && (
        <div className="progression-hub">
          <div className="prog-rank-section">
            <div className="prog-rank-badge"><span className="prog-rank-emoji">{d.rankEmoji}</span></div>
            <div className="prog-rank-info">
              <div className="prog-rank-name">{d.rank}</div>
              <div className="prog-xp-row">
                <span className="prog-xp-value">{d.xp}</span>
                <span className="prog-xp-label">XP</span>
              </div>
            </div>
            <div className="prog-streak-pill">
              <span className="prog-streak-icon">🔥</span>
              <span className="prog-streak-val">{d.streakDays}</span>
              <span className="prog-streak-unit">days</span>
            </div>
          </div>
          <div className="prog-bar-section">
            <div className="prog-bar-track"><div className="prog-bar-fill" style={{ width: `${d.xpPct}%` }} /></div>
          </div>
        </div>
      )}

      <div className="se-dash-stats-grid">
        <div className="stat se-dash-stat"><div className="k">Mastered</div><div className="v">{d.mastered}</div><div className="s">stability &gt; 30d, 0 lapses</div></div>
        <div className="stat se-dash-stat"><div className="k">Study Streak</div><div className="v">{d.streakDays}</div><div className="s">{d.streakDays === 1 ? 'day' : 'days'} in a row</div></div>
        <div className="stat se-dash-stat"><div className="k">Avg Retention</div><div className="v">{d.retention !== null ? `${Math.round(d.retention * 100)}%` : '—'}</div><div className="s">FSRS retrievability</div></div>
        <div className="stat se-dash-stat"><div className="k">Calibration</div><div className="v">{calPct !== null ? `${calPct}%` : '—'}</div><div className="s">{calPct === null ? 'Complete a session to begin' : calPct >= 75 ? 'Well calibrated' : calPct >= 55 ? 'Slight overconfidence' : 'Needs practice'}</div></div>
      </div>

      <div className="se-dash-gauge gauge">
        <svg width="110" height="64" viewBox="0 0 110 64" aria-hidden="true">
          <path d="M 10 55 A 45 45 0 0 1 100 55" fill="none" stroke="rgba(var(--accent-rgb),0.15)" strokeWidth="8" strokeLinecap="round" />
          <path d="M 10 55 A 45 45 0 0 1 100 55" fill="none" stroke="var(--accent-primary)" strokeWidth="8" strokeLinecap="round" strokeDasharray={calStroke} strokeDashoffset={calOffset} className="se-dash-gauge-arc" />
        </svg>
        <div>
          <div className="g-title">Calibration Gauge</div>
          <div className="g-val">{calPct !== null ? `${calPct}%` : '—'}</div>
          <div className="g-sub">Metacognitive alignment</div>
        </div>
      </div>

      {d.topicReadiness.length > 0 && (
        <div className="topic-readiness-map">
          <div className="trm-header">
            <div className="trm-title">Topic Readiness</div>
            <div className="trm-summary">{d.topicReadiness.length} active topics</div>
          </div>
          <div className="trm-grid">
            {d.topicReadiness.map((topic) => (
              <div key={topic.name} className={`trm-cell trm-${topic.state}`} style={{ '--trm-fill': `${topic.pct}%` } as CSSProperties}>
                <div className="trm-cell-name">{topic.name}</div>
                <div className="trm-cell-stats">
                  <span className="trm-cell-pct">{topic.state === 'unseen' ? '—' : `${topic.pct}%`}</span>
                  <span className="trm-cell-cards">{topic.cards} cards</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="se-dash-breakdown breakdown">
        {tierNames.map((tier) => (
          <span key={tier} className="tier-pill" data-count={d.due.byTier[tier] || 0}>
            <span className="tier-dot" />
            {tierLabels[tier]}: {d.due.byTier[tier] || 0}
          </span>
        ))}
      </div>

      {d.crams.length > 0 && (
        <div className="se-dash-cram-banner cram-banner show">
          <span className="cram-icon">🔥</span>
          <span className="cram-text">Cram mode — {d.crams[0].name} exam in {d.crams[0].cram.daysUntil} day{d.crams[0].cram.daysUntil === 1 ? '' : 's'}</span>
        </div>
      )}

      <div className="se-dash-actions">
        <button className="big-btn" disabled={d.due.total === 0} onClick={() => { currentView.value = 'session'; }}>Start Session</button>
        {activeSession && (
          <button className="ghost-btn" onClick={handleContinueSession}>Continue Session</button>
        )}
        <button className="ghost-btn" onClick={() => { currentView.value = 'learn'; }}>Learn</button>
        <button className="ghost-btn" onClick={() => (window as { openModal?: () => void }).openModal?.()}>Add Items</button>
        <button className="ghost-btn" onClick={() => (window as { openImportModal?: () => void }).openImportModal?.()}>Import JSON</button>
      </div>
    </div>
  );
}

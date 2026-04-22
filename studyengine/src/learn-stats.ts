import type { AppState, LearnSessionRecord } from './types';
import { computeCoverageRatio } from './learn-coverage';

export interface LearnStats {
  courseId: string;
  encodingCoverage: {
    consolidated: number;
    taught: number;
    total: number;
    pct: number;
    empty: boolean;
  };
  consolidationRatingDistribution: {
    total: number;
    buckets: {
      again: number;
      hard: number;
      good: number;
      easy: number;
      unrated: number;
    };
    empty: boolean;
  };
  encodingToFirstReviewLag: {
    sampleSize: number;
    medianMs: number | null;
    emptyMessage: string | null;
  };
  teachBlockReadTime: {
    sampleSize: number;
    medianMs: number | null;
    emptyMessage: string | null;
  };
  groundingPassRate: {
    sampleSize: number;
    geminiCount: number;
    fallbackCount: number;
    geminiPct: number;
    fallbackPct: number;
    emptyMessage: string | null;
  };
  successiveRelearningFromLearn: {
    count: number;
  };
}

/**
 * Compute course-scoped Learn analytics from persisted Study Engine state.
 *
 * This function is pure: it does not mutate `state` and has no side effects.
 *
 * @example
 * computeLearnStats(state, 'Biology 101').encodingCoverage
 * // => { consolidated: 12, total: 40, pct: 30, empty: false }
 *
 * @example
 * computeLearnStats(state, 'New Course').groundingPassRate.emptyMessage
 * // => 'Not enough data yet'
 */
export function computeLearnStats(state: AppState, courseId: string): LearnStats {
  const items = Object.values(state.items || {}).filter((item) => item?.course === courseId);
  const { consolidated, total, percent: pct } = computeCoverageRatio(items);
  const taught = items.filter((item) => item?.learnStatus === 'taught').length;

  const buckets = {
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
    unrated: 0
  };

  for (const item of items) {
    const rating = item?.consolidationRating;
    if (rating === 1) buckets.again += 1;
    else if (rating === 2) buckets.hard += 1;
    else if (rating === 3) buckets.good += 1;
    else if (rating === 4) buckets.easy += 1;
    else buckets.unrated += 1;
  }

  const lagSamples: number[] = [];
  for (const item of items) {
    if (typeof item?.learnedAt !== 'number') continue;
    const lastReview = item?.fsrs?.lastReview ? new Date(item.fsrs.lastReview).getTime() : NaN;
    if (!Number.isFinite(lastReview)) continue;
    const delta = lastReview - item.learnedAt;
    if (Number.isFinite(delta) && delta >= 0) lagSamples.push(delta);
  }

  const courseSegments = getRecentCourseSegments(state.learnSessions || [], courseId, 20);
  const teachReadSamples = courseSegments
    .map((segment) => segment.teachReadMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);

  const groundingSegments = courseSegments
    .map((segment) => segment.groundingSource)
    .filter((source): source is 'gemini' | 'fallback' => source === 'gemini' || source === 'fallback');
  const geminiCount = groundingSegments.filter((source) => source === 'gemini').length;
  const fallbackCount = groundingSegments.filter((source) => source === 'fallback').length;
  const groundingTotal = groundingSegments.length;

  const relearningCount = items.filter(
    (item) => item?.forceNextQF === true && item?.forceNextQFOrigin === 'learn'
  ).length;

  return {
    courseId,
    encodingCoverage: {
      consolidated,
      taught,
      total,
      pct,
      empty: total === 0
    },
    consolidationRatingDistribution: {
      total,
      buckets,
      empty: total === 0
    },
    encodingToFirstReviewLag: {
      sampleSize: lagSamples.length,
      medianMs: lagSamples.length >= 3 ? median(lagSamples) : null,
      emptyMessage: lagSamples.length >= 3
        ? null
        : 'Not enough data yet (need 3+ consolidated cards that have been reviewed)'
    },
    teachBlockReadTime: {
      sampleSize: teachReadSamples.length,
      medianMs: teachReadSamples.length >= 3 ? median(teachReadSamples) : null,
      emptyMessage: teachReadSamples.length >= 3 ? null : 'Not enough data yet'
    },
    groundingPassRate: {
      sampleSize: groundingTotal,
      geminiCount,
      fallbackCount,
      geminiPct: groundingTotal > 0 ? Math.round((geminiCount / groundingTotal) * 100) : 0,
      fallbackPct: groundingTotal > 0 ? Math.round((fallbackCount / groundingTotal) * 100) : 0,
      emptyMessage: groundingTotal > 0 ? null : 'Not enough data yet'
    },
    successiveRelearningFromLearn: {
      count: relearningCount
    }
  };
}

export function renderLearnStats(root: HTMLElement, stats: LearnStats): void {
  const coverage = stats.encodingCoverage;
  const distribution = stats.consolidationRatingDistribution;
  const lag = stats.encodingToFirstReviewLag;
  const teach = stats.teachBlockReadTime;
  const grounding = stats.groundingPassRate;
  const relearning = stats.successiveRelearningFromLearn;

  const ring = renderRing(coverage.pct);
  const distBar = renderDistributionBar(distribution);

  root.innerHTML = `
    <section class="learn-stats" aria-label="Learn statistics">
      <article class="learn-stats-card">
        <h3 class="learn-stats-label">Encoding Coverage</h3>
        <div class="learn-stats-main learn-stats-main-with-chart">
          ${ring}
          <div class="learn-stats-main-value">${coverage.empty ? '—' : `${coverage.pct}%`}</div>
        </div>
        <p class="learn-stats-sub">${coverage.empty
          ? 'No cards in this course yet'
          : `${coverage.consolidated} of ${coverage.total} cards consolidated · ${coverage.pct}%`}</p>
      </article>

      <article class="learn-stats-card">
        <h3 class="learn-stats-label">Consolidation Rating Distribution</h3>
        <div class="learn-stats-main">${distribution.empty ? '—' : distribution.total}</div>
        ${distribution.empty
          ? '<p class="learn-stats-sub">No ratings yet</p>'
          : `<div>${distBar}<div class="learn-stats-dist-legend">${renderDistributionLegend(distribution)}</div></div>`}
      </article>

      <article class="learn-stats-card">
        <h3 class="learn-stats-label">Encoding to First Review Lag</h3>
        <div class="learn-stats-main">${lag.medianMs == null ? '—' : formatDuration(lag.medianMs)}</div>
        <p class="learn-stats-sub">${lag.emptyMessage || `Median over ${lag.sampleSize} cards`}</p>
      </article>

      <article class="learn-stats-card">
        <h3 class="learn-stats-label">Teach-Block Read Time</h3>
        <div class="learn-stats-main">${teach.medianMs == null ? '—' : `${(teach.medianMs / 1000).toFixed(1)} sec`}</div>
        <p class="learn-stats-sub">${teach.emptyMessage || `Median ${(teach.medianMs! / 1000).toFixed(1)} sec reading teach blocks`}</p>
      </article>

      <article class="learn-stats-card">
        <h3 class="learn-stats-label">Grounding Pass Rate</h3>
        <div class="learn-stats-main">${grounding.sampleSize > 0 ? `${grounding.geminiPct}%` : '—'}</div>
        <p class="learn-stats-sub">${grounding.emptyMessage || `${grounding.geminiPct}% grounded by Gemini · ${grounding.fallbackPct}% density fallback`}</p>
      </article>

      <article class="learn-stats-card">
        <h3 class="learn-stats-label">Successive Relearning Triggers from Learn</h3>
        <div class="learn-stats-main">${relearning.count}</div>
        <p class="learn-stats-sub">${relearning.count} ${relearning.count === 1 ? 'card' : 'cards'} queued from Learn</p>
      </article>
    </section>
  `;
}

function getRecentCourseSegments(sessions: LearnSessionRecord[], courseId: string, limit: number): Array<{ teachReadMs?: number; groundingSource?: 'gemini' | 'fallback' }> {
  const out: Array<{ teachReadMs?: number; groundingSource?: 'gemini' | 'fallback' }> = [];
  for (let i = sessions.length - 1; i >= 0 && out.length < limit; i--) {
    const session = sessions[i];
    if (!session || session.course !== courseId || !Array.isArray(session.segments)) continue;
    for (let j = session.segments.length - 1; j >= 0 && out.length < limit; j--) {
      const segment = session.segments[j];
      out.push({
        teachReadMs: segment?.teachReadMs,
        groundingSource: segment?.groundingSource
      });
    }
  }
  return out;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatDuration(ms: number): string {
  const sec = 1000;
  const min = 60 * sec;
  const hour = 60 * min;
  const day = 24 * hour;

  if (ms < min) return `${(ms / sec).toFixed(1)} sec`;
  if (ms < hour) return `${(ms / min).toFixed(1)} min`;
  if (ms < day) return `${(ms / hour).toFixed(1)} hours`;
  return `${(ms / day).toFixed(1)} days`;
}

function renderRing(percent: number): string {
  const size = 54;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference * (1 - clamped / 100);

  return `<svg class="learn-stats-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" class="learn-stats-ring-track"></circle>
    <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" class="learn-stats-ring-fill" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle>
  </svg>`;
}

function renderDistributionBar(distribution: LearnStats['consolidationRatingDistribution']): string {
  const total = Math.max(1, distribution.total);
  const segments = [
    { key: 'Again', count: distribution.buckets.again, color: 'var(--accent-danger)' },
    { key: 'Hard', count: distribution.buckets.hard, color: 'var(--accent-warning)' },
    { key: 'Good', count: distribution.buckets.good, color: 'var(--accent-primary)' },
    { key: 'Easy', count: distribution.buckets.easy, color: 'var(--accent-success)' },
    { key: 'Not yet rated', count: distribution.buckets.unrated, color: 'var(--surface-2)' }
  ];

  const bars = segments
    .map((segment) => {
      const width = (segment.count / total) * 100;
      return `<span class="learn-stats-dist-segment" style="width:${width}%;background:${segment.color};" title="${segment.key}: ${segment.count}" aria-label="${segment.key}: ${segment.count}"></span>`;
    })
    .join('');

  return `<div class="learn-stats-dist-bar" role="img" aria-label="Consolidation rating distribution">${bars}</div>`;
}

function renderDistributionLegend(distribution: LearnStats['consolidationRatingDistribution']): string {
  return [
    ['Again', distribution.buckets.again],
    ['Hard', distribution.buckets.hard],
    ['Good', distribution.buckets.good],
    ['Easy', distribution.buckets.easy],
    ['Not yet rated', distribution.buckets.unrated]
  ]
    .map(([label, count]) => `<span>${label}: ${count}</span>`)
    .join('');
}

(globalThis as typeof globalThis & { __studyEngineLearnStats?: Record<string, unknown> }).__studyEngineLearnStats = {
  computeLearnStats,
  renderLearnStats
};

import { getLevelInfo, RANKS, xpForLevel, MAX_LEVEL } from './xp-level-system';
import type { StatsData, CalibrationData, Settings, DragonState } from './types';

export type TimeBucket = 'morning' | 'afternoon' | 'evening' | 'night';

export interface TimeBucketStats {
  totalRatings: number;
  ratingSum: number;
  sessions: number;
}

export interface TimeOfDayStats {
  morning: TimeBucketStats;
  afternoon: TimeBucketStats;
  evening: TimeBucketStats;
  night: TimeBucketStats;
}

export interface TimeOfDayInsight {
  bestBucket: TimeBucket;
  bestAvg: number;
  worstBucket: TimeBucket;
  worstAvg: number;
  bucketAverages: Record<TimeBucket, number | null>;
  hasEnoughData: boolean;
  icons: Record<TimeBucket, string>;
  labels: Record<TimeBucket, string>;
}

export interface XPPopoverData {
  level: number;
  rank: string;
  rankIcon: string;
  rankColour: string;
  progressPct: number;
  xpIntoLevel: number;
  xpNeededInLevel: number;
  totalXP: number;
  isMaxLevel: boolean;
  nextRank: string | null;
  nextRankIcon: string | null;
  xpToNextRank: number;
  streakDays: number;
  totalReviews: number;
  totalStudyTimeFormatted: string;
  avgRating: number | null;
  dailyXP: number;
  dailyGoal: number;
  dailyProgressPct: number;
  timeOfDay: TimeOfDayInsight;
}

const DEFAULT_TIME_OF_DAY: TimeOfDayStats = {
  morning: { totalRatings: 0, ratingSum: 0, sessions: 0 },
  afternoon: { totalRatings: 0, ratingSum: 0, sessions: 0 },
  evening: { totalRatings: 0, ratingSum: 0, sessions: 0 },
  night: { totalRatings: 0, ratingSum: 0, sessions: 0 },
};

const ICONS: Record<TimeBucket, string> = {
  morning: '🌅',
  afternoon: '☀️',
  evening: '🌆',
  night: '🌙',
};

const LABELS: Record<TimeBucket, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

export function getTimeBucket(hour: number): TimeBucket {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

export function computeTimeOfDayInsight(timeOfDay: TimeOfDayStats): TimeOfDayInsight {
  const buckets: TimeBucket[] = ['morning', 'afternoon', 'evening', 'night'];
  const bucketAverages: Record<TimeBucket, number | null> = {
    morning: null,
    afternoon: null,
    evening: null,
    night: null,
  };

  const eligible: Array<{ bucket: TimeBucket; avg: number }> = [];
  for (const bucket of buckets) {
    const stat = timeOfDay[bucket];
    if (stat.totalRatings >= 5) {
      const avg = stat.ratingSum / Math.max(1, stat.totalRatings);
      bucketAverages[bucket] = avg;
      eligible.push({ bucket, avg });
    }
  }

  const hasEnoughData = eligible.length >= 2;
  const sorted = eligible.slice().sort((a, b) => b.avg - a.avg);
  const best = sorted[0] ?? { bucket: 'morning' as TimeBucket, avg: 0 };
  const worst = sorted[sorted.length - 1] ?? best;

  return {
    bestBucket: best.bucket,
    bestAvg: best.avg,
    worstBucket: worst.bucket,
    worstAvg: worst.avg,
    bucketAverages,
    hasEnoughData,
    icons: ICONS,
    labels: LABELS,
  };
}

export function formatStudyTime(ms: number): string {
  const safeMs = Math.max(0, Math.floor(ms || 0));
  const totalMinutes = Math.floor(safeMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function computePopoverData(args: {
  totalXP: number;
  stats: StatsData & { totalStudyTimeMs?: number; timeOfDay?: TimeOfDayStats };
  calibration: CalibrationData;
  settings: Partial<Settings>;
  dragon: DragonState;
  todayISO: string;
}): XPPopoverData {
  const levelInfo = getLevelInfo(args.totalXP);
  const currentRank = RANKS.find((r) => levelInfo.level >= r.minLevel && levelInfo.level <= r.maxLevel);
  const nextRankInfo = currentRank ? RANKS[RANKS.indexOf(currentRank) + 1] : null;

  const nextRank = levelInfo.level >= MAX_LEVEL || !nextRankInfo ? null : nextRankInfo.rank;
  const nextRankIcon = levelInfo.level >= MAX_LEVEL || !nextRankInfo ? null : nextRankInfo.icon;
  const xpToNextRank = levelInfo.level >= MAX_LEVEL || !nextRankInfo
    ? 0
    : Math.max(0, xpForLevel(nextRankInfo.minLevel) - args.totalXP);

  const history = args.calibration.history || [];
  const recent = history.slice(-50);
  const avgRating = recent.length
    ? recent.reduce((sum, record) => sum + (record.rating || 0), 0) / recent.length
    : null;

  const dailyXP = (args.stats.history || [])
    .filter((h) => h.date === args.todayISO)
    .reduce((sum, h) => sum + (h.xp || 0), 0);
  const dailyGoal = args.settings.dailyGoal ?? 50;
  const dailyProgressPct = dailyGoal > 0 ? Math.min(100, (dailyXP / dailyGoal) * 100) : 100;

  return {
    level: levelInfo.level,
    rank: levelInfo.rank,
    rankIcon: levelInfo.rankIcon,
    rankColour: levelInfo.rankColour,
    progressPct: levelInfo.progressPct,
    xpIntoLevel: levelInfo.xpIntoLevel,
    xpNeededInLevel: levelInfo.xpNeededInLevel,
    totalXP: args.totalXP,
    isMaxLevel: levelInfo.isMaxLevel,
    nextRank,
    nextRankIcon,
    xpToNextRank,
    streakDays: args.stats.streakDays || 0,
    totalReviews: args.stats.totalReviews || 0,
    totalStudyTimeFormatted: formatStudyTime(args.stats.totalStudyTimeMs || 0),
    avgRating: avgRating == null ? null : Math.round(avgRating * 10) / 10,
    dailyXP,
    dailyGoal,
    dailyProgressPct,
    timeOfDay: computeTimeOfDayInsight(args.stats.timeOfDay || DEFAULT_TIME_OF_DAY),
  };
}

export function getSessionTimeBias(
  timeOfDay: TimeOfDayStats,
  currentHour: number
): { bias: 'new_heavy' | 'review_heavy' | 'balanced'; reason: string } {
  const currentBucket = getTimeBucket(currentHour);
  const insight = computeTimeOfDayInsight(timeOfDay);
  if (!insight.hasEnoughData) {
    return { bias: 'balanced', reason: 'Balanced session' };
  }
  if (currentBucket === insight.bestBucket) {
    return { bias: 'new_heavy', reason: 'Peak hours — prioritising new and harder cards' };
  }
  if (currentBucket === insight.worstBucket) {
    return { bias: 'review_heavy', reason: 'Off-peak — focusing on review and consolidation' };
  }
  return { bias: 'balanced', reason: 'Balanced session' };
}

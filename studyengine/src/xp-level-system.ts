/**
 * XP Level System - Pure functions for computing levels and ranks from XP totals.
 * No DOM operations, no SyncEngine calls. The monolith handles persistence and rendering.
 */

export interface LevelInfo {
  level: number; // 1–50
  rank: string; // "Scholar", "Adept", etc.
  rankIcon: string; // emoji
  rankColour: string; // hex
  currentXP: number; // total XP
  xpIntoLevel: number; // XP progress within current level
  xpForNextLevel: number; // XP needed for next level (total for that level threshold)
  xpNeededInLevel: number; // gap between current and next level thresholds
  progressPct: number; // 0–100 (percentage through current level)
  isMaxLevel: boolean;
}

export interface RankInfo {
  rank: string;
  icon: string;
  colour: string;
}

export const MAX_LEVEL = 50;

export const RANKS: Array<{ minLevel: number; maxLevel: number; rank: string; icon: string; colour: string }> = [
  { minLevel: 1, maxLevel: 5, rank: 'Novice', icon: '📖', colour: '#6b7280' },
  { minLevel: 6, maxLevel: 10, rank: 'Apprentice', icon: '📘', colour: '#3b82f6' },
  { minLevel: 11, maxLevel: 15, rank: 'Scholar', icon: '🎓', colour: '#8b5cf6' },
  { minLevel: 16, maxLevel: 20, rank: 'Adept', icon: '⚡', colour: '#06b6d4' },
  { minLevel: 21, maxLevel: 25, rank: 'Sage', icon: '🌿', colour: '#10b981' },
  { minLevel: 26, maxLevel: 30, rank: 'Expert', icon: '🔥', colour: '#f59e0b' },
  { minLevel: 31, maxLevel: 35, rank: 'Master', icon: '⚔️', colour: '#ef4444' },
  { minLevel: 36, maxLevel: 40, rank: 'Grandmaster', icon: '💎', colour: '#ec4899' },
  { minLevel: 41, maxLevel: 45, rank: 'Luminary', icon: '✨', colour: '#8b5cf6' },
  { minLevel: 46, maxLevel: 50, rank: 'Polymath', icon: '👑', colour: '#f59e0b' },
];

/**
 * XP required to REACH level n (cumulative threshold).
 * Formula: floor(100 * n^1.6) — starts easy, scales meaningfully.
 * Level 1: 0 XP, Level 2: 100 XP, Level 5: 760 XP, Level 10: 3,981 XP
 * Level 25: 31,623 XP, Level 50: 182,056 XP
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level > MAX_LEVEL) return xpForLevel(MAX_LEVEL);
  return Math.floor(100 * Math.pow(level, 1.6));
}

/**
 * Get rank information for a given level.
 */
export function getRankForLevel(level: number): RankInfo {
  const clamped = Math.max(1, Math.min(level, MAX_LEVEL));
  const rankInfo = RANKS.find((r) => clamped >= r.minLevel && clamped <= r.maxLevel);
  if (rankInfo) {
    return {
      rank: rankInfo.rank,
      icon: rankInfo.icon,
      colour: rankInfo.colour,
    };
  }
  return { rank: 'Novice', icon: '📖', colour: '#6b7280' };
}

/**
 * Get full level information for a total XP amount.
 */
export function getLevelInfo(totalXP: number): LevelInfo {
  const xp = Math.max(0, totalXP);

  // Find current level
  let level = 1;
  for (let i = 1; i <= MAX_LEVEL; i++) {
    if (xp >= xpForLevel(i)) {
      level = i;
    } else {
      break;
    }
  }

  const rankInfo = getRankForLevel(level);
  const xpForCurrent = xpForLevel(level);
  const xpForNext = level < MAX_LEVEL ? xpForLevel(level + 1) : xpForCurrent;
  const xpNeededInLevel = xpForNext - xpForCurrent;
  const xpIntoLevel = xp - xpForCurrent;
  const progressPct = xpNeededInLevel > 0 ? Math.min(100, Math.max(0, (xpIntoLevel / xpNeededInLevel) * 100)) : 100;
  const isMaxLevel = level >= MAX_LEVEL;

  return {
    level,
    rank: rankInfo.rank,
    rankIcon: rankInfo.icon,
    rankColour: rankInfo.colour,
    currentXP: xp,
    xpIntoLevel,
    xpForNextLevel: xpForNext,
    xpNeededInLevel,
    progressPct,
    isMaxLevel,
  };
}

/**
 * Check if a level-up occurred between old and new XP values.
 */
export function didLevelUp(
  oldXP: number,
  newXP: number,
): { levelled: boolean; oldLevel: number; newLevel: number; newRank?: string } {
  const oldInfo = getLevelInfo(oldXP);
  const newInfo = getLevelInfo(newXP);

  if (newInfo.level > oldInfo.level) {
    const newRank = newInfo.rank !== oldInfo.rank ? newInfo.rank : undefined;
    return {
      levelled: true,
      oldLevel: oldInfo.level,
      newLevel: newInfo.level,
      newRank,
    };
  }

  return {
    levelled: false,
    oldLevel: oldInfo.level,
    newLevel: newInfo.level,
  };
}

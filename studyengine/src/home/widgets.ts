import type { StudyItem } from '../types';
import type { HomeMode } from './active-course';

/**
 * Phase L0.5b — Dual-mode Home widget data.
 *
 * Pure functions returning labels + values for the existing Home DOM slots.
 * Theory mode echoes pre-computed inputs (preserving existing behaviour
 * byte-for-byte). Language mode computes Words Known from items and emits
 * placeholders for CEFR / Speaking until later phases supply real metrics.
 *
 * The monolith owns DOM writes. These functions never touch the DOM.
 */

export interface HeroSlot {
  /** Inner text for the value node (#statDue / #statStreak / #statRet). */
  value: string;
  /** Label for the sibling label node (.hero-label / .k). Plain text. */
  label: string;
  /** Optional subtitle text for sibling .s node. Undefined leaves it alone. */
  subtitle?: string;
}

export interface HomeHeroStats {
  /** → #statDue (`.hero-stat`) */
  hero: HeroSlot;
  /** → #statStreak (first `.stats-row .stat`) */
  secondary1: HeroSlot;
  /** → #statRet (second `.stats-row .stat`) */
  secondary2: HeroSlot;
  /** → #heroCourseHint */
  courseHint: string;
}

export interface TutorStatsLabels {
  /** Label for the slot containing #tutorStatAvgTurns. */
  slot1Label: string;
  /** Label for the slot containing #tutorStatRecon. */
  slot2Label: string;
  /** Label for the slot containing #tutorStatModel. */
  slot3Label: string;
  /** When defined, monolith overwrites the computed value. Theory mode leaves these undefined. */
  slot1Value?: string;
  slot2Value?: string;
  slot3Value?: string;
  /** Optional subtitle overrides for the `.s` nodes. Theory leaves undefined. */
  slot1Sub?: string;
  slot2Sub?: string;
  slot3Sub?: string;
}

export interface HomeHeroStatsArgs {
  mode: HomeMode;
  items: StudyItem[];
  /** Pre-computed by caller for theory mode. Ignored in language mode. */
  theoryDueCount: number;
  theoryMasteredCount: number;
  /** Average retention 0–100 integer, or null when not enough data. */
  theoryAvgRetentionPct: number | null;
}

const WORDS_KNOWN_THRESHOLD_DAYS = 21;

export function homeHeroStats(args: HomeHeroStatsArgs): HomeHeroStats {
  const { mode, items, theoryDueCount, theoryMasteredCount, theoryAvgRetentionPct } = args;

  if (mode.mode === 'language') {
    const courseName = mode.course.name;
    let wordsKnown = 0;
    for (const it of items) {
      if (!it || it.archived) continue;
      if (it.course !== courseName) continue;
      const stab = it.fsrs && typeof it.fsrs.stability === 'number' ? it.fsrs.stability : 0;
      if (stab > WORDS_KNOWN_THRESHOLD_DAYS) wordsKnown++;
    }
    return {
      hero: {
        value: String(wordsKnown),
        label: 'Words Known',
        subtitle: 'stability > ' + WORDS_KNOWN_THRESHOLD_DAYS + 'd',
      },
      secondary1: {
        value: '\u2014',
        label: 'CEFR Estimate',
        subtitle: 'No data yet',
      },
      secondary2: {
        value: '\u2014',
        label: 'Speaking Score',
        subtitle: 'No data yet',
      },
      courseHint: 'Showing: ' + courseName,
    };
  }

  return {
    hero: {
      value: String(theoryDueCount),
      label: 'Items due',
      subtitle: 'Across all tiers',
    },
    secondary1: {
      value: String(theoryMasteredCount),
      label: 'Mastered',
      subtitle: 'stability > 30d',
    },
    secondary2: {
      value: theoryAvgRetentionPct == null ? '\u2014' : theoryAvgRetentionPct + '%',
      label: 'Avg Retention',
      subtitle: 'FSRS retrievability',
    },
    courseHint: 'Across all tiers',
  };
}

export function homeTutorStatsLabels(mode: HomeMode): TutorStatsLabels {
  if (mode.mode === 'language') {
    return {
      slot1Label: 'Conv. Turns / wk',
      slot2Label: 'Recast Rate',
      slot3Label: 'Pron. Confidence',
      slot1Value: '\u2014',
      slot2Value: '\u2014',
      slot3Value: '\u2014',
      slot1Sub: 'No data yet',
      slot2Sub: 'No data yet',
      slot3Sub: 'No data yet',
    };
  }
  return {
    slot1Label: 'Avg dialogue turns',
    slot2Label: 'Reconstruction rate',
    slot3Label: 'Model split',
  };
}

/*
 * Constants Module
 * Pure constants extracted from state.ts — no project imports except types.
 */

import type { AppState, Settings, StudyItem } from './types';

// Worker endpoints
const STUDYENGINE_WORKER_BASE = 'https://widget-sync.lordgrape-widgets.workers.dev/studyengine';
export const TUTOR_ENDPOINT = STUDYENGINE_WORKER_BASE + '/tutor';
export const MEMORY_ENDPOINT = STUDYENGINE_WORKER_BASE + '/memory';
export const PREPARE_ENDPOINT = STUDYENGINE_WORKER_BASE + '/prepare';
export const SYLLABUS_ENDPOINT = STUDYENGINE_WORKER_BASE + '/syllabus';
export const LECTURE_CTX_ENDPOINT = STUDYENGINE_WORKER_BASE + '/lecture-context';
export const GRADE_ENDPOINT = STUDYENGINE_WORKER_BASE + '/grade';
export const LEARN_PLAN_ENDPOINT = STUDYENGINE_WORKER_BASE + '/learn-plan';
export const LEARN_CHECK_ENDPOINT = STUDYENGINE_WORKER_BASE + '/learn-check';
export const TRIAGE_ENDPOINT = STUDYENGINE_WORKER_BASE + '/exam-triage';
export const SESSION_SUMMARY_ENDPOINT = STUDYENGINE_WORKER_BASE + '/session-summary';

// State namespace
export const NS = 'studyengine';

// Default state
export const DEFAULT_STATE: AppState = {
  items: {},
  courses: {},
  subDecks: {},
  learnProgress: {},
  learnSessions: [],
  calibration: { totalSelfRatings: 0, totalActualCorrect: 0, history: [] },
  stats: {
    totalReviews: 0,
    streakDays: 0,
    lastSessionDate: '',
    reviewsByTier: { quickfire: 0, explain: 0, apply: 0, distinguish: 0, mock: 0, worked: 0 }
  }
};

// Default settings
export const DEFAULT_SETTINGS: Settings = {
  desiredRetention: 0.90,
  sessionLimit: 12,
  mockDefaultMins: 10,
  showApplyTimer: true,
  revealMode: 'auto',
  ttsVoice: 'en-US-Studio-O',
  breakReminders: true,
  breakIntervalMins: 25,
  performanceBreaks: true,
  feedbackMode: 'adaptive',
  gamificationMode: 'clean',
  modelOverride: 'adaptive',
  userName: '',
  tutorVoice: 'rigorous'
};

// Tier distribution profiles
export const TIER_PROFILES: Record<string, Record<string, number>> = {
  mc:           { quickfire: 0.48, explain: 0.18, apply: 0.10, distinguish: 0.15, mock: 0.05, worked: 0.04 },
  short_answer: { quickfire: 0.28, explain: 0.33, apply: 0.13, distinguish: 0.13, mock: 0.05, worked: 0.08 },
  essay:        { quickfire: 0.13, explain: 0.22, apply: 0.22, distinguish: 0.13, mock: 0.18, worked: 0.12 },
  mixed:        { quickfire: 0.23, explain: 0.23, apply: 0.18, distinguish: 0.13, mock: 0.13, worked: 0.10 }
};

// Cram tier modifiers
export const CRAM_TIER_MOD: Record<string, Record<string, number>> = {
  critical: { quickfire: 1.6, explain: 1.3, apply: 0.7, distinguish: 0.8, mock: 0.2, worked: 0.4 },
  high:     { quickfire: 1.3, explain: 1.2, apply: 0.9, distinguish: 0.9, mock: 0.5, worked: 0.7 },
  moderate: { quickfire: 1.1, explain: 1.1, apply: 1.0, distinguish: 1.0, mock: 0.8, worked: 0.9 },
  low:      { quickfire: 1.0, explain: 1.0, apply: 1.0, distinguish: 1.0, mock: 1.0, worked: 1.0 }
};

// Bloom stability bonuses
export const BLOOM_STABILITY_BONUS: Record<string, number> = {
  quickfire: 1.0,
  explain: 1.05,
  apply: 1.10,
  distinguish: 1.10,
  mock: 1.15,
  worked: 1.12
};

// Priority system
export const PRIORITY_LEVELS = ['critical', 'high', 'medium', 'low'] as const;
export const PRIORITY_LABELS: Record<string, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
export const PRIORITY_COLORS: Record<string, string> = { critical: '#ef4444', high: '#f59e0b', medium: '#8b5cf6', low: '#6b7280' };
export const PRIORITY_WEIGHT: Record<string, number> = { critical: 3.0, high: 2.0, medium: 1.0, low: 0.5 };
export const CRAM_PRIORITY_BOOST: Record<string, number> = { critical: 1.5, high: 1.2, medium: 1.0, low: 0.7 };

// Exam type labels
export const EXAM_TYPE_LABELS: Record<string, string> = {
  mc: 'Multiple Choice',
  short_answer: 'Short Answer',
  essay: 'Essay',
  mixed: 'Mixed'
};

// Course colors
export const COURSE_COLORS = [
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Teal', value: '#14b8a6' }
];

// FSRS constants
export const FSRS6_DEFAULT_DECAY = 0.1542;
export const DEFAULT_WEIGHTS = [0.2172, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, FSRS6_DEFAULT_DECAY];

// Pure utility
export function deepClone<T>(obj: T): T { return JSON.parse(JSON.stringify(obj || {})); }

/**
 * Get priority for an item
 */
export function getPriority(item: StudyItem): string {
  if (!item || !item.priority) return 'medium';
  return PRIORITY_LEVELS.indexOf(item.priority as typeof PRIORITY_LEVELS[number]) >= 0 ? item.priority : 'medium';
}

/**
 * Get priority weight for scheduling
 */
export function priorityWeight(item: StudyItem, cramActive: boolean): number {
  const p = getPriority(item);
  let base = PRIORITY_WEIGHT[p] || 1.0;
  if (cramActive) base *= (CRAM_PRIORITY_BOOST[p] || 1.0);
  return base;
}

/**
 * Get priority badge HTML
 */
export function priorityBadgeHTML(priority?: string): string {
  const p = priority || 'medium';
  const col = PRIORITY_COLORS[p] || PRIORITY_COLORS.medium;
  const label = PRIORITY_LABELS[p] || 'Medium';
  return '<span style="display:inline-block;padding:2px 7px;border-radius:999px;font-size:7px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#fff;background:' + col + ';">' + label + '</span>';
}

/*
 * State TypeScript Module
 * Phase 3 conversion: types only, ZERO logic changes
 * SACRED: All save/persist logic preserved exactly
 */

import type { StudyItem, Course, AppState, Settings, CalibrationData, Stats } from './types';

// Global declarations for this module
declare const window: Window & typeof globalThis;
declare const document: Document;
declare const SyncEngine: {
  init: (opts: { worker: string; namespaces: string[] }) => Promise<void>;
  get: (ns: string, key: string) => unknown;
  set: (ns: string, key: string, val: unknown) => void;
};
declare const Core: {
  isLowEnd: boolean;
  isDark: boolean;
};
declare function initBackground(canvasId: string, options: Record<string, unknown>): void;

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

// Global state variables
export let w = DEFAULT_WEIGHTS.slice();
export let fsrsInstance: unknown = null;
export let state: AppState | null = null;
export let settings: Settings | null = null;

// Helper functions from other modules
export function deepClone<T>(obj: T): T { return JSON.parse(JSON.stringify(obj || {})); }
declare function isoNow(): string;
declare function saveCourse(course: Course): void;
declare function migrateCoursesPhase6(): void;
declare function tierLabel(tier: string): string;
declare function tierColour(tier: string): string;
declare function toast(msg: string): void;
declare function detectSupportedTiers(item: StudyItem): string[];
declare function reconcileStats(): void;

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

// Initialize fsrsInstance
try {
  if (typeof FSRS !== 'undefined' && (FSRS as unknown as { FSRS?: new (params: unknown) => unknown }).FSRS && (FSRS as unknown as { generatorParameters?: (opts: unknown) => unknown }).generatorParameters) {
    fsrsInstance = new (FSRS as unknown as { FSRS: new (params: unknown) => unknown }).FSRS(
      (FSRS as unknown as { generatorParameters: (opts: unknown) => unknown }).generatorParameters({
        w: DEFAULT_WEIGHTS.slice(),
        request_retention: 0.9,
        enable_fuzz: true
      })
    );
  }
} catch (e) {
  console.warn('ts-fsrs not loaded; inline FSRS only');
}

/**
 * Load state from SyncEngine
 */
export function loadState(): void {
  const items = SyncEngine.get(NS, 'items') as Record<string, StudyItem> | null;
  const courses = SyncEngine.get(NS, 'courses') as Record<string, Course> | null;
  const subDecks = SyncEngine.get(NS, 'subDecks') as AppState['subDecks'] | null;
  const calibration = SyncEngine.get(NS, 'calibration') as CalibrationData | null;
  const stats = SyncEngine.get(NS, 'stats') as Stats | null;
  
  state = deepClone(DEFAULT_STATE);
  if (items && typeof items === 'object') state.items = items;
  if (courses && typeof courses === 'object') state.courses = courses;
  if (subDecks && typeof subDecks === 'object') state.subDecks = subDecks;
  state.learnProgress = (SyncEngine.get(NS, 'learnProgress') as AppState['learnProgress']) || {};
  state.learnSessions = (SyncEngine.get(NS, 'learnSessions') as AppState['learnSessions']) || [];
  if (calibration && typeof calibration === 'object') state.calibration = calibration;
  if (stats && typeof stats === 'object') state.stats = stats;
  
  migrateItems();
  migrateCoursesPhase6();
  migrateSubDecks();
  
  const s = SyncEngine.get(NS, 'settings') as Settings | null;
  settings = deepClone(DEFAULT_SETTINGS);
  if (s && typeof s === 'object') {
    for (const k in s) if (s.hasOwnProperty(k)) (settings as unknown as Record<string, unknown>)[k] = (s as unknown as Record<string, unknown>)[k];
  }
  if (['clean', 'motivated', 'off'].indexOf(settings.gamificationMode) < 0) {
    settings.gamificationMode = 'clean';
  }
}

/**
 * Save state to SyncEngine
 */
export function saveState(): void {
  if (!state || !settings) return;
  SyncEngine.set(NS, 'items', state.items || {});
  SyncEngine.set(NS, 'courses', state.courses || {});
  SyncEngine.set(NS, 'subDecks', state.subDecks || {});
  SyncEngine.set(NS, 'learnProgress', state.learnProgress || {});
  SyncEngine.set(NS, 'learnSessions', state.learnSessions || []);
  SyncEngine.set(NS, 'calibration', state.calibration || deepClone(DEFAULT_STATE.calibration));
  SyncEngine.set(NS, 'stats', state.stats || deepClone(DEFAULT_STATE.stats));
  SyncEngine.set(NS, 'settings', settings || deepClone(DEFAULT_SETTINGS));
}

/**
 * Migrate items to current schema
 */
export function migrateItems(): void {
  if (!state) return;
  let changed = false;
  for (const id in state.items) {
    if (!state.items.hasOwnProperty(id)) continue;
    const it = state.items[id];
    if (!it) continue;
    // Ensure variants field
    if (!it.variants) { it.variants = {}; changed = true; }
    // Auto-create course entry if missing
    if (it.course && !state.courses[it.course]) {
      state.courses[it.course] = {
        id: it.course,
        name: it.course,
        examType: 'mixed',
        examDate: null,
        manualMode: false,
        color: '#8b5cf6',
        created: it.created || isoNow(),
        examWeight: null,
        syllabusContext: null,
        professorValues: null,
        allowedMaterials: null,
        rawSyllabusText: null,
        examFormat: null,
        syllabusKeyTopics: [],
        prepared: false
      };
      changed = true;
    }
    if (it.course && !state.subDecks[it.course]) {
      state.subDecks[it.course] = { subDecks: {} };
      changed = true;
    }
  }
  if (changed) saveState();
}

/**
 * Migrate subdecks to current schema
 */
export function migrateSubDecks(): void {
  if (!state) return;
  state.subDecks = state.subDecks || {};
  let changed = false;
  for (const cName in state.courses) {
    if (!state.courses.hasOwnProperty(cName)) continue;
    if (!state.subDecks[cName]) {
      state.subDecks[cName] = { subDecks: {} };
      changed = true;
    }
  }
  for (const id in state.items) {
    if (!state.items.hasOwnProperty(id)) continue;
    const it = state.items[id];
    if (!it) continue;
    if (it.subDeck === undefined) {
      it.subDeck = null;
      changed = true;
    }
  }
  if (changed) saveState();
}

/**
 * Get promotion candidates
 */
export function getPromotionCandidates(courseName: string): Array<{ id: string; item: StudyItem; currentTier: string; suggestedTier: string }> {
  if (!state) return [];
  const candidates: Array<{ id: string; item: StudyItem; currentTier: string; suggestedTier: string }> = [];
  const TIER_ORDER = ['quickfire', 'explain', 'apply', 'distinguish', 'mock'];
  for (const id in state.items) {
    if (!state.items.hasOwnProperty(id)) continue;
    const it = state.items[id];
    if (!it || it.archived || !it.fsrs) continue;
    if (courseName && courseName !== 'All' && it.course !== courseName) continue;
    const tier = it.tier || 'quickfire';
    const tierIdx = TIER_ORDER.indexOf(tier);
    if (tierIdx >= 3) continue;
    if ((it.fsrs.stability || 0) > 30 && (it.fsrs.lapses || 0) === 0 && (it.fsrs.reps || 0) >= 4) {
      const supported = detectSupportedTiers(it);
      let nextTier: string | null = null;
      for (let i = tierIdx + 1; i < TIER_ORDER.length; i++) {
        if (supported.indexOf(TIER_ORDER[i]) >= 0) { nextTier = TIER_ORDER[i]; break; }
      }
      if (nextTier) {
        candidates.push({ id: id, item: it, currentTier: tier, suggestedTier: nextTier });
      }
    }
  }
  return candidates;
}

/**
 * Promote item to next tier
 */
export function promoteItemTier(itemId: string, newTier: string): void {
  if (!state) return;
  const it = state.items[itemId];
  if (!it) return;
  it.lastTier = it.tier;
  it.tier = newTier as typeof it.tier;
  if (it.fsrs && it.fsrs.stability) {
    it.fsrs.stability = Math.max(1, it.fsrs.stability * 0.6);
    it.fsrs.due = isoNow();
  }
  saveState();
  toast('Promoted to ' + tierLabel(newTier).toUpperCase());
}

/**
 * Get tier support badge HTML
 */
export function tierSupportBadgeHTML(tiers: string[]): string {
  if (!tiers || !tiers.length) return '';
  let h = '<div class="tier-support-badge"><span class="tsb-label">Supports</span>';
  tiers.forEach((t) => {
    const col = tierColour(t);
    h += '<span class="tsb-tier" style="background:' + col + ';">' + tierLabel(t) + '</span>';
  });
  h += '</div>';
  return h;
}

// Attach to window for .js consumers
const win = window as unknown as Record<string, unknown>;

win.NS = NS;
win.DEFAULT_STATE = DEFAULT_STATE;
win.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
win.TIER_PROFILES = TIER_PROFILES;
win.CRAM_TIER_MOD = CRAM_TIER_MOD;
win.BLOOM_STABILITY_BONUS = BLOOM_STABILITY_BONUS;
win.PRIORITY_LEVELS = PRIORITY_LEVELS;
win.PRIORITY_LABELS = PRIORITY_LABELS;
win.PRIORITY_COLORS = PRIORITY_COLORS;
win.PRIORITY_WEIGHT = PRIORITY_WEIGHT;
win.CRAM_PRIORITY_BOOST = CRAM_PRIORITY_BOOST;
win.EXAM_TYPE_LABELS = EXAM_TYPE_LABELS;
win.COURSE_COLORS = COURSE_COLORS;
win.FSRS6_DEFAULT_DECAY = FSRS6_DEFAULT_DECAY;
win.DEFAULT_WEIGHTS = DEFAULT_WEIGHTS;
win.w = w;
win.fsrsInstance = fsrsInstance;
win.deepClone = deepClone;
win.getPriority = getPriority;
win.priorityWeight = priorityWeight;
win.priorityBadgeHTML = priorityBadgeHTML;
win.loadState = loadState;
win.saveState = saveState;
win.migrateItems = migrateItems;
win.migrateSubDecks = migrateSubDecks;
win.getPromotionCandidates = getPromotionCandidates;
win.promoteItemTier = promoteItemTier;
win.tierSupportBadgeHTML = tierSupportBadgeHTML;

// Initialize on load
const isEmbedded = (window.self !== window.top);
if (!isEmbedded) document.body.classList.add('standalone');

// SyncEngine init
SyncEngine.init({
  worker: 'https://widget-sync.lordgrape-widgets.workers.dev',
  namespaces: ['dragon', 'clock', 'user', 'studyengine']
});

// Background init
initBackground('bgCanvas', {
  orbCount: isEmbedded ? 2 : 3,
  particleCount: Core.isLowEnd ? (Core.isDark ? 8 : 5) : (Core.isDark ? 18 : 12),
  orbRadius: [80, 140],
  hueRange: [250, 40],
  mouseTracking: true
});

export {};

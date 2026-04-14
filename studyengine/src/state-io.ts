/*
 * State I/O Module
 * loadState, saveState re-export, migrations, promotion helpers.
 * Imports from signals.ts, constants.ts, types.ts, utils.ts, courses.ts.
 * No circular dependencies.
 */

import { items, courses, subDecks, learnProgress, learnSessions, calibration, stats, settings, dragonState, saveState } from './signals';
import { NS, DEFAULT_STATE, DEFAULT_SETTINGS, DEFAULT_WEIGHTS, FSRS6_DEFAULT_DECAY, deepClone } from './constants';
import { normalizeCoursePhase6, saveCourse, detectSupportedTiers } from './courses';
import { isoNow, tierLabel, tierColour, toast } from './utils';
import type { StudyItem, Course, CalibrationData, Stats, Settings, FSRSModule } from './types';

// External CDN globals
declare const SyncEngine: {
  init: (opts: { worker?: string; namespaces?: string[] }) => Promise<void>;
  get: (ns: string, key: string) => unknown;
  set: (ns: string, key: string, val: unknown) => void;
};
declare const Core: {
  isLowEnd: boolean;
  isDark: boolean;
};
declare function initBackground(canvasId: string, options: Record<string, unknown>): void;
declare const FSRS: unknown;

/**
 * Load state from SyncEngine into signals
 */
export function loadState(): void {
  const rawItems = SyncEngine.get(NS, 'items') as Record<string, StudyItem> | null;
  const rawCourses = SyncEngine.get(NS, 'courses') as Record<string, Course> | null;
  const rawSubDecks = SyncEngine.get(NS, 'subDecks') as Record<string, { subDecks: Record<string, unknown> }> | null;
  const rawCalibration = SyncEngine.get(NS, 'calibration') as CalibrationData | null;
  const rawStats = SyncEngine.get(NS, 'stats') as Stats | null;

  items.value = (rawItems && typeof rawItems === 'object') ? rawItems : {};
  courses.value = (rawCourses && typeof rawCourses === 'object') ? rawCourses : {};
  subDecks.value = (rawSubDecks && typeof rawSubDecks === 'object') ? rawSubDecks as typeof subDecks.value : {};
  learnProgress.value = (SyncEngine.get(NS, 'learnProgress') as typeof learnProgress.value) || {};
  learnSessions.value = (SyncEngine.get(NS, 'learnSessions') as typeof learnSessions.value) || [];
  calibration.value = (rawCalibration && typeof rawCalibration === 'object') ? rawCalibration : deepClone(DEFAULT_STATE.calibration);
  stats.value = (rawStats && typeof rawStats === 'object') ? rawStats : deepClone(DEFAULT_STATE.stats);

  migrateItems();
  migrateCoursesPhase6();
  migrateSubDecks();

  const s = SyncEngine.get(NS, 'settings') as Settings | null;
  const merged = deepClone(DEFAULT_SETTINGS);
  if (s && typeof s === 'object') {
    for (const k in s) {
      if (s.hasOwnProperty(k)) (merged as unknown as Record<string, unknown>)[k] = (s as unknown as Record<string, unknown>)[k];
    }
  }
  if (['clean', 'motivated', 'off'].indexOf(merged.gamificationMode) < 0) {
    merged.gamificationMode = 'clean';
  }
  settings.value = merged;

  // Dragon namespace
  const dragonData = SyncEngine.get('dragon', 'dragon');
  dragonState.value = (dragonData as typeof dragonState.value) || ({} as typeof dragonState.value);
}

/**
 * Migrate items to current schema
 */
function migrateItems(): void {
  const its = items.value;
  const crs = courses.value;
  let changed = false;
  for (const id in its) {
    if (!its.hasOwnProperty(id)) continue;
    const it = its[id];
    if (!it) continue;
    if (!it.variants) { it.variants = {}; changed = true; }
    if (it.course && !crs[it.course]) {
      crs[it.course] = {
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
    const sd = subDecks.value;
    if (it.course && !sd[it.course]) {
      sd[it.course] = { subDecks: {} };
      changed = true;
    }
  }
  if (changed) {
    items.value = { ...its };
    courses.value = { ...crs };
    subDecks.value = { ...subDecks.value };
    saveState();
  }
}

/**
 * Migrate courses to Phase 6 schema
 */
function migrateCoursesPhase6(): void {
  const crs = courses.value;
  let changed = false;
  for (const k in crs) {
    if (!crs.hasOwnProperty(k)) continue;
    const c0 = crs[k];
    const snap = JSON.stringify(c0);
    normalizeCoursePhase6(c0);
    if (!Array.isArray(c0.modules)) { c0.modules = []; }
    if (JSON.stringify(c0) !== snap) changed = true;
  }
  if (changed) {
    courses.value = { ...crs };
    saveState();
  }
}

/**
 * Migrate subdecks to current schema
 */
function migrateSubDecks(): void {
  const its = items.value;
  const crs = courses.value;
  const sd = subDecks.value;
  let changed = false;
  for (const cName in crs) {
    if (!crs.hasOwnProperty(cName)) continue;
    if (!sd[cName]) {
      sd[cName] = { subDecks: {} };
      changed = true;
    }
  }
  for (const id in its) {
    if (!its.hasOwnProperty(id)) continue;
    const it = its[id];
    if (!it) continue;
    if (it.subDeck === undefined) {
      it.subDeck = null;
      changed = true;
    }
  }
  if (changed) {
    items.value = { ...its };
    subDecks.value = { ...sd };
    saveState();
  }
}

/**
 * Load optimized FSRS weights from SyncEngine
 */
export function loadOptimizedWeights(): void {
  const saved = SyncEngine.get(NS, 'optimizedWeights') as number[] | null;
  const TS: FSRSModule | null = typeof FSRS !== 'undefined' ? (FSRS as unknown as FSRSModule) : null;
  if (!saved || !Array.isArray(saved) || saved.length < 19 || !TS || !TS.migrateParameters) return;
  const padded = saved.slice();
  if (padded.length === 19) {
    padded.push(0.0658, FSRS6_DEFAULT_DECAY);
  }
  try {
    const newW = TS.migrateParameters(padded);
    (window as unknown as { w: number[] }).w = newW;
    if (TS.FSRS && TS.generatorParameters) {
      const newInstance = new TS.FSRS(TS.generatorParameters({
        w: newW,
        request_retention: settings.value.desiredRetention || 0.9,
        enable_fuzz: true
      }));
      (window as unknown as { fsrsInstance: unknown }).fsrsInstance = newInstance;
    }
  } catch (e) {}
}

/**
 * Get promotion candidates
 */
export function getPromotionCandidates(courseName: string): Array<{ id: string; item: StudyItem; currentTier: string; suggestedTier: string }> {
  const its = items.value;
  const candidates: Array<{ id: string; item: StudyItem; currentTier: string; suggestedTier: string }> = [];
  const TIER_ORDER = ['quickfire', 'explain', 'apply', 'distinguish', 'mock'];
  for (const id in its) {
    if (!its.hasOwnProperty(id)) continue;
    const it = its[id];
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
  const its = items.value;
  const it = its[itemId];
  if (!it) return;
  it.lastTier = it.tier;
  it.tier = newTier as typeof it.tier;
  if (it.fsrs && it.fsrs.stability) {
    it.fsrs.stability = Math.max(1, it.fsrs.stability * 0.6);
    it.fsrs.due = isoNow();
  }
  items.value = { ...its };
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

/**
 * Initialize SyncEngine and background on load
 */
export function initSyncAndBackground(): void {
  if (typeof window === 'undefined') return;
  const isEmbedded = (window.self !== window.top);
  if (!isEmbedded) document.body.classList.add('standalone');

  try {
    SyncEngine.init({
      worker: 'https://widget-sync.lordgrape-widgets.workers.dev',
      namespaces: ['dragon', 'clock', 'user', 'studyengine']
    });
  } catch (e) {
    console.warn('[StudyEngine] SyncEngine.init failed:', e);
  }

  try {
    initBackground('bgCanvas', {
      orbCount: isEmbedded ? 2 : 3,
      particleCount: (typeof Core !== 'undefined' && Core.isLowEnd) ? ((typeof Core !== 'undefined' && Core.isDark) ? 8 : 5) : ((typeof Core !== 'undefined' && Core.isDark) ? 18 : 12),
      orbRadius: [80, 140],
      hueRange: [250, 40],
      mouseTracking: true
    });
  } catch (e) {
    console.warn('[StudyEngine] initBackground failed:', e);
  }
}

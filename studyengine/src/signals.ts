/*
 * Signals TypeScript Module
 * Phase 4: Preact signals reactive bridge for SyncEngine state
 */

import { signal, computed, effect } from '@preact/signals';
import type { AppState, Settings, StudyItem, Course, SessionState, DragonState, CalibrationData, Stats, LearnProgress, LearnSession } from './types';

// Hydration gate - prevents persisting empty defaults before SyncEngine loads
const hydrated = signal(false);

// Core state signals — populated from SyncEngine after load
export const items = signal<Record<string, StudyItem>>({});
export const courses = signal<Record<string, Course>>({});
export const subDecks = signal<AppState['subDecks']>({});
export const learnProgress = signal<Record<string, Record<string, LearnProgress>>>({});
export const learnSessions = signal<LearnSession[]>([]);
export const calibration = signal<CalibrationData>({ totalSelfRatings: 0, totalActualCorrect: 0, history: [] });
export const stats = signal<Stats>({ totalReviews: 0, streakDays: 0, lastSessionDate: '', reviewsByTier: { quickfire: 0, explain: 0, apply: 0, distinguish: 0, mock: 0, worked: 0 } });
export const settings = signal<Settings>({} as Settings);

// Dragon state (synced from dragon namespace)
export const dragonState = signal<DragonState>({} as DragonState);

// Session state
export const sessionState = signal<SessionState | null>(null);

// UI signals
export const currentView = signal<string>('dashboard');
export const selectedCourse = signal<Course | null>(null);
export const selectedTopic = signal<string | null>(null);
export const sidebarOpen = signal<boolean>(true);

// Computed
export const itemsArray = computed(() => Object.values(items.value));
export const coursesArray = computed(() => Object.values(courses.value));

export const dueItems = computed(() => {
  const now = new Date();
  return itemsArray.value.filter(item => {
    if (!item.fsrs || !item.fsrs.due) return true;
    return new Date(item.fsrs.due) <= now;
  });
});

export const courseMap = computed(() => {
  const map = new Map<string, Course>();
  coursesArray.value.forEach(c => {
    if (c.name) map.set(c.name, c);
  });
  return map;
});

// Topics for selected course
export const topicsForSelectedCourse = computed(() => {
  if (!selectedCourse.value) return [];
  const courseName = selectedCourse.value.name;
  const topics: Record<string, number> = {};
  itemsArray.value.forEach(it => {
    if (it.course === courseName) {
      const t = (it.topic || '').trim();
      if (t) topics[t] = (topics[t] || 0) + 1;
    }
  });
  return Object.keys(topics).sort((a, b) => {
    if (topics[b] !== topics[a]) return topics[b] - topics[a];
    return a.localeCompare(b);
  });
});

// Hydration from SyncEngine
export function hydrateFromSync(): void {
  const NS = 'studyengine';
  const DRAGON_NS = 'dragon';
  
  // StudyEngine namespace
  const itemsData = (window as unknown as { SyncEngine?: { get: (ns: string, key: string) => unknown } }).SyncEngine?.get(NS, 'items');
  const coursesData = (window as unknown as { SyncEngine?: { get: (ns: string, key: string) => unknown } }).SyncEngine?.get(NS, 'courses');
  const subDecksData = (window as unknown as { SyncEngine?: { get: (ns: string, key: string) => unknown } }).SyncEngine?.get(NS, 'subDecks');
  const learnProgressData = (window as unknown as { SyncEngine?: { get: (ns: string, key: string) => unknown } }).SyncEngine?.get(NS, 'learnProgress');
  const learnSessionsData = (window as unknown as { SyncEngine?: { get: (ns: string, key: string) => unknown } }).SyncEngine?.get(NS, 'learnSessions');
  const calibrationData = (window as unknown as { SyncEngine?: { get: (ns: string, key: string) => unknown } }).SyncEngine?.get(NS, 'calibration');
  const statsData = (window as unknown as { SyncEngine?: { get: (ns: string, key: string) => unknown } }).SyncEngine?.get(NS, 'stats');
  const settingsData = (window as unknown as { SyncEngine?: { get: (ns: string, key: string) => unknown } }).SyncEngine?.get(NS, 'settings');
  
  // Dragon namespace
  const dragonData = (window as unknown as { SyncEngine?: { get: (ns: string, key: string) => unknown } }).SyncEngine?.get(DRAGON_NS, 'dragon');
  
  items.value = (itemsData as Record<string, StudyItem>) || {};
  courses.value = (coursesData as Record<string, Course>) || {};
  subDecks.value = (subDecksData as AppState['subDecks']) || {};
  learnProgress.value = (learnProgressData as Record<string, Record<string, LearnProgress>>) || {};
  learnSessions.value = (learnSessionsData as LearnSession[]) || [];
  calibration.value = (calibrationData as CalibrationData) || { totalSelfRatings: 0, totalActualCorrect: 0, history: [] };
  stats.value = (statsData as Stats) || { totalReviews: 0, streakDays: 0, lastSessionDate: '', reviewsByTier: { quickfire: 0, explain: 0, apply: 0, distinguish: 0, mock: 0, worked: 0 } };
  settings.value = (settingsData as Settings) || {} as Settings;
  dragonState.value = (dragonData as DragonState) || {} as DragonState;
  
  hydrated.value = true;
}

// Persist to SyncEngine (gated by hydration)
effect(() => {
  if (!hydrated.value) return;
  const NS = 'studyengine';
  const se = (window as unknown as { SyncEngine?: { set: (ns: string, key: string, val: unknown) => void } }).SyncEngine;
  if (!se) return;
  se.set(NS, 'items', items.value);
});

effect(() => {
  if (!hydrated.value) return;
  const NS = 'studyengine';
  const se = (window as unknown as { SyncEngine?: { set: (ns: string, key: string, val: unknown) => void } }).SyncEngine;
  if (!se) return;
  se.set(NS, 'courses', courses.value);
});

effect(() => {
  if (!hydrated.value) return;
  const NS = 'studyengine';
  const se = (window as unknown as { SyncEngine?: { set: (ns: string, key: string, val: unknown) => void } }).SyncEngine;
  if (!se) return;
  se.set(NS, 'subDecks', subDecks.value);
});

effect(() => {
  if (!hydrated.value) return;
  const NS = 'studyengine';
  const se = (window as unknown as { SyncEngine?: { set: (ns: string, key: string, val: unknown) => void } }).SyncEngine;
  if (!se) return;
  se.set(NS, 'learnProgress', learnProgress.value);
});

effect(() => {
  if (!hydrated.value) return;
  const NS = 'studyengine';
  const se = (window as unknown as { SyncEngine?: { set: (ns: string, key: string, val: unknown) => void } }).SyncEngine;
  if (!se) return;
  se.set(NS, 'learnSessions', learnSessions.value);
});

effect(() => {
  if (!hydrated.value) return;
  const NS = 'studyengine';
  const se = (window as unknown as { SyncEngine?: { set: (ns: string, key: string, val: unknown) => void } }).SyncEngine;
  if (!se) return;
  se.set(NS, 'calibration', calibration.value);
});

effect(() => {
  if (!hydrated.value) return;
  const NS = 'studyengine';
  const se = (window as unknown as { SyncEngine?: { set: (ns: string, key: string, val: unknown) => void } }).SyncEngine;
  if (!se) return;
  se.set(NS, 'stats', stats.value);
});

effect(() => {
  if (!hydrated.value) return;
  const NS = 'studyengine';
  const se = (window as unknown as { SyncEngine?: { set: (ns: string, key: string, val: unknown) => void } }).SyncEngine;
  if (!se) return;
  se.set(NS, 'settings', settings.value);
});

// Dragon persistence
effect(() => {
  if (!hydrated.value) return;
  const DRAGON_NS = 'dragon';
  const se = (window as unknown as { SyncEngine?: { set: (ns: string, key: string, val: unknown) => void } }).SyncEngine;
  if (!se) return;
  se.set(DRAGON_NS, 'dragon', dragonState.value);
});

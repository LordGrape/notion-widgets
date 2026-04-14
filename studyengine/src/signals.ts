/*
 * Signals TypeScript Module
 * Single source of truth for all reactive state.
 * saveState() is the SINGLE persistence function.
 */

import { signal, computed } from '@preact/signals';
import type { AppState, Settings, StudyItem, Course, SessionState, DragonState, CalibrationData, Stats, LearnProgress, LearnSession } from './types';
import { NS, DEFAULT_STATE, DEFAULT_SETTINGS, deepClone } from './constants';

// External CDN globals
declare const SyncEngine: {
  get: (ns: string, key: string) => unknown;
  set: (ns: string, key: string, val: unknown) => void;
};

// Core state signals — populated from SyncEngine after load
export const items = signal<Record<string, StudyItem>>({});
export const courses = signal<Record<string, Course>>({});
export const subDecks = signal<AppState['subDecks']>({});
export const learnProgress = signal<Record<string, Record<string, LearnProgress>>>({});
export const learnSessions = signal<LearnSession[]>([]);
export const calibration = signal<CalibrationData>(deepClone(DEFAULT_STATE.calibration));
export const stats = signal<Stats>(deepClone(DEFAULT_STATE.stats));
export const settings = signal<Settings>(deepClone(DEFAULT_SETTINGS));

// Dragon state (synced from dragon namespace)
export const dragonState = signal<DragonState>({} as DragonState);

// Session state
export const sessionState = signal<SessionState | null>(null);

// UI signals
export const currentView = signal<string>('dashboard');
export const selectedCourse = signal<Course | null>(null);
export const selectedTopic = signal<string | null>(null);
export const sidebarOpen = signal<boolean>(true);

// Session signals
export const sessionQueue = signal<StudyItem[]>([]);
export const sessionIndex = signal<number>(0);
export const sessionPhase = signal<'question' | 'revealed' | 'rated' | 'restudy' | 'break' | 'complete'>('question');
export const itemStartTime = signal<number>(0);
export const userAnswer = signal<string>('');
export const essayOutlineText = signal<string>('');
export const essayPhase = signal<'outline' | 'writing' | null>(null);
export const sessionXP = signal<number>(0);
export const breakTimeRemaining = signal<number>(0);
export const breakActive = signal<boolean>(false);
export const aiFeedback = signal<unknown>(null);
export const aiRating = signal<number | null>(null);
export const currentShown = signal<boolean>(false);
export const sessionLoops = signal<Record<string, number>>({});
export const sessionReviewsByTier = signal<Record<string, number>>({ quickfire: 0, explain: 0, apply: 0, distinguish: 0, mock: 0, worked: 0 });
export const recentRatings = signal<number[]>([]);
export const sessionStartTime = signal<number>(0);

// Tutor signals
export interface TutorMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export const tutorMessages = signal<TutorMessage[]>([]);
export const tutorLoading = signal<boolean>(false);
export const tutorOpen = signal<boolean>(false);
export const tutorCurrentItem = signal<StudyItem | null>(null);
export const tutorCurrentMode = signal<string>('socratic');

// Learn signals
export interface LearnSessionData {
  course: string;
  topics: string[];
  segments: Array<{
    id: string;
    content: string;
    title?: string;
  }>;
  currentSegmentIndex: number;
  status: 'prime' | 'encode' | 'consolidate' | 'complete';
}

export const learnSession = signal<LearnSessionData | null>(null);
export const learnSegmentIndex = signal<number>(0);
export const learnPhase = signal<'prime' | 'encode' | 'consolidate' | 'complete'>('prime');

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

/**
 * saveState — SINGLE persistence function for the entire app.
 * Reads every signal's .value and writes to SyncEngine.
 */
export function saveState(): void {
  if (typeof SyncEngine === 'undefined') return;
  SyncEngine.set(NS, 'items', { ...items.value });
  SyncEngine.set(NS, 'courses', { ...courses.value });
  SyncEngine.set(NS, 'subDecks', { ...subDecks.value });
  SyncEngine.set(NS, 'learnProgress', { ...learnProgress.value });
  SyncEngine.set(NS, 'learnSessions', [...learnSessions.value]);
  SyncEngine.set(NS, 'calibration', { ...calibration.value });
  SyncEngine.set(NS, 'stats', { ...stats.value });
  SyncEngine.set(NS, 'settings', { ...settings.value });
}

/**
 * saveDragonState — persist dragon namespace separately.
 */
export function saveDragonState(): void {
  if (typeof SyncEngine === 'undefined') return;
  SyncEngine.set('dragon', 'dragon', { ...dragonState.value });
}

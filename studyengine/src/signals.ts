import { signal, computed, effect } from '@preact/signals';
import type { AppState, Settings, StudyItem, Session, Course, ViewId } from './types';

// Worker endpoints (from state.js)
export const STUDYENGINE_WORKER_BASE = 'https://widget-sync.lordgrape-widgets.workers.dev/studyengine';
export const TUTOR_ENDPOINT = STUDYENGINE_WORKER_BASE + '/tutor';
export const MEMORY_ENDPOINT = STUDYENGINE_WORKER_BASE + '/memory';
export const PREPARE_ENDPOINT = STUDYENGINE_WORKER_BASE + '/prepare';
export const SYLLABUS_ENDPOINT = STUDYENGINE_WORKER_BASE + '/syllabus';
export const LECTURE_CTX_ENDPOINT = STUDYENGINE_WORKER_BASE + '/lecture-context';
export const GRADE_ENDPOINT = STUDYENGINE_WORKER_BASE + '/grade';
export const LEARN_PLAN_ENDPOINT = STUDYENGINE_WORKER_BASE + '/learn-plan';
export const LEARN_CHECK_ENDPOINT = STUDYENGINE_WORKER_BASE + '/learn-check';
export const TRIAGE_ENDPOINT = STUDYENGINE_WORKER_BASE + '/exam-triage';

// Default state
export const DEFAULT_STATE: AppState = {
  items: {},
  courses: {},
  subDecks: {},
  learnProgress: {},
  learnSessions: [],
  calibration: {
    totalSelfRatings: 0,
    totalActualCorrect: 0,
    history: []
  },
  stats: {
    totalReviews: 0,
    streakDays: 0,
    lastSessionDate: '',
    reviewsByTier: {
      quickfire: 0,
      explain: 0,
      apply: 0,
      distinguish: 0,
      mock: 0,
      worked: 0
    }
  }
};

export const DEFAULT_SETTINGS: Settings = {
  desiredRetention: 0.9,
  sessionLimit: 12,
  mockDefaultMins: 10,
  showApplyTimer: true,
  revealMode: 'manual',
  ttsVoice: 'en-US-Studio-O',
  breakReminders: true,
  breakIntervalMins: 25,
  performanceBreaks: true,
  feedbackMode: 'immediate',
  gamificationMode: 'motivated',
  modelOverride: '',
  userName: '',
  tutorVoice: 'rigorous'
};

// Primary state signals
export const appState = signal<AppState>(DEFAULT_STATE);
export const settings = signal<Settings>(DEFAULT_SETTINGS);

// UI state signals
export const currentView = signal<ViewId>('dashboard');
export const selectedCourse = signal<string>('All');
export const selectedTopic = signal<string>('All');
export const activeNav = signal<string>('home');

// Session state
export const currentSession = signal<Session | null>(null);

// Sidebar state
export const sidebarSelection = signal<{
  level: 'all' | 'course' | 'module' | 'topic' | 'subdeck';
  course: string | null;
  module: string | null;
  topic: string | null;
  subDeck: string | null;
}>({ level: 'all', course: null, module: null, topic: null, subDeck: null });

export const sidebarExpanded = signal<Record<string, boolean>>({});

// Modal states
export const isSettingsOpen = signal<boolean>(false);
export const isCardModalOpen = signal<boolean>(false);
export const editingItemId = signal<string | null>(null);

// Embedding detection
export const isEmbedded = signal<boolean>(
  typeof window !== 'undefined' && window.self !== window.top
);

// Derived: due items count
export const dueItems = computed(() => {
  const now = Date.now();
  const items = appState.value.items;
  const course = selectedCourse.value;
  
  const result: StudyItem[] = [];
  for (const id in items) {
    if (!Object.prototype.hasOwnProperty.call(items, id)) continue;
    const it = items[id];
    if (!it || it.archived) continue;
    if (course !== 'All' && it.course !== course) continue;
    
    const f = it.fsrs;
    if (!f || !f.lastReview) {
      result.push(it);
    } else if (f.due && new Date(f.due).getTime() <= now) {
      result.push(it);
    }
  }
  return result;
});

export const dueCount = computed(() => dueItems.value.length);

// Derived: total items count
export const totalItems = computed(() => {
  const items = appState.value.items;
  let count = 0;
  for (const id in items) {
    if (!Object.prototype.hasOwnProperty.call(items, id)) continue;
    const it = items[id];
    if (!it || it.archived) continue;
    if (it.course && appState.value.courses[it.course]?.archived) continue;
    count++;
  }
  return count;
});

// Derived: mastered count (stability > 30, no lapses)
export const masteredCount = computed(() => {
  const items = appState.value.items;
  let count = 0;
  for (const id in items) {
    if (!Object.prototype.hasOwnProperty.call(items, id)) continue;
    const it = items[id];
    if (!it || it.archived || !it.fsrs) continue;
    if ((it.fsrs.stability || 0) > 30 && (it.fsrs.lapses || 0) === 0) {
      count++;
    }
  }
  return count;
});

// Derived: courses list (non-archived)
export const coursesList = computed(() => {
  const courses = appState.value.courses;
  const result: Course[] = [];
  for (const key in courses) {
    if (!Object.prototype.hasOwnProperty.call(courses, key)) continue;
    const c = courses[key];
    if (c && !c.archived) {
      result.push(c);
    }
  }
  return result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
});

// SyncEngine helpers
const NS = 'studyengine';

export function loadStateFromSync(): AppState {
  try {
    const items = (SyncEngine.get(NS, 'items') as AppState['items']) || {};
    const courses = (SyncEngine.get(NS, 'courses') as AppState['courses']) || {};
    const subDecks = (SyncEngine.get(NS, 'subDecks') as AppState['subDecks']) || {};
    const learnProgress = (SyncEngine.get(NS, 'learnProgress') as AppState['learnProgress']) || {};
    const learnSessions = (SyncEngine.get(NS, 'learnSessions') as AppState['learnSessions']) || [];
    const calibration = (SyncEngine.get(NS, 'calibration') as AppState['calibration']) || DEFAULT_STATE.calibration;
    const stats = (SyncEngine.get(NS, 'stats') as AppState['stats']) || DEFAULT_STATE.stats;
    const savedSettings = (SyncEngine.get(NS, 'settings') as Partial<Settings>) || {};
    
    // Merge settings
    settings.value = { ...DEFAULT_SETTINGS, ...savedSettings };
    
    return {
      items,
      courses,
      subDecks,
      learnProgress,
      learnSessions,
      calibration,
      stats
    };
  } catch (e) {
    console.warn('Failed to load state from SyncEngine:', e);
    return DEFAULT_STATE;
  }
}

export function persistState(): void {
  try {
    const s = appState.value;
    SyncEngine.set(NS, 'items', s.items);
    SyncEngine.set(NS, 'courses', s.courses);
    SyncEngine.set(NS, 'subDecks', s.subDecks);
    SyncEngine.set(NS, 'learnProgress', s.learnProgress);
    SyncEngine.set(NS, 'learnSessions', s.learnSessions);
    SyncEngine.set(NS, 'calibration', s.calibration);
    SyncEngine.set(NS, 'stats', s.stats);
    SyncEngine.set(NS, 'settings', settings.value);
  } catch (e) {
    console.warn('Failed to persist state:', e);
  }
}

export function persistSettings(): void {
  try {
    SyncEngine.set(NS, 'settings', settings.value);
  } catch (e) {
    console.warn('Failed to persist settings:', e);
  }
}

// Auto-persist on state changes (debounced)
let persistTimeout: ReturnType<typeof setTimeout> | null = null;

export function initAutoPersist(): void {
  effect(() => {
    // Access signals to subscribe
    const _ = appState.value;
    const __ = settings.value;
    
    if (persistTimeout) {
      clearTimeout(persistTimeout);
    }
    persistTimeout = setTimeout(() => {
      persistState();
    }, 500);
  });
}

// Initialize state
export function initStateSignals(): void {
  const state = loadStateFromSync();
  appState.value = state;
  initAutoPersist();
}

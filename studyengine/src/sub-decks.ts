import type { AppState, StudyItem, SubDeckMeta, SubDecksState } from './types';

type DeleteHandling = 'orphan' | 'delete';

let runtimeState: AppState | null = null;

function normalizeName(name: string): string {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function toKey(name: string): string {
  return normalizeName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function ensureRuntimeState(): AppState {
  if (!runtimeState) {
    throw new Error('Sub-decks runtime state not initialized. Call loadSubDecks(state) first.');
  }
  return runtimeState;
}

function ensureSubDeckMap(state: AppState): SubDecksState {
  if (!state.subDecks || typeof state.subDecks !== 'object') {
    state.subDecks = {};
  }
  return state.subDecks;
}

function ensureCourseMap(subDecks: SubDecksState, course: string): Record<string, SubDeckMeta> {
  if (!subDecks[course] || typeof subDecks[course] !== 'object') {
    subDecks[course] = {};
  }
  return subDecks[course];
}

function getMetaForName(courseMap: Record<string, SubDeckMeta>, name: string): { key: string; meta: SubDeckMeta } | null {
  const needle = normalizeName(name).toLowerCase();
  for (const key of Object.keys(courseMap)) {
    const meta = courseMap[key];
    if (!meta || typeof meta !== 'object') continue;
    if (normalizeName(meta.name).toLowerCase() === needle) {
      return { key, meta };
    }
  }
  return null;
}

function cardBelongsToSubDeck(card: StudyItem, course: string, key: string): boolean {
  if (!card || card.course !== course) return false;
  if (card.subDeck == null || card.subDeck === '') return false;
  return card.subDeck === key;
}

function isDueNow(card: StudyItem, nowTs: number): boolean {
  const fsrs = card.fsrs;
  if (!fsrs) return true;
  if (!fsrs.lastReview) return true;
  const dueTs = fsrs.due ? new Date(fsrs.due).getTime() : 0;
  return dueTs <= nowTs;
}

function calculateRetention(card: StudyItem, nowTs: number): number | null {
  if (!card.fsrs || !card.fsrs.lastReview) return null;
  const globalWithBridge = globalThis as typeof globalThis & {
    __studyEngineSessionFlow?: {
      retrievability?: (fsrs: StudyItem['fsrs'], ts: number) => number;
    };
  };
  const retrievabilityFn = globalWithBridge.__studyEngineSessionFlow?.retrievability;
  if (typeof retrievabilityFn !== 'function') return null;
  const val = retrievabilityFn(card.fsrs, nowTs);
  return Number.isFinite(val) ? val : null;
}

export function loadSubDecks(state: AppState): SubDecksState {
  runtimeState = state;
  migrateSubDecks(state);
  return ensureSubDeckMap(state);
}

export function saveSubDecks(state: AppState, subDecks: SubDecksState): void {
  runtimeState = state;
  state.subDecks = subDecks;
}

export function createSubDeck(course: string, name: string): SubDeckMeta {
  const state = ensureRuntimeState();
  const subDecks = ensureSubDeckMap(state);
  const courseMap = ensureCourseMap(subDecks, course);
  const cleanName = normalizeName(name);
  if (!cleanName) {
    throw new Error('Sub-deck name is required.');
  }
  if (getMetaForName(courseMap, cleanName)) {
    throw new Error('Sub-deck already exists.');
  }

  const baseKey = toKey(cleanName) || 'subdeck';
  let key = baseKey;
  let n = 2;
  while (courseMap[key]) {
    key = `${baseKey}-${n}`;
    n++;
  }

  const order = Object.keys(courseMap).reduce((maxOrder, k) => {
    const meta = courseMap[k];
    return Math.max(maxOrder, typeof meta?.order === 'number' ? meta.order : -1);
  }, -1) + 1;

  const meta: SubDeckMeta = {
    name: cleanName,
    order,
    created: Date.now(),
  };

  courseMap[key] = meta;
  return meta;
}

export function renameSubDeck(course: string, oldKey: string, newName: string): void {
  const state = ensureRuntimeState();
  const subDecks = ensureSubDeckMap(state);
  const courseMap = ensureCourseMap(subDecks, course);
  const existing = courseMap[oldKey];
  if (!existing) return;

  const cleanName = normalizeName(newName);
  if (!cleanName) {
    throw new Error('Sub-deck name is required.');
  }

  const duplicate = getMetaForName(courseMap, cleanName);
  if (duplicate && duplicate.key !== oldKey) {
    throw new Error('Sub-deck already exists.');
  }

  const nextBase = toKey(cleanName) || oldKey;
  let newKey = nextBase;
  let n = 2;
  while (courseMap[newKey] && newKey !== oldKey) {
    newKey = `${nextBase}-${n}`;
    n++;
  }

  const nextMeta: SubDeckMeta = { ...existing, name: cleanName };
  if (newKey === oldKey) {
    courseMap[oldKey] = nextMeta;
    return;
  }

  delete courseMap[oldKey];
  courseMap[newKey] = nextMeta;

  for (const itemId of Object.keys(state.items || {})) {
    const item = state.items[itemId];
    if (!item || item.course !== course) continue;
    if (item.subDeck === oldKey) {
      item.subDeck = newKey;
    }
  }
}

export function deleteSubDeck(course: string, key: string, cardHandling: DeleteHandling): void {
  const state = ensureRuntimeState();
  const subDecks = ensureSubDeckMap(state);
  const courseMap = ensureCourseMap(subDecks, course);
  if (!courseMap[key]) return;
  delete courseMap[key];

  if (cardHandling === 'delete') {
    for (const itemId of Object.keys(state.items || {})) {
      const item = state.items[itemId];
      if (!item || item.course !== course) continue;
      if (item.subDeck === key) {
        delete state.items[itemId];
      }
    }
  } else {
    for (const itemId of Object.keys(state.items || {})) {
      const item = state.items[itemId];
      if (!item || item.course !== course) continue;
      if (item.subDeck === key) {
        item.subDeck = null;
      }
    }
  }

  if (Object.keys(courseMap).length === 0) {
    delete subDecks[course];
  }
}

export function reorderSubDecks(course: string, orderedKeys: string[]): void {
  const state = ensureRuntimeState();
  const subDecks = ensureSubDeckMap(state);
  const courseMap = ensureCourseMap(subDecks, course);

  orderedKeys.forEach((key, idx) => {
    if (courseMap[key]) {
      courseMap[key].order = idx;
    }
  });
}

export function getCardsInSubDeck(course: string, key: string, allItems: StudyItem[]): StudyItem[] {
  return (allItems || []).filter((card) => cardBelongsToSubDeck(card, course, key));
}

export function getSubDeckStats(course: string, key: string, allItems: StudyItem[]): { total: number; due: number; archived: number; avgRetention: number } {
  const nowTs = Date.now();
  let total = 0;
  let due = 0;
  let archived = 0;
  let retSum = 0;
  let retN = 0;

  (allItems || []).forEach((card) => {
    if (!cardBelongsToSubDeck(card, course, key)) return;
    total++;
    if (card.archived) archived++;
    if (!card.archived && isDueNow(card, nowTs)) due++;
    const r = calculateRetention(card, nowTs);
    if (r != null) {
      retSum += r;
      retN++;
    }
  });

  return {
    total,
    due,
    archived,
    avgRetention: retN > 0 ? Math.round((retSum / retN) * 100) : 0,
  };
}

export function migrateSubDecks(state: AppState): void {
  runtimeState = state;

  if (!state.subDecks || typeof state.subDecks !== 'object' || Array.isArray(state.subDecks)) {
    state.subDecks = {};
  }

  const nextSubDecks: SubDecksState = {};
  for (const courseName of Object.keys(state.subDecks || {})) {
    const rawCourseMap = state.subDecks[courseName];
    if (!rawCourseMap || typeof rawCourseMap !== 'object' || Array.isArray(rawCourseMap)) continue;
    const nextCourseMap: Record<string, SubDeckMeta> = {};
    for (const key of Object.keys(rawCourseMap)) {
      const rawMeta = rawCourseMap[key];
      if (!rawMeta || typeof rawMeta !== 'object' || Array.isArray(rawMeta)) continue;
      const cleanName = normalizeName(String((rawMeta as SubDeckMeta).name || ''));
      if (!cleanName) continue;
      nextCourseMap[key] = {
        name: cleanName,
        order: Number.isFinite((rawMeta as SubDeckMeta).order) ? Number((rawMeta as SubDeckMeta).order) : 0,
        created: Number.isFinite((rawMeta as SubDeckMeta).created) ? Number((rawMeta as SubDeckMeta).created) : Date.now(),
        color: typeof (rawMeta as SubDeckMeta).color === 'string' ? (rawMeta as SubDeckMeta).color : undefined,
        icon: typeof (rawMeta as SubDeckMeta).icon === 'string' ? (rawMeta as SubDeckMeta).icon : undefined,
      };
    }
    if (Object.keys(nextCourseMap).length > 0) {
      nextSubDecks[courseName] = nextCourseMap;
    }
  }
  state.subDecks = nextSubDecks;

  for (const itemId of Object.keys(state.items || {})) {
    const item = state.items[itemId];
    if (!item) continue;

    if (typeof item.subDeck === 'undefined') {
      if (typeof item.subdeck === 'string' && item.subdeck.trim()) {
        item.subDeck = item.subdeck.trim();
      }
      continue;
    }

    if (item.subDeck === null) continue;
    if (typeof item.subDeck !== 'string') {
      item.subDeck = null;
      continue;
    }

    const trimmed = item.subDeck.trim();
    item.subDeck = trimmed || null;
  }
}

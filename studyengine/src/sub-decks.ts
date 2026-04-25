import type { AppState, StudyItem, SubDeckMeta, SubDecksState } from './types';

type DeleteHandling = 'orphan' | 'delete';

export interface SubDeckTreeNode {
  key: string;
  meta: SubDeckMeta;
  children: SubDeckTreeNode[];
}

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

function sortSubDeckEntries(a: { key: string; meta: SubDeckMeta }, b: { key: string; meta: SubDeckMeta }): number {
  const ao = typeof a.meta.order === 'number' ? a.meta.order : 0;
  const bo = typeof b.meta.order === 'number' ? b.meta.order : 0;
  if (ao !== bo) return ao - bo;
  return String(a.meta.name || '').localeCompare(String(b.meta.name || ''));
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
    parentSubDeck: null,
    archived: false,
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

  for (const k of Object.keys(courseMap)) {
    if (courseMap[k] && courseMap[k].parentSubDeck === oldKey) {
      courseMap[k].parentSubDeck = newKey;
    }
  }

  for (const itemId of Object.keys(state.items || {})) {
    const item = state.items[itemId];
    if (!item || item.course !== course) continue;
    if (item.subDeck === oldKey) {
      item.subDeck = newKey;
    }
  }
}

export function getSubDeckTree(course: string, state: AppState): SubDeckTreeNode[] {
  const map = (state?.subDecks && state.subDecks[course]) ? state.subDecks[course] : {};
  const nodes = Object.keys(map || {}).map((key) => ({ key, meta: map[key] })).filter((entry) => !!entry.meta);
  const byParent = new Map<string | null, Array<{ key: string; meta: SubDeckMeta }>>();

  nodes.forEach((entry) => {
    const parentRaw = entry.meta.parentSubDeck;
    const parent = typeof parentRaw === 'string' && parentRaw.trim() ? parentRaw : null;
    if (parent && !map[parent]) {
      if (!byParent.has(null)) byParent.set(null, []);
      byParent.get(null)!.push(entry);
      return;
    }
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent)!.push(entry);
  });

  const build = (parent: string | null, visiting: Set<string>): SubDeckTreeNode[] => {
    const direct = (byParent.get(parent) || []).slice().sort(sortSubDeckEntries);
    return direct.map((entry) => {
      if (visiting.has(entry.key)) {
        return { key: entry.key, meta: entry.meta, children: [] };
      }
      const nextVisiting = new Set(visiting);
      nextVisiting.add(entry.key);
      return {
        key: entry.key,
        meta: entry.meta,
        children: build(entry.key, nextVisiting),
      };
    });
  };

  return build(null, new Set());
}

export function getDescendantSubDeckKeys(course: string, key: string, state: AppState): string[] {
  const map = (state?.subDecks && state.subDecks[course]) ? state.subDecks[course] : {};
  if (!map || !map[key]) return [];
  const out: string[] = [];
  const queue: string[] = [key];
  const visited = new Set<string>();

  while (queue.length) {
    const current = queue.shift() as string;
    if (visited.has(current)) continue;
    visited.add(current);
    out.push(current);
    Object.keys(map).forEach((candidateKey) => {
      const meta = map[candidateKey];
      if (!meta) return;
      if (meta.parentSubDeck === current && !visited.has(candidateKey)) {
        queue.push(candidateKey);
      }
    });
  }

  return out;
}

export function getAncestorSubDeckKeys(course: string, key: string, state: AppState): string[] {
  const map = (state?.subDecks && state.subDecks[course]) ? state.subDecks[course] : {};
  if (!map || !map[key]) return [];
  const out: string[] = [];
  const visited = new Set<string>();
  let currentParent = map[key].parentSubDeck;

  while (currentParent && map[currentParent] && !visited.has(currentParent)) {
    visited.add(currentParent);
    out.push(currentParent);
    currentParent = map[currentParent].parentSubDeck;
  }

  return out;
}

export function getCardsInScope(
  course: string,
  key: string | null,
  items: StudyItem[],
  state: AppState,
  opts?: { includeArchivedSubDecks?: boolean }
): StudyItem[] {
  const includeArchivedSubDecks = !!opts?.includeArchivedSubDecks;
  const map = (state?.subDecks && state.subDecks[course]) ? state.subDecks[course] : {};

  let allowedDecks = new Set<string>();
  if (key == null) {
    const all = Object.keys(map || {});
    if (includeArchivedSubDecks) {
      allowedDecks = new Set(all);
    } else {
      all.forEach((candidateKey) => {
        const ancestors = getAncestorSubDeckKeys(course, candidateKey, state);
        const candidate = map[candidateKey];
        const candidateArchived = !!(candidate && candidate.archived);
        const hasArchivedAncestor = ancestors.some((ancestorKey) => !!map[ancestorKey]?.archived);
        if (!candidateArchived && !hasArchivedAncestor) allowedDecks.add(candidateKey);
      });
    }
  } else {
    const descendants = getDescendantSubDeckKeys(course, key, state);
    if (includeArchivedSubDecks) {
      allowedDecks = new Set(descendants);
    } else {
      descendants.forEach((candidateKey) => {
        if (candidateKey === key) {
          allowedDecks.add(candidateKey);
          return;
        }
        const ancestors = getAncestorSubDeckKeys(course, candidateKey, state);
        const betweenScopeAndNode = ancestors.filter((ancestorKey) => ancestorKey !== key);
        const candidateArchived = !!map[candidateKey]?.archived;
        const hasArchivedAncestor = betweenScopeAndNode.some((ancestorKey) => !!map[ancestorKey]?.archived);
        if (!candidateArchived && !hasArchivedAncestor) allowedDecks.add(candidateKey);
      });
    }
  }

  return (items || []).filter((item) => {
    if (!item || item.course !== course || item.archived) return false;
    const subDeckKey = item.subDeck == null || item.subDeck === '' ? null : item.subDeck;
    if (key == null) {
      return subDeckKey == null || (subDeckKey != null && allowedDecks.has(subDeckKey));
    }
    if (subDeckKey == null) return false;
    return allowedDecks.has(subDeckKey);
  });
}

export function moveSubDeck(course: string, key: string, newParent: string | null): void {
  const state = ensureRuntimeState();
  const subDecks = ensureSubDeckMap(state);
  const courseMap = ensureCourseMap(subDecks, course);
  const target = courseMap[key];
  if (!target) throw new Error('Sub-deck not found.');

  const normalizedParent = (typeof newParent === 'string' && newParent.trim()) ? newParent : null;
  if (normalizedParent === key) throw new Error('Cannot move a sub-deck into itself.');
  if (normalizedParent && !courseMap[normalizedParent]) throw new Error('Target parent not found.');

  if (normalizedParent) {
    const descendants = new Set(getDescendantSubDeckKeys(course, key, state));
    if (descendants.has(normalizedParent)) {
      throw new Error('Cannot move a sub-deck into one of its descendants.');
    }
  }

  const siblings = Object.keys(courseMap)
    .filter((candidateKey) => {
      if (candidateKey === key) return false;
      const parent = courseMap[candidateKey]?.parentSubDeck ?? null;
      return parent === normalizedParent;
    })
    .map((candidateKey) => ({ key: candidateKey, meta: courseMap[candidateKey] }))
    .sort(sortSubDeckEntries);

  target.parentSubDeck = normalizedParent;
  target.order = siblings.length;
}

export function archiveSubDeck(course: string, key: string): void {
  const state = ensureRuntimeState();
  const map = ensureCourseMap(ensureSubDeckMap(state), course);
  if (!map[key]) throw new Error('Sub-deck not found.');
  map[key].archived = true;
  map[key].archivedAt = Date.now();
}

export function unarchiveSubDeck(course: string, key: string): void {
  const state = ensureRuntimeState();
  const map = ensureCourseMap(ensureSubDeckMap(state), course);
  if (!map[key]) throw new Error('Sub-deck not found.');
  map[key].archived = false;
  delete map[key].archivedAt;
}

export function deleteSubDeck(course: string, key: string, cardHandling: DeleteHandling): void {
  const state = ensureRuntimeState();
  const subDecks = ensureSubDeckMap(state);
  const courseMap = ensureCourseMap(subDecks, course);
  const deleted = courseMap[key];
  if (!deleted) return;

  if (cardHandling === 'delete') {
    const keysToDelete = new Set(getDescendantSubDeckKeys(course, key, state));
    Object.keys(courseMap).forEach((deckKey) => {
      if (keysToDelete.has(deckKey)) delete courseMap[deckKey];
    });
    for (const itemId of Object.keys(state.items || {})) {
      const item = state.items[itemId];
      if (!item || item.course !== course) continue;
      if (item.subDeck && keysToDelete.has(item.subDeck)) {
        delete state.items[itemId];
      }
    }
  } else {
    const deletedParent = deleted.parentSubDeck ?? null;
    Object.keys(courseMap).forEach((deckKey) => {
      if (deckKey === key) return;
      const meta = courseMap[deckKey];
      if (meta && meta.parentSubDeck === key) {
        meta.parentSubDeck = deletedParent;
      }
    });
    delete courseMap[key];

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
      const rawParent = (rawMeta as SubDeckMeta).parentSubDeck;
      nextCourseMap[key] = {
        name: cleanName,
        order: Number.isFinite((rawMeta as SubDeckMeta).order) ? Number((rawMeta as SubDeckMeta).order) : 0,
        created: Number.isFinite((rawMeta as SubDeckMeta).created) ? Number((rawMeta as SubDeckMeta).created) : Date.now(),
        color: typeof (rawMeta as SubDeckMeta).color === 'string' ? (rawMeta as SubDeckMeta).color : undefined,
        icon: typeof (rawMeta as SubDeckMeta).icon === 'string' ? (rawMeta as SubDeckMeta).icon : undefined,
        parentSubDeck: typeof rawParent === 'string' && rawParent.trim() ? rawParent.trim() : null,
        archived: typeof (rawMeta as SubDeckMeta).archived === 'boolean' ? Boolean((rawMeta as SubDeckMeta).archived) : false,
        archivedAt: Number.isFinite((rawMeta as SubDeckMeta).archivedAt) ? Number((rawMeta as SubDeckMeta).archivedAt) : undefined,
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

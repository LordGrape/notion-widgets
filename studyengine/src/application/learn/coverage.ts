/**
 * Application layer (L2): Learn coverage and course entry resolution.
 * Split verbatim from src/learn-mode.ts in Phase V2a (2026-08-18).
 */
import type { AppState, StudyItem, SubDeckMeta } from '../../types';
import { createSubDeck, getCardsInScope, getCardsInSubDeck, loadSubDecks } from '../../sub-decks';
import { COURSE_ROOT_SUBDECK_KEY } from './constants';
import type { CourseLearnEntryResolution, CourseLearnPickerSubDeck, LearnStatus } from './types';

interface CourseLike {
  name?: string;
}

export function getCoverageStats(course: string, subDeck: string, items: StudyItem[]): {
  total: number;
  taught: number;
  consolidated: number;
  unlearned: number;
  pctUnlearned: number;
} {
  const cards = getCardsInSubDeck(course, subDeck, items);
  let taught = 0;
  let consolidated = 0;
  let unlearned = 0;

  cards.forEach((card) => {
    const status = (card.learnStatus ?? null) as LearnStatus;
    if (status === 'consolidated') consolidated += 1;
    else if (status === 'taught') taught += 1;
    else if (status === 'unlearned') unlearned += 1;
  });

  return {
    total: cards.length,
    taught,
    consolidated,
    unlearned,
    pctUnlearned: cards.length ? Math.round((unlearned / cards.length) * 100) : 0
  };
}

function getCourseName(course: CourseLike | string): string {
  if (typeof course === 'string') return String(course || '').trim();
  return String(course?.name || '').trim();
}

export function getCourseSubDeckEntries(courseName: string, state: AppState): Array<{ key: string; meta: SubDeckMeta }> {
  const map = (state?.subDecks && state.subDecks[courseName]) ? state.subDecks[courseName] : {};
  return Object.keys(map || {})
    .filter((key) => key !== COURSE_ROOT_SUBDECK_KEY)
    .map((key) => ({ key, meta: map[key] }))
    .filter((entry) => !!entry.meta)
    .sort((a, b) => {
      const ao = typeof a.meta.order === 'number' ? a.meta.order : 0;
      const bo = typeof b.meta.order === 'number' ? b.meta.order : 0;
      if (ao !== bo) return ao - bo;
      return String(a.meta.name || '').localeCompare(String(b.meta.name || ''));
    });
}

function findSubDeckKeyByName(courseName: string, state: AppState, targetName: string): string | null {
  const needle = String(targetName || '').trim().toLowerCase();
  if (!needle) return null;
  const entries = getCourseSubDeckEntries(courseName, state);
  for (const entry of entries) {
    if (String(entry.meta.name || '').trim().toLowerCase() === needle) {
      return entry.key;
    }
  }
  return null;
}

export function resolveCourseLearnEntry(course: CourseLike | string, state: AppState): CourseLearnEntryResolution {
  const courseName = getCourseName(course);
  const subDeckEntries = getCourseSubDeckEntries(courseName, state);
  const rootEntries = subDeckEntries.filter((entry) => !entry.meta.parentSubDeck);
  if (rootEntries.length === 0) return { kind: 'empty-prompt' };
  if (rootEntries.length === 1) {
    const onlyRoot = rootEntries[0];
    const hasChildren = subDeckEntries.some((entry) => entry.meta.parentSubDeck === onlyRoot.key);
    if (!hasChildren) return { kind: 'single', subDeckKey: onlyRoot.key };
  }

  const items = Object.keys(state?.items || {}).map((id) => state.items[id]).filter((item): item is StudyItem => !!item);
  const subDecks: CourseLearnPickerSubDeck[] = [
    {
      key: COURSE_ROOT_SUBDECK_KEY,
      name: 'Whole course',
      stats: (() => {
        const coverage = getCardsInScope(courseName, null, items, state, { includeArchivedSubDecks: false });
        let consolidated = 0;
        let unlearned = 0;
        coverage.forEach((card) => {
          const status = (card.learnStatus ?? null) as LearnStatus;
          if (status === 'consolidated') consolidated += 1;
          else if (status === 'unlearned') unlearned += 1;
        });
        return { total: coverage.length, consolidated, unlearned };
      })()
    },
    ...subDeckEntries.map((entry) => {
    const coverage = getCoverageStats(courseName, entry.key, items);
    return {
      key: entry.key,
      name: String(entry.meta.name || entry.key),
      stats: {
        total: Number(coverage.total || 0),
        consolidated: Number(coverage.consolidated || 0),
        unlearned: Number(coverage.unlearned || 0),
      }
    };
  })];
  return { kind: 'picker', subDecks };
}

export function createDefaultSubDeckForCourse(course: CourseLike | string, state: AppState): string {
  const courseName = getCourseName(course);
  const existingKey = findSubDeckKeyByName(courseName, state, 'All cards');
  if (existingKey) return existingKey;

  loadSubDecks(state);
  createSubDeck(courseName, 'All cards');
  const createdKey = findSubDeckKeyByName(courseName, state, 'All cards');
  if (!createdKey) {
    throw new Error('Could not create default sub-deck.');
  }

  Object.keys(state.items || {}).forEach((itemId) => {
    const item = state.items[itemId];
    if (!item || item.course !== courseName) return;
    item.subDeck = createdKey;
  });

  return createdKey;
}

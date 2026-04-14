/*
 * Courses TypeScript Module
 * Phase 3 conversion: types only, ZERO logic changes
 */

import { el, esc, isoNow, fmtMMSS, clamp } from './utils';
import { saveState, deepClone, settings as appSettings, state as appState, NS, TIER_PROFILES, CRAM_TIER_MOD, BLOOM_STABILITY_BONUS } from './state';
import { retrievability } from './fsrs';
import type { StudyItem, Course, SubDeck, CramState, Assessment } from './types';

// External CDN globals (keep as declare)
declare function playClick(): void;

// Helper function stub (will be injected)
let reconcileStatsImpl: () => void = () => {};
export function setReconcileStats(fn: () => void) { reconcileStatsImpl = fn; }
function reconcileStats(): void { reconcileStatsImpl(); }

/**
 * Generate a URL-safe key from course name
 */
function courseKey(name: string): string {
  return String(name || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Get course object by name
 */
function getCourse(courseName: string): Course | null {
  if (!courseName) return null;
  return appState?.courses?.[courseName] || null;
}

/**
 * Get color for a course
 */
function getCourseColor(courseName: string): string {
  const c = getCourse(courseName);
  if (c && c.color) return c.color;
  return '#8b5cf6'; // default purple
}

/**
 * Get effective retention target based on cram state
 */
function getEffectiveRetention(courseName: string): number {
  const cram = getCramState(courseName);
  if (cram.active && cram.intensity === 'critical') return Math.min(appSettings?.desiredRetention || 0.90, 0.85);
  if (cram.active && cram.intensity === 'high') return Math.min(appSettings?.desiredRetention || 0.90, 0.87);
  return appSettings?.desiredRetention || 0.90;
}

/**
 * Get effective tier profile with cram modifiers
 */
function getEffectiveProfile(courseName: string): Record<string, number> {
  const examType = getCourseExamType(courseName);
  const base = deepClone(TIER_PROFILES[examType] || TIER_PROFILES.mixed);
  const cram = getCramState(courseName);
  if (cram.active && CRAM_TIER_MOD[cram.intensity || 'normal']) {
    const mod = CRAM_TIER_MOD[cram.intensity || 'normal'];
    for (const t in base) {
      if (mod[t]) base[t] = base[t] * mod[t];
    }
    // Renormalize to sum to 1
    let total = 0;
    for (const t2 in base) total += base[t2];
    if (total > 0) {
      for (const t3 in base) base[t3] = base[t3] / total;
    }
  }
  return base;
}

/**
 * Get effective Bloom bonus for stability
 */
function getEffectiveBloomBonus(_courseName: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const t in BLOOM_STABILITY_BONUS) {
    result[t] = BLOOM_STABILITY_BONUS[t];
  }
  return result;
}

/**
 * Get cram state for a course
 */
function getCramState(courseName: string): CramState {
  const c = getCourse(courseName);
  if (!c) return { active: false };

  // Find the nearest upcoming assessment date
  let examDate: string | null = null;
  let assessName: string | null = null;
  if (c.assessments && c.assessments.length > 0) {
    const active = getActiveAssessment(courseName);
    if (active && active.date) {
      examDate = active.date;
      assessName = active.name || 'Assessment';
    }
  }
  // Fallback to legacy examDate
  if (!examDate && c.examDate) {
    examDate = c.examDate;
    assessName = 'Exam';
  }
  if (!examDate) return { active: false };

  const examMidnight = new Date(examDate + 'T00:00:00');
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const daysUntil = Math.max(0, Math.round((examMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24)));
  if (daysUntil > 14) return { active: false, daysUntil: daysUntil, assessName: assessName || undefined };

  let intensity: 'critical' | 'high' | 'moderate' | 'low' | 'normal' = 'normal';
  let sessionMod = 1.0;
  let intervalMod = 1.0;

  if (daysUntil <= 2) {
    intensity = 'critical';
    sessionMod = 2.0;
    intervalMod = 0.3;
  } else if (daysUntil <= 5) {
    intensity = 'high';
    sessionMod = 1.5;
    intervalMod = 0.5;
  } else if (daysUntil <= 7) {
    intensity = 'moderate';
    sessionMod = 1.25;
    intervalMod = 0.7;
  } else {
    intensity = 'low';
    sessionMod = 1.1;
    intervalMod = 0.85;
  }

  return {
    active: true,
    daysUntil: daysUntil,
    intensity: intensity,
    sessionMod: sessionMod,
    intervalMod: intervalMod,
    assessName: assessName || undefined
  };
}

/**
 * Detect which tiers are supported by an item
 */
function detectSupportedTiers(item: StudyItem): string[] {
  if (!item || !item.prompt || !item.modelAnswer) return [];
  const tiers: string[] = ['quickfire', 'explain'];
  if (item.task || item.scenario) tiers.push('apply');
  if (item.conceptA && item.conceptB) tiers.push('distinguish');
  // Mock: any item can be presented under time pressure
  tiers.push('mock');
  if ((item.modelAnswer || '').split('\n\n').filter((s) => String(s).trim()).length >= 2) tiers.push('worked');
  return tiers;
}

/**
 * Normalize course for Phase 6 schema
 */
function normalizeCoursePhase6(c: Course | null): Course | null {
  if (!c) return c;
  if (c.examWeight === undefined) c.examWeight = null;
  if (c.syllabusContext === undefined) c.syllabusContext = null;
  if ((c as unknown as { _lectureCount?: number })._lectureCount === undefined) (c as unknown as { _lectureCount: number })._lectureCount = 0;
  if (!Array.isArray(c.modules)) c.modules = [];
  if (c.syllabusKeyTopics === undefined) c.syllabusKeyTopics = [];
  if (c.rawSyllabusText === undefined) c.rawSyllabusText = null;
  if (c.professorValues === undefined) c.professorValues = null;
  if (c.allowedMaterials === undefined) c.allowedMaterials = null;
  if (c.examFormat === undefined) c.examFormat = null;
  if (!Array.isArray(c.assessments)) c.assessments = [];
  if (c.prepared === undefined) c.prepared = false;
  return c;
}

/**
 * Get active assessment (nearest upcoming) for a course
 */
function getActiveAssessment(courseName: string): Assessment | null {
  const c = getCourse(courseName);
  if (!c || !c.assessments) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const upcoming = c.assessments.filter((a) => {
    if (!a.date) return false;
    const d = new Date(a.date + 'T00:00:00');
    return d.getTime() >= now.getTime();
  }).sort((a, b) => {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
  return upcoming[0] || null;
}

/**
 * Get past assessments for a course
 */
function getPastAssessments(courseName: string): Assessment[] {
  const c = getCourse(courseName);
  if (!c || !c.assessments) return [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return c.assessments.filter((a) => {
    if (!a.date) return false;
    const d = new Date(a.date + 'T00:00:00');
    return d.getTime() < now.getTime();
  }).sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
}

/**
 * Get assessment by ID
 */
function getAssessmentById(courseName: string, assessId: string): Assessment | null {
  const c = getCourse(courseName);
  if (!c || !c.assessments) return null;
  return c.assessments.find((a) => a.id === assessId) || null;
}

/**
 * Apply triage priorities from assessment
 */
function applyTriagePriorities(courseName: string, assessId: string): void {
  const assess = getAssessmentById(courseName, assessId);
  if (!assess) return;
  const priorityTopics: Record<string, boolean> = {};
  const sacrificeTopics: Record<string, boolean> = {};

  // Build topic sets from priority/sacrifice questions
  (assess.prioritySet || []).forEach((qId) => {
    const q = assess.questions?.find((x) => x.id === qId);
    if (q && q.mappedTopics) {
      q.mappedTopics.forEach((t) => { priorityTopics[t] = true; });
    }
  });
  (assess.sacrificeSet || []).forEach((qId) => {
    const q = assess.questions?.find((x) => x.id === qId);
    if (q && q.mappedTopics) {
      q.mappedTopics.forEach((t) => {
        if (!priorityTopics[t]) sacrificeTopics[t] = true;
      });
    }
  });

  // Bulk update card priorities
  for (const id in appState?.items) {
    if (!appState?.items.hasOwnProperty(id)) continue;
    const it = appState?.items[id];
    if (!it || it.archived || it.course !== courseName) continue;
    const topic = it.topic || 'General';
    if (priorityTopics[topic]) {
      it.priority = 'critical';
    } else if (sacrificeTopics[topic]) {
      it.priority = 'low';
    } else {
      it.priority = 'medium';
    }
  }
  saveState();
}

/**
 * Ensure course has modules array
 */
function ensureCourseModules(courseName: string): void {
  const c = appState?.courses?.[courseName];
  if (!c) return;
  if (!Array.isArray(c.modules)) c.modules = [];
}

/**
 * Generate a random module ID
 */
function generateModuleId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = 'mod_';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/**
 * Add module to course
 */
function addModuleToCourse(courseName: string, moduleObj?: Partial<SubDeck> & { name: string }): SubDeck | null {
  ensureCourseModules(courseName);
  const c = appState?.courses?.[courseName];
  if (!c) return null;
  if (!moduleObj) moduleObj = { name: '' };
  const mod: SubDeck = {
    id: moduleObj.id || generateModuleId(),
    name: moduleObj.name,
    order: moduleObj.order ?? c.modules!.length,
    topics: moduleObj.topics || []
  };
  c.modules!.push(mod);
  saveCourse(c);
  return mod;
}

/**
 * Remove module from course
 */
function removeModuleFromCourse(courseName: string, moduleId: string): void {
  ensureCourseModules(courseName);
  const c = appState?.courses?.[courseName];
  if (!c) return;
  c.modules = c.modules!.filter((m) => m && m.id !== moduleId);
  saveCourse(c);
}

/**
 * Rename module
 */
function renameModule(courseName: string, moduleId: string, newName: string): void {
  ensureCourseModules(courseName);
  const c = appState?.courses?.[courseName];
  if (!c) return;
  const mod = c.modules!.find((m) => m && m.id === moduleId);
  if (mod) { mod.name = newName; saveCourse(c); }
}

/**
 * Get module for a topic
 */
function getModuleForTopic(courseName: string, topic: string): SubDeck | null {
  const c = appState?.courses?.[courseName];
  if (!c || !c.modules) return null;
  for (let i = 0; i < c.modules.length; i++) {
    if (c.modules[i] && c.modules[i].topics && c.modules[i].topics!.indexOf(topic) >= 0) return c.modules[i];
  }
  return null;
}

/**
 * Get module by ID
 */
function getModuleById(courseName: string, moduleId: string): SubDeck | null {
  const c = appState?.courses?.[courseName];
  if (!c || !c.modules) return null;
  return c.modules.find((m) => m && m.id === moduleId) || null;
}

/**
 * Get cards for a module
 */
function getCardsForModule(courseName: string, moduleId: string): StudyItem[] {
  const mod = getModuleById(courseName, moduleId);
  if (!mod || !mod.topics) return [];
  const cards: StudyItem[] = [];
  for (const id in appState?.items) {
    if (!appState?.items.hasOwnProperty(id)) continue;
    const it = appState?.items[id];
    if (!it || it.archived || it.course !== courseName) continue;
    if (mod.topics!.indexOf(it.topic || '') >= 0) cards.push(it);
  }
  return cards;
}

/**
 * Get cards for a topic
 */
function getCardsForTopic(courseName: string, topic: string): StudyItem[] {
  const cards: StudyItem[] = [];
  for (const id in appState?.items) {
    if (!appState?.items.hasOwnProperty(id)) continue;
    const it = appState?.items[id];
    if (!it || it.archived) continue;
    if (courseName && it.course !== courseName) continue;
    if ((it.topic || 'General') === topic) cards.push(it);
  }
  return cards;
}

/**
 * Get cards for a course
 */
function getCardsForCourse(courseName: string, excludeArchivedSubDecks?: boolean): StudyItem[] {
  const cards: StudyItem[] = [];
  for (const id in appState?.items) {
    if (!appState?.items.hasOwnProperty(id)) continue;
    const it = appState?.items[id];
    if (!it || it.archived || it.course !== courseName) continue;
    if (excludeArchivedSubDecks && isItemInArchivedSubDeck(it)) continue;
    cards.push(it);
  }
  return cards;
}

/**
 * Check if item is due now
 */
function isDueNow(item: StudyItem): boolean {
  if (!item || !item.fsrs || !item.fsrs.due) return true;
  return new Date(item.fsrs.due) <= new Date();
}

/**
 * Get stats for a course
 */
function getCourseStats(courseName: string): {
  total: number;
  due: number;
  reviewed: number;
  avgStability: number;
  avgRetention: number | null;
  tierDist: Record<string, number>;
} {
  const cards = getCardsForCourse(courseName);
  const total = cards.length;
  const due = cards.filter(isDueNow).length;
  const reviewed = cards.filter((c) => c.fsrs && c.fsrs.reps > 0).length;
  let avgStability = 0;
  let stableCount = 0;
  let retentionSum = 0;
  let retentionCount = 0;
  const now = Date.now();
  cards.forEach((c) => {
    if (c.fsrs && c.fsrs.stability > 0) { avgStability += c.fsrs.stability; stableCount++; }
    if (c.fsrs && c.fsrs.lastReview) {
      retentionSum += retrievability(c.fsrs, now);
      retentionCount++;
    }
  });
  if (stableCount > 0) avgStability = avgStability / stableCount;
  const tierDist: Record<string, number> = {};
  cards.forEach((c) => { const t = c.tier || 'quickfire'; tierDist[t] = (tierDist[t] || 0) + 1; });
  return {
    total: total,
    due: due,
    reviewed: reviewed,
    avgStability: Math.round(avgStability),
    avgRetention: retentionCount ? Math.round((retentionSum / retentionCount) * 100) : null,
    tierDist: tierDist
  };
}

/**
 * Get stats for a module
 */
function getModuleStats(courseName: string, moduleId: string): { total: number; due: number; reviewed: number } {
  const cards = getCardsForModule(courseName, moduleId);
  const total = cards.length;
  const due = cards.filter(isDueNow).length;
  const reviewed = cards.filter((c) => c.fsrs && c.fsrs.reps > 0).length;
  return { total: total, due: due, reviewed: reviewed };
}

/**
 * Clamp course string fields to max length
 */
function clampCourseStringFields(c: Course): void {
  if (!c) return;
  if (c.syllabusContext && String(c.syllabusContext).length > 4000) {
    c.syllabusContext = String(c.syllabusContext).slice(0, 4000);
  }
  if (c.professorValues && String(c.professorValues).length > 500) {
    c.professorValues = String(c.professorValues).slice(0, 500);
  }
  if (c.rawSyllabusText && String(c.rawSyllabusText).length > 15000) {
    c.rawSyllabusText = String(c.rawSyllabusText).slice(0, 15000);
  }
  if (c.examFormat && String(c.examFormat).length > 300) {
    c.examFormat = String(c.examFormat).slice(0, 300);
  }
}

/**
 * Migrate courses to Phase 6 schema
 */
function migrateCoursesPhase6(): void {
  let changed = false;
  for (const k in appState?.courses) {
    if (!appState?.courses.hasOwnProperty(k)) continue;
    const c0 = appState?.courses[k];
    const snap = JSON.stringify(c0);
    normalizeCoursePhase6(c0);
    // Ensure modules array exists
    if (!Array.isArray(c0.modules)) { c0.modules = []; }
    if (JSON.stringify(c0) !== snap) changed = true;
  }
  if (changed) {
    if (typeof SyncEngine !== 'undefined' && (SyncEngine as unknown as { set?: (ns: string, key: string, val: unknown) => void }).set) {
      (SyncEngine as unknown as { set: (ns: string, key: string, val: unknown) => void }).set(NS, 'courses', appState?.courses || {});
    }
  }
}

/**
 * Get exam type for a course
 */
function getCourseExamType(courseOrName: string | Course | null | undefined): string {
  if (!courseOrName) return 'mixed';
  if (typeof courseOrName === 'string') {
    const c = getCourse(courseOrName);
    return (c && c.examType) ? c.examType : 'mixed';
  }
  // It's a Course object
  return courseOrName.examType || 'mixed';
}

/**
 * Check if course is in manual mode
 */
function isCourseManual(courseName: string): boolean {
  const c = getCourse(courseName);
  return c ? !!c.manualMode : false;
}

/**
 * Save course to state
 */
export function saveCourse(courseObj: Course): void {
  if (!courseObj || !courseObj.name) return;
  courseObj.id = courseObj.id || courseObj.name;
  normalizeCoursePhase6(courseObj);
  clampCourseStringFields(courseObj);
  if (appState?.courses) appState.courses[courseObj.name] = courseObj;
  saveState();
}

/**
 * Delete course from state
 */
function deleteCourse(courseName: string): void {
  if (appState?.courses[courseName]) {
    delete appState?.courses[courseName];
  }
}

/**
 * List all courses
 */
function listCourses(includeArchived?: boolean): Course[] {
  const out: Course[] = [];
  for (const k in appState?.courses) {
    if (!appState?.courses.hasOwnProperty(k)) continue;
    const course = appState?.courses[k];
    if (!course) continue;
    if (!includeArchived && course.archived) continue;
    out.push(course);
  }
  out.sort((a, b) => { return (a.name || '').localeCompare(b.name || ''); });
  return out;
}

/**
 * Get topics for a course
 */
function getTopicsForCourse(courseName: string): string[] {
  if (!courseName) return [];
  const topics: Record<string, number> = {};
  for (const id in appState?.items) {
    if (!appState?.items.hasOwnProperty(id)) continue;
    const it = appState?.items[id];
    if (!it || it.course !== courseName) continue;
    const t = (it.topic || '').trim();
    if (t) topics[t] = (topics[t] || 0) + 1;
  }
  // Sort by usage count descending, then alphabetical
  return Object.keys(topics).sort((a, b) => {
    if (topics[b] !== topics[a]) return topics[b] - topics[a];
    return a.localeCompare(b);
  });
}

/**
 * Get subdeck
 */
function getSubDeck(courseName: string, subDeckName: string): SubDeck | null {
  if (!appState?.subDecks[courseName]) return null;
  return appState?.subDecks[courseName].subDecks[subDeckName] || null;
}

/**
 * List subdecks for a course
 */
function listSubDecks(courseName: string): SubDeck[] {
  if (!appState?.subDecks[courseName]) return [];
  const subs = appState?.subDecks[courseName].subDecks;
  const out: SubDeck[] = [];
  for (const k in subs) {
    if (subs.hasOwnProperty(k)) out.push(subs[k]);
  }
  out.sort((a, b) => { return (a.order || 0) - (b.order || 0); });
  return out;
}

/**
 * Create a subdeck
 */
function createSubDeck(courseName: string, name: string): SubDeck {
  if (appState?.subDecks && !appState.subDecks[courseName]) {
    appState.subDecks[courseName] = { subDecks: {} };
  }
  const existing = appState?.subDecks?.[courseName] ? Object.keys(appState.subDecks[courseName].subDecks) : [];
  const sd: SubDeck = {
    id: name,
    name: name,
    order: existing.length,
    topics: [],
    archived: false,
    created: isoNow(),
    cardCount: 0
  };
  if (appState?.subDecks?.[courseName]?.subDecks) {
    appState.subDecks[courseName].subDecks[name] = sd;
  }
  saveState();
  return sd;
}

/**
 * Rename subdeck
 */
function renameSubDeck(courseName: string, oldName: string, newName: string): void {
  const sd = appState?.subDecks[courseName];
  if (!sd || !sd.subDecks[oldName]) return;
  const meta = sd.subDecks[oldName];
  meta.name = newName;
  delete sd.subDecks[oldName];
  sd.subDecks[newName] = meta;
  for (const id in appState?.items) {
    if (!appState?.items.hasOwnProperty(id)) continue;
    const it = appState?.items[id];
    if (it && it.course === courseName && it.subDeck === oldName) {
      it.subDeck = newName;
    }
  }
  saveState();
}

/**
 * Archive subdeck
 */
function archiveSubDeck(courseName: string, subDeckName: string): void {
  const sd = getSubDeck(courseName, subDeckName);
  if (sd) { sd.archived = true; saveState(); }
}

/**
 * Unarchive subdeck
 */
function unarchiveSubDeck(courseName: string, subDeckName: string): void {
  const sd = getSubDeck(courseName, subDeckName);
  if (sd) { sd.archived = false; saveState(); }
}

/**
 * Delete subdeck
 */
function deleteSubDeck(courseName: string, subDeckName: string, deleteCards?: boolean): void {
  const sd = appState?.subDecks[courseName];
  if (!sd || !sd.subDecks[subDeckName]) return;
  if (deleteCards) {
    const toDelete: string[] = [];
    for (const id in appState?.items) {
      if (!appState?.items.hasOwnProperty(id)) continue;
      const it = appState?.items[id];
      if (it && it.course === courseName && it.subDeck === subDeckName) {
        toDelete.push(id);
      }
    }
    toDelete.forEach((did) => { delete appState?.items[did]; });
  } else {
    for (const id2 in appState?.items) {
      if (!appState?.items.hasOwnProperty(id2)) continue;
      const it2 = appState?.items[id2];
      if (it2 && it2.course === courseName && it2.subDeck === subDeckName) {
        it2.subDeck = null;
      }
    }
  }
  delete sd.subDecks[subDeckName];
  reconcileStats();
  saveState();
}

/**
 * Move subdeck to different course
 */
function moveSubDeck(subDeckName: string, fromCourse: string, toCourse: string): void {
  const fromSd = appState?.subDecks[fromCourse];
  if (!fromSd || !fromSd.subDecks[subDeckName]) return;
  if (appState?.subDecks && !appState.subDecks[toCourse]) {
    appState.subDecks[toCourse] = { subDecks: {} };
  }
  if (appState?.subDecks?.[toCourse]?.subDecks) {
    appState.subDecks[toCourse].subDecks[subDeckName] = fromSd.subDecks[subDeckName];
  }
  delete fromSd.subDecks[subDeckName];
  for (const id in appState?.items) {
    if (!appState?.items.hasOwnProperty(id)) continue;
    const it = appState?.items[id];
    if (it && it.course === fromCourse && it.subDeck === subDeckName) {
      it.course = toCourse;
    }
  }
  if (!appState?.courses[toCourse]) {
    saveCourse({
      name: toCourse,
      examType: 'mixed',
      examDate: null,
      manualMode: false,
      color: '#8b5cf6',
      created: isoNow()
    } as Course);
  }
  saveState();
}

/**
 * Check if subdeck is archived
 */
function isSubDeckArchived(courseName: string, subDeckName: string): boolean {
  const sd = getSubDeck(courseName, subDeckName);
  return sd ? (sd.archived || false) : false;
}

/**
 * Check if item is in archived subdeck
 */
function isItemInArchivedSubDeck(item: StudyItem): boolean {
  if (!item || !item.subDeck || !item.course) return false;
  return isSubDeckArchived(item.course, item.subDeck);
}

/**
 * Recount cards in subdeck
 */
function recountSubDeck(courseName: string, subDeckName: string): void {
  if (!subDeckName) return;
  let count = 0;
  for (const id in appState?.items) {
    if (!appState?.items.hasOwnProperty(id)) continue;
    const it = appState?.items[id];
    if (it && !it.archived && it.course === courseName && it.subDeck === subDeckName) count++;
  }
  const sd = getSubDeck(courseName, subDeckName);
  if (sd) sd.cardCount = count;
}

/**
 * Get cards for subdeck
 */
function getCardsForSubDeck(courseName: string, subDeckName: string): StudyItem[] {
  const cards: StudyItem[] = [];
  for (const id in appState?.items) {
    if (!appState?.items.hasOwnProperty(id)) continue;
    const it = appState?.items[id];
    if (!it || it.archived || it.course !== courseName) continue;
    if (it.subDeck === subDeckName) cards.push(it);
  }
  return cards;
}

/**
 * Render topic suggestions
 */
function renderTopicSuggestions(inputId: string, courseName: string, containerId: string): void {
  const existing = getTopicsForCourse(courseName);
  const container = el(containerId);
  if (!container) return;
  if (!existing.length) {
    container.innerHTML = '';
    (container as HTMLElement).style.display = 'none';
    return;
  }
  let h = '';
  existing.forEach((t) => {
    h += '<span class="chip topic-suggestion" data-topic-val="' + esc(t) + '" style="cursor:pointer;">' + esc(t) + '</span>';
  });
  container.innerHTML = h;
  (container as HTMLElement).style.display = 'flex';

  container.querySelectorAll('.topic-suggestion').forEach((chip) => {
    chip.addEventListener('click', function(this: HTMLElement) {
      const input = el(inputId) as HTMLInputElement | null;
      if (input) {
        input.value = this.getAttribute('data-topic-val') || '';
        input.focus();
      }
      // Highlight selected chip
      container.querySelectorAll('.topic-suggestion').forEach((c) => { c.classList.remove('active'); });
      this.classList.add('active');
      try { playClick(); } catch(e) {}
      if ((window as unknown as { gsap?: typeof gsap }).gsap) {
        (window as unknown as { gsap: typeof gsap }).gsap.fromTo(this, { scale: 0.94 }, { scale: 1, duration: 0.25, ease: 'back.out(2)' });
      }
    });
  });

  if ((window as unknown as { gsap?: typeof gsap }).gsap) {
    (window as unknown as { gsap: typeof gsap }).gsap.fromTo(container.querySelectorAll('.chip'), { opacity: 0, y: 3 }, { opacity: 1, y: 0, duration: 0.2, stagger: 0.03, ease: 'power2.out' });
  }
}

// Attach to window for .js consumers
if (typeof window !== 'undefined') {
  const win = window as unknown as Record<string, unknown>;
  win.courseKey = courseKey;
  win.getCourse = getCourse;
  win.getCourseColor = getCourseColor;
  win.getEffectiveRetention = getEffectiveRetention;
  win.getEffectiveProfile = getEffectiveProfile;
  win.getEffectiveBloomBonus = getEffectiveBloomBonus;
  win.getCramState = getCramState;
  win.detectSupportedTiers = detectSupportedTiers;
  win.normalizeCoursePhase6 = normalizeCoursePhase6;
  win.getActiveAssessment = getActiveAssessment;
  win.getPastAssessments = getPastAssessments;
  win.getAssessmentById = getAssessmentById;
  win.applyTriagePriorities = applyTriagePriorities;
  win.ensureCourseModules = ensureCourseModules;
  win.generateModuleId = generateModuleId;
  win.addModuleToCourse = addModuleToCourse;
  win.removeModuleFromCourse = removeModuleFromCourse;
  win.renameModule = renameModule;
  win.getModuleForTopic = getModuleForTopic;
  win.getModuleById = getModuleById;
  win.getCardsForModule = getCardsForModule;
  win.getCardsForTopic = getCardsForTopic;
  win.getCardsForCourse = getCardsForCourse;
  win.isDueNow = isDueNow;
  win.getCourseStats = getCourseStats;
  win.getModuleStats = getModuleStats;
  win.clampCourseStringFields = clampCourseStringFields;
  win.migrateCoursesPhase6 = migrateCoursesPhase6;
  win.getCourseExamType = getCourseExamType;
  win.isCourseManual = isCourseManual;
  win.saveCourse = saveCourse;
  win.deleteCourse = deleteCourse;
  win.listCourses = listCourses;
  win.getTopicsForCourse = getTopicsForCourse;
  win.getSubDeck = getSubDeck;
  win.listSubDecks = listSubDecks;
  win.createSubDeck = createSubDeck;
  win.renameSubDeck = renameSubDeck;
  win.archiveSubDeck = archiveSubDeck;
  win.unarchiveSubDeck = unarchiveSubDeck;
  win.deleteSubDeck = deleteSubDeck;
  win.moveSubDeck = moveSubDeck;
  win.isSubDeckArchived = isSubDeckArchived;
  win.isItemInArchivedSubDeck = isItemInArchivedSubDeck;
  win.recountSubDeck = recountSubDeck;
  win.getCardsForSubDeck = getCardsForSubDeck;
  win.renderTopicSuggestions = renderTopicSuggestions;
}

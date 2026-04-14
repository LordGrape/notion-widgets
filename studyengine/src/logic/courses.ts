// Course management logic - ported from studyengine/js/courses.js

import type {
  Course, CourseModule, Assessment, StudyItem, SubDeckMeta, CramState,
  TierProfile, ExamType
} from '../types';
import { generateModuleId, generateAssessmentId, deepClone } from '../utils/helpers';
import { appState, settings } from '../signals';
import { retrievability } from './fsrs';

// Tier profiles by exam type
export const TIER_PROFILES: Record<string, TierProfile> = {
  mc: { quickfire: 0.50, explain: 0.25, apply: 0.15, distinguish: 0.05, mock: 0.05, worked: 0.00 },
  short_answer: { quickfire: 0.20, explain: 0.30, apply: 0.25, distinguish: 0.10, mock: 0.10, worked: 0.05 },
  essay: { quickfire: 0.10, explain: 0.25, apply: 0.30, distinguish: 0.15, mock: 0.15, worked: 0.05 },
  mixed: { quickfire: 0.30, explain: 0.25, apply: 0.25, distinguish: 0.10, mock: 0.07, worked: 0.03 }
};

// Bloom stability bonuses
export const BLOOM_STABILITY_BONUS: Record<string, number> = {
  quickfire: 1.0,
  explain: 1.05,
  apply: 1.10,
  distinguish: 1.15,
  mock: 1.20,
  worked: 1.25
};

// Cram tier modifiers
export const CRAM_TIER_MOD: Record<string, Partial<Record<string, number>>> = {
  critical: { quickfire: 1.4, explain: 1.2, apply: 0.9, distinguish: 0.8, mock: 0.7, worked: 0.5 },
  high: { quickfire: 1.3, explain: 1.15, apply: 0.95, distinguish: 0.85, mock: 0.75, worked: 0.6 },
  moderate: { quickfire: 1.2, explain: 1.1, apply: 1.0, distinguish: 0.9, mock: 0.8, worked: 0.7 },
  low: { quickfire: 1.1, explain: 1.05, apply: 1.0, distinguish: 0.95, mock: 0.9, worked: 0.8 }
};

export function getCourse(courseName: string): Course | null {
  if (!courseName) return null;
  return appState.value.courses[courseName] || null;
}

export function getCourseColor(courseName: string): string {
  const c = getCourse(courseName);
  if (c && c.color) return c.color;
  return '#8b5cf6';
}

export function getCourseExamType(courseName: string): ExamType {
  const c = getCourse(courseName);
  return (c && c.examType) ? c.examType : 'mixed';
}

export function isCourseManual(courseName: string): boolean {
  const c = getCourse(courseName);
  return c ? !!c.manualMode : false;
}

export function getEffectiveRetention(courseName: string): number {
  const cram = getCramState(courseName);
  const desiredRetention = settings.value.desiredRetention || 0.90;
  if (cram.active && cram.intensity === 'critical') return Math.min(desiredRetention, 0.85);
  if (cram.active && cram.intensity === 'high') return Math.min(desiredRetention, 0.87);
  return desiredRetention;
}

export function getEffectiveProfile(courseName: string): TierProfile {
  const examType = getCourseExamType(courseName);
  const base = deepClone(TIER_PROFILES[examType] || TIER_PROFILES.mixed);
  const cram = getCramState(courseName);
  if (cram.active && cram.intensity && CRAM_TIER_MOD[cram.intensity]) {
    const mod = CRAM_TIER_MOD[cram.intensity];
    for (const t in base) {
      const key = t as keyof TierProfile;
      if (mod[key]) base[key] = base[key] * (mod[key] || 1);
    }
    // Renormalize to sum to 1
    let total = 0;
    for (const t2 in base) total += base[t2 as keyof TierProfile];
    if (total > 0) {
      for (const t3 in base) base[t3 as keyof TierProfile] = base[t3 as keyof TierProfile] / total;
    }
  }
  return base;
}

export function getEffectiveBloomBonus(courseName: string): Record<string, number> {
  // Flat — no objective-based scaling
  return deepClone(BLOOM_STABILITY_BONUS);
}

export function getCramState(courseName: string): CramState {
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
  if (daysUntil > 14) return { active: false, daysUntil, assessName: assessName || undefined };

  let intensity: CramState['intensity'] = 'normal';
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
    daysUntil,
    intensity,
    sessionMod,
    intervalMod,
    assessName: assessName || undefined
  };
}

export function normalizeCoursePhase6(c: Course): Course {
  if (!c) return c;
  if (c.examWeight === undefined) c.examWeight = null;
  if (c.syllabusContext === undefined) c.syllabusContext = null;
  if (c._lectureCount === undefined) c._lectureCount = 0;
  if (!Array.isArray(c.modules)) c.modules = [];
  if (c.professorValues === undefined) c.professorValues = null;
  if (c.allowedMaterials === undefined) c.allowedMaterials = null;
  if (c.rawSyllabusText === undefined) c.rawSyllabusText = null;
  if (c.examFormat === undefined) c.examFormat = null;
  if (!Array.isArray(c.syllabusKeyTopics)) c.syllabusKeyTopics = [];
  if (c.prepared === undefined) c.prepared = false;
  migrateAssessments(c);
  return c;
}

export function migrateAssessments(c: Course): Course {
  if (!c) return c;
  if (!Array.isArray(c.assessments)) {
    c.assessments = [];
    // Migrate legacy single exam into assessments array
    if (c.examDate) {
      c.assessments.push({
        id: generateAssessmentId(),
        name: 'Final Exam',
        type: c.examType || 'mixed',
        date: c.examDate,
        weight: c.examWeight || null,
        format: c.examFormat || null,
        allowedMaterials: c.allowedMaterials || null,
        questions: [],
        prioritySet: [],
        sacrificeSet: [],
        topicMapping: {},
        chooseN: null,
        outOfM: null,
        active: true
      });
    }
  }
  // Ensure every assessment has all fields
  c.assessments.forEach((a) => {
    if (!a.id) a.id = generateAssessmentId();
    if (a.name === undefined) a.name = 'Assessment';
    if (a.type === undefined) a.type = 'mixed';
    if (a.date === undefined) a.date = null;
    if (a.weight === undefined) a.weight = null;
    if (a.format === undefined) a.format = null;
    if (a.allowedMaterials === undefined) a.allowedMaterials = null;
    if (!Array.isArray(a.questions)) a.questions = [];
    if (!Array.isArray(a.prioritySet)) a.prioritySet = [];
    if (!Array.isArray(a.sacrificeSet)) a.sacrificeSet = [];
    if (!a.topicMapping || typeof a.topicMapping !== 'object') a.topicMapping = {};
    if (a.chooseN === undefined) a.chooseN = null;
    if (a.outOfM === undefined) a.outOfM = null;
    if (a.active === undefined) a.active = true;
  });
  return c;
}

export function getActiveAssessment(courseName: string): Assessment | null {
  const c = getCourse(courseName);
  if (!c || !c.assessments) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  let best: Assessment | null = null;
  let bestDays = Infinity;
  c.assessments.forEach((a) => {
    if (!a.active || !a.date) return;
    const aMidnight = new Date(a.date + 'T00:00:00');
    const days = Math.round((aMidnight.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (days >= 0 && days < bestDays) {
      bestDays = days;
      best = a;
    }
  });
  return best;
}

export function getAssessmentById(courseName: string, assessId: string): Assessment | null {
  const c = getCourse(courseName);
  if (!c || !c.assessments) return null;
  for (let i = 0; i < c.assessments.length; i++) {
    if (c.assessments[i].id === assessId) return c.assessments[i];
  }
  return null;
}

export function getUpcomingAssessments(courseName: string): Assessment[] {
  const c = getCourse(courseName);
  if (!c || !c.assessments) return [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return c.assessments
    .filter((a) => {
      if (!a.date) return false;
      const d = new Date(a.date + 'T00:00:00');
      return d.getTime() >= now.getTime();
    })
    .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime());
}

export function getPastAssessments(courseName: string): Assessment[] {
  const c = getCourse(courseName);
  if (!c || !c.assessments) return [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return c.assessments
    .filter((a) => {
      if (!a.date) return false;
      const d = new Date(a.date + 'T00:00:00');
      return d.getTime() < now.getTime();
    })
    .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime());
}

export function ensureCourseModules(courseName: string): void {
  const c = appState.value.courses[courseName];
  if (!c) return;
  if (!Array.isArray(c.modules)) c.modules = [];
}

export function addModuleToCourse(courseName: string, moduleObj: Partial<CourseModule>): CourseModule | null {
  ensureCourseModules(courseName);
  const c = appState.value.courses[courseName];
  if (!c) return null;
  const newModule: CourseModule = {
    id: moduleObj.id || generateModuleId(),
    name: moduleObj.name || 'Subdeck',
    order: moduleObj.order ?? c.modules!.length,
    topics: moduleObj.topics || [],
    lectureImported: moduleObj.lectureImported || false
  };
  c.modules!.push(newModule);
  return newModule;
}
export function removeModuleFromCourse(courseName: string, moduleId: string): void {
  ensureCourseModules(courseName);
  const c = appState.value.courses[courseName];
  if (!c) return;
  c.modules = c.modules!.filter((m: CourseModule) => m && m.id !== moduleId);
}

export function renameModule(courseName: string, moduleId: string, newName: string): void {
  ensureCourseModules(courseName);
  const c = appState.value.courses[courseName];
  if (!c) return;
  const mod = c.modules!.find((m: CourseModule) => m && m.id === moduleId);
  if (mod) mod.name = newName;
}

export function getModuleById(courseName: string, moduleId: string): CourseModule | null {
  const c = getCourse(courseName);
  if (!c || !c.modules) return null;
  return c.modules.find((m) => m && m.id === moduleId) || null;
}

export function getCardsForCourse(courseName: string, excludeArchivedSubDecks = false): StudyItem[] {
  const cards: StudyItem[] = [];
  const items = appState.value.items;
  for (const id in items) {
    if (!Object.prototype.hasOwnProperty.call(items, id)) continue;
    const it = items[id];
    if (!it || it.archived || it.course !== courseName) continue;
    if (excludeArchivedSubDecks && isItemInArchivedSubDeck(it)) continue;
    cards.push(it);
  }
  return cards;
}

export function getCardsForModule(courseName: string, moduleId: string): StudyItem[] {
  const mod = getModuleById(courseName, moduleId);
  if (!mod || !mod.topics) return [];
  const cards: StudyItem[] = [];
  const items = appState.value.items;
  for (const id in items) {
    if (!Object.prototype.hasOwnProperty.call(items, id)) continue;
    const it = items[id];
    if (!it || it.archived || it.course !== courseName) continue;
    if (mod.topics.indexOf(it.topic) >= 0) cards.push(it);
  }
  return cards;
}

export function getCardsForTopic(courseName: string | null, topic: string): StudyItem[] {
  const cards: StudyItem[] = [];
  const items = appState.value.items;
  for (const id in items) {
    if (!Object.prototype.hasOwnProperty.call(items, id)) continue;
    const it = items[id];
    if (!it || it.archived) continue;
    if (courseName && it.course !== courseName) continue;
    if ((it.topic || 'General') === topic) cards.push(it);
  }
  return cards;
}

export function isDueNow(item: StudyItem): boolean {
  if (!item || !item.fsrs || !item.fsrs.due) return true;
  return new Date(item.fsrs.due) <= new Date();
}

export function getCourseStats(courseName: string) {
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
    total,
    due,
    reviewed,
    avgStability: Math.round(avgStability),
    avgRetention: retentionCount ? Math.round((retentionSum / retentionCount) * 100) : null,
    tierDist
  };
}

// SubDeck functions
export function getSubDeck(courseName: string, subDeckName: string): SubDeckMeta | null {
  const sd = appState.value.subDecks[courseName];
  if (!sd) return null;
  return sd.subDecks[subDeckName] || null;
}

export function listSubDecks(courseName: string): SubDeckMeta[] {
  const sd = appState.value.subDecks[courseName];
  if (!sd) return [];
  const subs = sd.subDecks;
  const out: SubDeckMeta[] = [];
  for (const k in subs) {
    if (Object.prototype.hasOwnProperty.call(subs, k)) out.push(subs[k]);
  }
  return out.sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function createSubDeck(courseName: string, name: string): SubDeckMeta {
  if (!appState.value.subDecks[courseName]) {
    appState.value.subDecks[courseName] = { subDecks: {} };
  }
  const existing = Object.keys(appState.value.subDecks[courseName].subDecks);
  const meta: SubDeckMeta = {
    name,
    order: existing.length,
    archived: false,
    created: new Date().toISOString(),
    cardCount: 0
  };
  appState.value.subDecks[courseName].subDecks[name] = meta;
  return meta;
}

export function isSubDeckArchived(courseName: string, subDeckName: string): boolean {
  const sd = getSubDeck(courseName, subDeckName);
  return sd ? sd.archived : false;
}

export function isItemInArchivedSubDeck(item: StudyItem): boolean {
  if (!item || !item.subDeck || !item.course) return false;
  return isSubDeckArchived(item.course, item.subDeck);
}

export function archiveSubDeck(courseName: string, subDeckName: string): void {
  const sd = getSubDeck(courseName, subDeckName);
  if (sd) sd.archived = true;
}

export function unarchiveSubDeck(courseName: string, subDeckName: string): void {
  const sd = getSubDeck(courseName, subDeckName);
  if (sd) sd.archived = false;
}

export function getTopicsForCourse(courseName: string): string[] {
  if (!courseName) return [];
  const topics: Record<string, number> = {};
  const items = appState.value.items;
  for (const id in items) {
    if (!Object.prototype.hasOwnProperty.call(items, id)) continue;
    const it = items[id];
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

export function listCourses(includeArchived = false): Course[] {
  const out: Course[] = [];
  const courses = appState.value.courses;
  for (const k in courses) {
    if (!Object.prototype.hasOwnProperty.call(courses, k)) continue;
    const course = courses[k];
    if (!course) continue;
    if (!includeArchived && course.archived) continue;
    out.push(course);
  }
  return out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

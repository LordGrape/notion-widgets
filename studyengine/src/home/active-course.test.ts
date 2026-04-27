import { describe, it, expect } from 'vitest';
import { resolveActiveHomeCourse } from './active-course';
import type { AppState, Course } from '../types';

function makeCourse(id: string, name: string, planProfile?: Course['planProfile']): Course {
  return {
    id,
    name,
    planProfile,
    color: '#8b5cf6',
    examType: 'mixed',
    examDate: null,
    examWeight: null,
    examFormat: null,
    allowedMaterials: null,
    manualMode: false,
    created: '2024-01-01T00:00:00Z',
    prepared: false,
    syllabusContext: null,
    syllabusKeyTopics: [],
    rawSyllabusText: null,
    professorValues: null,
    modules: [],
  };
}

function makeState(opts: {
  courses?: Record<string, Course>;
  lastOpenedCourseId?: string;
}): Pick<AppState, 'courses' | 'ui'> {
  return {
    courses: opts.courses || {},
    ui: opts.lastOpenedCourseId !== undefined
      ? { lastOpenedCourseId: opts.lastOpenedCourseId }
      : {},
  };
}

const FLAG_ON = { run5Language: true };
const FLAG_OFF = { run5Language: false };

describe('resolveActiveHomeCourse (Phase L0.5b)', () => {
  it('returns theory when no lastOpenedCourseId is set', () => {
    const state = makeState({ courses: { Spanish: makeCourse('c1', 'Spanish', 'language') } });
    expect(resolveActiveHomeCourse({ state, featureFlags: FLAG_ON })).toEqual({ mode: 'theory' });
  });

  it('returns theory when the referenced course no longer exists', () => {
    const state = makeState({ lastOpenedCourseId: 'c-missing' });
    expect(resolveActiveHomeCourse({ state, featureFlags: FLAG_ON })).toEqual({ mode: 'theory' });
  });

  it('returns theory when the referenced course is theory profile', () => {
    const c = makeCourse('c1', 'Bio', 'theory');
    const state = makeState({ courses: { Bio: c }, lastOpenedCourseId: 'c1' });
    expect(resolveActiveHomeCourse({ state, featureFlags: FLAG_ON })).toEqual({ mode: 'theory' });
  });

  it('returns theory when the run5Language flag is off, even if course is language', () => {
    const c = makeCourse('c1', 'Spanish', 'language');
    const state = makeState({ courses: { Spanish: c }, lastOpenedCourseId: 'c1' });
    expect(resolveActiveHomeCourse({ state, featureFlags: FLAG_OFF })).toEqual({ mode: 'theory' });
  });

  it('returns language mode when all four conditions are met', () => {
    const c = makeCourse('c1', 'Spanish', 'language');
    const state = makeState({ courses: { Spanish: c }, lastOpenedCourseId: 'c1' });
    const result = resolveActiveHomeCourse({ state, featureFlags: FLAG_ON });
    expect(result).toEqual({ mode: 'language', course: c, courseId: 'c1' });
  });

  it('handles missing ui block gracefully', () => {
    const state: Pick<AppState, 'courses' | 'ui'> = { courses: {}, ui: undefined };
    expect(resolveActiveHomeCourse({ state, featureFlags: FLAG_ON })).toEqual({ mode: 'theory' });
  });
});

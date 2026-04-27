import { describe, it, expect } from 'vitest';
import { homeHeroStats, homeTutorStatsLabels } from './widgets';
import type { HomeMode } from './active-course';
import type { StudyItem, Course } from '../types';

function makeItem(course: string, stability: number, archived = false): StudyItem {
  return {
    id: course + ':' + stability + (archived ? ':a' : ''),
    prompt: 'p',
    modelAnswer: 'a',
    course,
    archived,
    created: '2024-01-01T00:00:00Z',
    fsrs: { stability, difficulty: 0, due: '', lastReview: null, reps: 0, lapses: 0, state: 'new' },
  } as StudyItem;
}

function makeCourse(id: string, name: string): Course {
  return {
    id,
    name,
    planProfile: 'language',
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

const THEORY_MODE: HomeMode = { mode: 'theory' };

describe('homeHeroStats — theory mode', () => {
  it('echoes pre-computed inputs verbatim', () => {
    const result = homeHeroStats({
      mode: THEORY_MODE,
      items: [],
      theoryDueCount: 47,
      theoryMasteredCount: 312,
      theoryAvgRetentionPct: 88,
    });
    expect(result.hero).toEqual({ value: '47', label: 'Items due', subtitle: 'Across all tiers' });
    expect(result.secondary1).toEqual({ value: '312', label: 'Mastered', subtitle: 'stability > 30d' });
    expect(result.secondary2).toEqual({ value: '88%', label: 'Avg Retention', subtitle: 'FSRS retrievability' });
    expect(result.courseHint).toBe('Across all tiers');
  });

  it('renders em-dash when retention is null', () => {
    const result = homeHeroStats({
      mode: THEORY_MODE,
      items: [],
      theoryDueCount: 0,
      theoryMasteredCount: 0,
      theoryAvgRetentionPct: null,
    });
    expect(result.secondary2.value).toBe('\u2014');
  });
});

describe('homeHeroStats — language mode', () => {
  const c = makeCourse('c-es', 'Spanish');
  const mode: HomeMode = { mode: 'language', course: c, courseId: 'c-es' };

  it('counts only items in the active course with stability > 21d', () => {
    const items: StudyItem[] = [
      makeItem('Spanish', 22),  // counts
      makeItem('Spanish', 21),  // boundary, excluded (strict >)
      makeItem('Spanish', 100), // counts
      makeItem('Spanish', 5),   // excluded
      makeItem('French', 50),   // wrong course
      makeItem('Spanish', 200, true), // archived, excluded
    ];
    const result = homeHeroStats({
      mode,
      items,
      theoryDueCount: 999,
      theoryMasteredCount: 999,
      theoryAvgRetentionPct: 99,
    });
    expect(result.hero.value).toBe('2');
    expect(result.hero.label).toBe('Words Known');
  });

  it('emits placeholder secondary stats and a course-named hint', () => {
    const result = homeHeroStats({
      mode,
      items: [],
      theoryDueCount: 0,
      theoryMasteredCount: 0,
      theoryAvgRetentionPct: 0,
    });
    expect(result.secondary1).toEqual({ value: '\u2014', label: 'CEFR Estimate', subtitle: 'No data yet' });
    expect(result.secondary2).toEqual({ value: '\u2014', label: 'Speaking Score', subtitle: 'No data yet' });
    expect(result.courseHint).toBe('Showing: Spanish');
  });
});

describe('homeTutorStatsLabels', () => {
  it('returns theory labels with no value overrides', () => {
    const r = homeTutorStatsLabels(THEORY_MODE);
    expect(r.slot1Label).toBe('Avg dialogue turns');
    expect(r.slot2Label).toBe('Reconstruction rate');
    expect(r.slot3Label).toBe('Model split');
    expect(r.slot1Value).toBeUndefined();
    expect(r.slot2Value).toBeUndefined();
    expect(r.slot3Value).toBeUndefined();
  });

  it('returns language labels with em-dash value overrides', () => {
    const c = makeCourse('c-es', 'Spanish');
    const r = homeTutorStatsLabels({ mode: 'language', course: c, courseId: 'c-es' });
    expect(r.slot1Label).toBe('Conv. Turns / wk');
    expect(r.slot2Label).toBe('Recast Rate');
    expect(r.slot3Label).toBe('Pron. Confidence');
    expect(r.slot1Value).toBe('\u2014');
    expect(r.slot2Value).toBe('\u2014');
    expect(r.slot3Value).toBe('\u2014');
  });
});

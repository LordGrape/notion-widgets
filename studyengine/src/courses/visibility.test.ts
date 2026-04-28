import { describe, it, expect } from 'vitest';
import { resolveCourseGoal, visibleCourseDetailsFields } from './visibility';

describe('visibleCourseDetailsFields (Phase A1)', () => {
  it('always shows name, color, subjectType, planProfile, and courseGoal', () => {
    const fields = visibleCourseDetailsFields({ planProfile: 'theory', courseGoal: 'daily_practice' });
    expect(fields.has('name')).toBe(true);
    expect(fields.has('color')).toBe(true);
    expect(fields.has('subjectType')).toBe(true);
    expect(fields.has('planProfile')).toBe(true);
    expect(fields.has('courseGoal')).toBe(true);
  });

  it('hides assessment fields for a daily-practice conceptual course', () => {
    const fields = visibleCourseDetailsFields({ planProfile: 'theory', courseGoal: 'daily_practice' });
    expect(fields.has('examType')).toBe(false);
    expect(fields.has('examDate')).toBe(false);
    expect(fields.has('examFormat')).toBe(false);
    expect(fields.has('examWeight')).toBe(false);
  });

  it('shows assessment fields for an exam-prep conceptual course', () => {
    const fields = visibleCourseDetailsFields({ planProfile: 'theory', courseGoal: 'exam_prep' });
    expect(fields.has('examType')).toBe(true);
    expect(fields.has('examDate')).toBe(true);
    expect(fields.has('examFormat')).toBe(true);
    expect(fields.has('examWeight')).toBe(true);
  });

  it('shows language fields and hides assessment fields for language daily practice', () => {
    const fields = visibleCourseDetailsFields({ planProfile: 'language', courseGoal: 'daily_practice' });
    expect(fields.has('targetLanguage')).toBe(true);
    expect(fields.has('targetLanguageOther')).toBe(true);
    expect(fields.has('languageLevel')).toBe(true);
    expect(fields.has('examType')).toBe(false);
    expect(fields.has('examDate')).toBe(false);
    expect(fields.has('examFormat')).toBe(false);
    expect(fields.has('examWeight')).toBe(false);
  });

  it('shows language and assessment fields for language exam prep', () => {
    const fields = visibleCourseDetailsFields({ planProfile: 'language', courseGoal: 'exam_prep' });
    expect(fields.has('targetLanguage')).toBe(true);
    expect(fields.has('languageLevel')).toBe(true);
    expect(fields.has('examType')).toBe(true);
    expect(fields.has('examDate')).toBe(true);
    expect(fields.has('examFormat')).toBe(true);
    expect(fields.has('examWeight')).toBe(true);
  });

  it('treats an existing non-language course with exam fields and no courseGoal as exam prep', () => {
    const fields = visibleCourseDetailsFields({ planProfile: 'factual', examDate: '2026-12-01' });
    expect(fields.has('examType')).toBe(true);
    expect(fields.has('examDate')).toBe(true);
    expect(fields.has('targetLanguage')).toBe(false);
  });

  it('defaults an existing course with no courseGoal and no exam fields to daily practice', () => {
    const fields = visibleCourseDetailsFields({ planProfile: 'procedural' });
    expect(fields.has('examType')).toBe(false);
    expect(fields.has('examDate')).toBe(false);
    expect(fields.has('examFormat')).toBe(false);
    expect(fields.has('examWeight')).toBe(false);
  });

  it('does not treat the default mixed assessment context as exam prep by itself', () => {
    const fields = visibleCourseDetailsFields({ planProfile: 'theory', examType: 'mixed' });
    expect(fields.has('examType')).toBe(false);
    expect(fields.has('examDate')).toBe(false);
    expect(fields.has('examFormat')).toBe(false);
    expect(fields.has('examWeight')).toBe(false);
  });
});

describe('resolveCourseGoal (Phase A1)', () => {
  it('returns exam_prep for a legacy exam type without courseGoal', () => {
    expect(resolveCourseGoal({ planProfile: 'theory', examType: 'essay' })).toBe('exam_prep');
  });

  it('returns daily_practice without courseGoal or exam fields', () => {
    expect(resolveCourseGoal({ planProfile: 'theory' })).toBe('daily_practice');
  });

  it('returns daily_practice for the default mixed assessment context alone', () => {
    expect(resolveCourseGoal({ planProfile: 'theory', examType: 'mixed' })).toBe('daily_practice');
  });

  it('lets explicit courseGoal win over legacy exam fields', () => {
    expect(resolveCourseGoal({
      planProfile: 'theory',
      courseGoal: 'project',
      examType: 'essay',
      examDate: '2026-12-01',
    })).toBe('project');
  });
});

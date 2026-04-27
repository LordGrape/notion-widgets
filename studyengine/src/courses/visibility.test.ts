import { describe, it, expect } from 'vitest';
import { visibleCourseDetailsFields } from './visibility';

describe('visibleCourseDetailsFields (Phase L0)', () => {
  it('always shows name, color, subjectType, planProfile', () => {
    const fields = visibleCourseDetailsFields({ planProfile: 'theory' });
    expect(fields.has('name')).toBe(true);
    expect(fields.has('color')).toBe(true);
    expect(fields.has('subjectType')).toBe(true);
    expect(fields.has('planProfile')).toBe(true);
  });

  it.each(['theory', 'factual', 'procedural', undefined] as const)(
    'shows exam fields and hides language fields when planProfile=%s',
    (profile) => {
      const fields = visibleCourseDetailsFields({ planProfile: profile });
      expect(fields.has('examType')).toBe(true);
      expect(fields.has('examDate')).toBe(true);
      expect(fields.has('examFormat')).toBe(true);
      expect(fields.has('examWeight')).toBe(true);
      expect(fields.has('targetLanguage')).toBe(false);
      expect(fields.has('targetLanguageOther')).toBe(false);
      expect(fields.has('languageLevel')).toBe(false);
    },
  );

  it('shows language fields and hides exam fields when planProfile=language', () => {
    const fields = visibleCourseDetailsFields({ planProfile: 'language' });
    expect(fields.has('targetLanguage')).toBe(true);
    expect(fields.has('targetLanguageOther')).toBe(true);
    expect(fields.has('languageLevel')).toBe(true);
    expect(fields.has('examType')).toBe(false);
    expect(fields.has('examDate')).toBe(false);
    expect(fields.has('examFormat')).toBe(false);
    expect(fields.has('examWeight')).toBe(false);
  });
});

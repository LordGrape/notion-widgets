import type { Course } from '../types';

/**
 * Phase L0 — Course Details progressive disclosure.
 *
 * Single source of truth for which fields render in the Course Details tab
 * of the Manage Courses modal (`renderCourseModalEditor`). Pure logic only;
 * the monolith owns the DOM and gates each `inner +=` line on the returned
 * set.
 *
 * Scope is deliberately narrow:
 *   - Hide language-only fields when the course is not a language course.
 *   - Hide exam-only fields when the course is a language course.
 *
 * Aspirational fields (`gradingStyle`, `learnerL1`, `speakingPractice`,
 * `readingIngest`, `defaultPlanProfile`) are intentionally absent — they
 * are not on the `Course` type yet and adding them is out of scope for L0.
 */

export type CourseDetailsFieldId =
  | 'name'
  | 'color'
  | 'subjectType'
  | 'planProfile'
  | 'targetLanguage'
  | 'targetLanguageOther'
  | 'languageLevel'
  | 'examType'
  | 'examDate'
  | 'examFormat'
  | 'examWeight';

const ALWAYS: CourseDetailsFieldId[] = [
  'name',
  'color',
  'subjectType',
  'planProfile',
];

const LANGUAGE_ONLY: CourseDetailsFieldId[] = [
  'targetLanguage',
  'targetLanguageOther',
  'languageLevel',
];

const EXAM_ONLY: CourseDetailsFieldId[] = [
  'examType',
  'examDate',
  'examFormat',
  'examWeight',
];

/**
 * Returns the set of Course Details fields that should render for the given
 * course. The argument is a minimal `Pick` so callers (and tests) do not
 * need to construct a full `Course`. Do not widen the parameter — future
 * fields that influence visibility should be added to the Pick explicitly.
 */
export function visibleCourseDetailsFields(
  course: Pick<Course, 'planProfile'>,
): Set<CourseDetailsFieldId> {
  const out = new Set<CourseDetailsFieldId>(ALWAYS);
  if (course.planProfile === 'language') {
    LANGUAGE_ONLY.forEach((f) => out.add(f));
  } else {
    EXAM_ONLY.forEach((f) => out.add(f));
  }
  return out;
}

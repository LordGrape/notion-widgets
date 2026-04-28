import type { Course, CourseGoal, PlanProfile } from '../types';

/**
 * Phase A1: Course Details adaptive settings hierarchy.
 *
 * Single source of truth for which fields render in the Course Details tab
 * of the Manage Courses modal (`renderCourseModalEditor`). Pure logic only;
 * the monolith owns the DOM and gates each `inner +=` line on the returned
 * set.
 *
 * A1 keeps the axes orthogonal:
 *   - `planProfile` controls pedagogy.
 *   - `courseGoal` controls learning context and assessment pressure.
 */

export type CourseDetailsFieldId =
  | 'name'
  | 'color'
  | 'subjectType'
  | 'planProfile'
  | 'courseGoal'
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
  'courseGoal',
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

type CourseDetailsVisibilityCourse = Pick<
  Course,
  'planProfile' | 'courseGoal' | 'examType' | 'examDate' | 'examFormat' | 'examWeight'
>;

function isCourseGoal(value: unknown): value is CourseGoal {
  return value === 'daily_practice'
    || value === 'exam_prep'
    || value === 'professional_skill'
    || value === 'project';
}

function hasLegacyExamField(course: Partial<CourseDetailsVisibilityCourse>): boolean {
  const hasExplicitAssessmentContext = Boolean(course.examType && course.examType !== 'mixed');
  return Boolean(
    hasExplicitAssessmentContext
      || course.examDate
      || course.examFormat
      || course.examWeight != null,
  );
}

// A1: resolve display behaviour at read time, without mutating course state.
export function resolveCourseGoal(course: Partial<CourseDetailsVisibilityCourse>): CourseGoal {
  if (isCourseGoal(course.courseGoal)) return course.courseGoal;
  if (course.planProfile !== 'language' && hasLegacyExamField(course)) return 'exam_prep';
  return 'daily_practice';
}

// A1: one display mapping for persisted plan-profile enum values.
export function profileLabel(profile: PlanProfile): string {
  if (profile === 'theory') return 'Conceptual';
  if (profile === 'factual') return 'Factual';
  if (profile === 'language') return 'Language';
  return 'Procedural';
}

/**
 * Returns the set of Course Details fields that should render for the given
 * course. The argument is a minimal `Pick` so callers (and tests) do not
 * need to construct a full `Course`. Do not widen the parameter — future
 * fields that influence visibility should be added to the Pick explicitly.
 */
export function visibleCourseDetailsFields(
  course: Partial<CourseDetailsVisibilityCourse>,
): Set<CourseDetailsFieldId> {
  const out = new Set<CourseDetailsFieldId>(ALWAYS);
  if (course.planProfile === 'language') {
    LANGUAGE_ONLY.forEach((f) => out.add(f));
  }
  if (resolveCourseGoal(course) === 'exam_prep') {
    EXAM_ONLY.forEach((f) => out.add(f));
  }
  return out;
}

import type { AppState, Course } from '../types';

/**
 * Phase L0.5b — Dual-mode Home active-course resolver.
 *
 * Resolves whether Home should render in language mode (scoped to a single
 * recently-engaged language course) or theory mode (aggregate, today's
 * default). Pure function. No DOM, no globals, no SyncEngine.
 *
 * Language mode requires all four:
 *   1. `featureFlags.run5Language === true`
 *   2. `state.ui.lastOpenedCourseId` is a non-empty string
 *   3. A course with that id exists in `state.courses`
 *   4. That course's `planProfile === 'language'`
 *
 * Theory mode otherwise. Theory mode is byte-identical to the existing
 * Home behaviour.
 */

export type HomeMode =
  | { mode: 'language'; course: Course; courseId: string }
  | { mode: 'theory' };

export interface ResolveArgs {
  state: Pick<AppState, 'courses' | 'ui'>;
  featureFlags: { run5Language: boolean };
}

const THEORY: HomeMode = { mode: 'theory' };

export function resolveActiveHomeCourse(args: ResolveArgs): HomeMode {
  const { state, featureFlags } = args;
  if (!featureFlags.run5Language) return THEORY;
  const lastId = state.ui && state.ui.lastOpenedCourseId;
  if (!lastId) return THEORY;
  const courses = state.courses || {};
  for (const key in courses) {
    if (!Object.prototype.hasOwnProperty.call(courses, key)) continue;
    const c = courses[key];
    if (!c || c.id !== lastId) continue;
    if (c.planProfile !== 'language') return THEORY;
    return { mode: 'language', course: c, courseId: lastId };
  }
  return THEORY;
}

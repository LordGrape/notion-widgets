/**
 * Application layer (L2): tutor body builders for the learn flow.
 * Split verbatim from src/learn-flow.ts in Phase V2c (2026-08-18).
 * These were module-private; they are exported here so the split flow
 * modules (flow-state, flow-streaming) can share them.
 * NOTE: buildAdvanceTutorBody has no call sites as of V2c; retained
 * verbatim pending the owner's deletion decision.
 */
import type { LearnSegment } from './types';
import { shouldShowPrequestion } from '../../learn-prequestion';

/**
 * Pick the body that should render inside the UI's Teach block for a
 * freshly-entered segment. Prefers the declarative `teach` field (added
 * in the Defect 1 fix); falls back to `tutorPrompt` for older plans so the
 * UI still renders something meaningful if a legacy plan is hydrated from
 * cache or SyncEngine.
 */
export function segmentTeachBody(segment: LearnSegment): string {
  const teach = String(segment?.teach || '').trim();
  if (teach) return teach;
  return String(segment?.tutorPrompt || '').trim();
}

export function segmentNeedsPrequestion(segment: LearnSegment | undefined): boolean {
  if (!segment) return false;
  if (!segment.checkType) return false;
  return shouldShowPrequestion(
    String(segment.checkType || ''),
    segment.fadeLevel,
    segment.isProbe
  );
}

export function buildInitialTutorBody(segment: LearnSegment): string {
  const title = String(segment.title || '').trim();
  const body = segmentTeachBody(segment);
  if (title && body) return `**${title}**\n\n${body}`;
  return body || title || 'Ready when you are.';
}

export function buildContinuingTutorBody(feedback: string, nextPrompt: string, segment: LearnSegment | null): string {
  const parts: string[] = [];
  if (feedback) parts.push(feedback);
  if (nextPrompt) parts.push(nextPrompt);
  if (!parts.length && segment) parts.push(segmentTeachBody(segment));
  return parts.join('\n\n').trim() || 'Keep going.';
}

export function buildAdvanceTutorBody(feedback: string, nextSeg: LearnSegment | undefined): string {
  const parts: string[] = [];
  if (feedback) parts.push(feedback);
  if (nextSeg) {
    const nextTitle = String(nextSeg.title || '').trim();
    const nextBody = segmentTeachBody(nextSeg);
    if (nextTitle) parts.push(`**Next: ${nextTitle}**`);
    if (nextBody) parts.push(nextBody);
  }
  return parts.join('\n\n').trim() || 'Moving on.';
}

export function buildClosingTutorBody(feedback: string): string {
  const base = feedback ? feedback.trim() : '';
  const outro = 'Learn session complete. You can consolidate the cards you\'ve covered or exit.';
  return base ? `${base}\n\n${outro}` : outro;
}

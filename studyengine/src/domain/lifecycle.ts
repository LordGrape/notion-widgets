import type { StudyItem } from '../types';

/**
 * Domain layer (L1): card lifecycle.
 *
 * Moved verbatim from src/learn-mode.ts on 2026-08-18 (Phase V1a, ADR-0001).
 * Pure functions over StudyItem. No DOM, no network, no SyncEngine.
 *
 * Stages: new | encoding | consolidating | maintaining | relearning | retired.
 * Transition rules are governed by the design contract (Design Principles and
 * Card Lifecycle, section 2). Change them only through that document.
 */

export function deriveLifecycleStage(item: StudyItem): StudyItem['lifecycleStage'] {
  if (item.suspended === true && item.archived === true) return 'retired';
  if (item.fsrs?.state === 'relearning') return 'relearning';
  if (item.learnStatus === 'consolidated' && item.fsrs?.state === 'review') return 'maintaining';
  if (item.learnStatus === 'taught') return 'consolidating';
  if (item.learnStatus === 'unlearned') return 'encoding';
  if (item.learnStatus == null && !item.fsrs?.lastReview) return 'new';
  if (item.fsrs?.lastReview) return 'maintaining';
  return 'new';
}

export function setLifecycleStage(item: StudyItem, stage: StudyItem['lifecycleStage']): void {
  item.lifecycleStage = stage;
}

export function applyLearnStatusMigration(items: Record<string, StudyItem>): void {
  Object.keys(items || {}).forEach((itemId) => {
    const item = items[itemId];
    if (!item) return;
    if (typeof item.learnStatus === 'undefined') {
      item.learnStatus = null;
    }
    if (typeof item.consolidationRating === 'undefined') {
      item.consolidationRating = null;
    }
  });
  Object.keys(items || {}).forEach((itemId) => {
    const item = items[itemId];
    if (!item) return;
    setLifecycleStage(item, deriveLifecycleStage(item));
  });
}

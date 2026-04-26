import type { AppState, StudyItem } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

declare const uid: (() => string) | undefined;

export type GenerativeAuthoringMode = 'rephrase' | 'mnemonic' | 'worked_example_link';

export type GenerativeDraft = {
  sourceCardId: string;
  mode: GenerativeAuthoringMode;
  prompt: string;
  modelAnswer: string;
  linkedWorkedExampleCardId?: string;
};

function makeId(): string {
  if (typeof uid === 'function') return uid();
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `card_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function resolveRootCard(source: StudyItem, items: Record<string, StudyItem>): StudyItem {
  let current = source;
  const visited = new Set<string>();
  while (current.parentCardId && items[current.parentCardId] && !visited.has(current.parentCardId)) {
    visited.add(current.id);
    current = items[current.parentCardId];
  }
  return current;
}

export function detectGenerativeCandidates(
  sessionRatings: Array<{ cardId: string; rating: 1 | 2 | 3 | 4; ts: number }>,
  items: Record<string, StudyItem>,
  nowTs: number
): StudyItem[] {
  const cutoff = nowTs - 14 * DAY_MS;
  const counts = new Map<string, number>();
  const sessionTouched = new Set<string>();
  Object.keys(items || {}).forEach((id) => {
    const item = items[id];
    if (!item) return;
    const historical = (item.reviewLog || []).filter((event: any) => event && event.rating === 1 && Number(event.at) >= cutoff).length;
    if (historical > 0) counts.set(id, historical);
  });
  (sessionRatings || []).forEach((entry) => {
    if (!entry || entry.rating !== 1 || entry.ts < cutoff) return;
    sessionTouched.add(entry.cardId);
    counts.set(entry.cardId, (counts.get(entry.cardId) || 0) + 1);
  });
  return Array.from(counts.entries())
    .filter(([cardId, count]) => count >= 2 && sessionTouched.has(cardId))
    .map(([cardId]) => items[cardId])
    .filter((item): item is StudyItem => !!item)
    .slice(0, 5);
}

export function createSiblingCard(draft: GenerativeDraft, state: AppState, nowTs: number): StudyItem {
  const source = state.items[draft.sourceCardId];
  if (!source) throw new Error('Source card not found for generative sibling card.');
  const root = resolveRootCard(source, state.items);
  const id = makeId();
  const sibling: StudyItem = {
    id,
    prompt: draft.prompt,
    modelAnswer: draft.modelAnswer,
    created: new Date(nowTs).toISOString(),
    course: source.course,
    subDeck: source.subDeck || null,
    tags: Array.isArray(source.tags) ? source.tags.slice() : undefined,
    parentCardId: root.id,
    learnStatus: 'consolidated',
    lifecycleStage: 'consolidating',
    fsrs: {
      difficulty: 4.5,
      stability: 5,
      due: new Date(nowTs + 5 * DAY_MS).toISOString(),
      state: 'review',
      reps: 0,
      lapses: 0,
      lastReview: null
    },
    source: {
      type: 'learner-authored',
      authoredFromCardId: source.id,
      mode: draft.mode
    } as any
  };
  root.siblingCardIds = root.siblingCardIds || [];
  root.siblingCardIds.push(id);
  state.items[id] = sibling;
  return sibling;
}

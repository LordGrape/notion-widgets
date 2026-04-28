import type { StudyItem } from './types';

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function familyKey(item: StudyItem): string {
  return item.parentCardId || `__solo__${item.id}`;
}

function validOrder(items: StudyItem[]): boolean {
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const curr = items[i];
    const prevSubDeck = prev.subDeck == null ? `__solo_sd__${prev.id}` : String(prev.subDeck);
    const currSubDeck = curr.subDeck == null ? `__solo_sd__${curr.id}` : String(curr.subDeck);
    if (prevSubDeck === currSubDeck) return false;
    if (familyKey(prev) === familyKey(curr)) return false;
  }
  return true;
}

export function interleaveQuickFireQueue(items: StudyItem[]): StudyItem[] {
  if (items.length <= 2) return items;
  let last = items.slice();
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = shuffle(items);
    last = candidate;
    if (validOrder(candidate)) return candidate;
  }
  console.warn('[StudyEngine] Quick Fire interleave constraints unsatisfied; using plain shuffle fallback.');
  return last;
}

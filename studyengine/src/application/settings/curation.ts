/**
 * Application layer (L2): curated deck catalog and French Core import snapshot.
 * Split verbatim from src/settings.ts in Phase V2b (2026-08-18).
 */
import type { AppState } from '../../types';
import type { CuratedDeckEntry, FrenchCoreImportSnapshot } from './types';

export const CURATED_DECKS: ReadonlyArray<CuratedDeckEntry> = [
  {
    // L1b-alpha-hotfix: static curated deck path remains unchanged.
    id: 'french-core-50-sample',
    label: 'Import French Core 50 (sample)',
    source: 'static',
    dataPath: './data/french-core-50-sample.json',
    courseHint: 'French',
  },
  {
    // L1b-alpha-hotfix: worker-built curated deck entry (dev-mode orchestrated).
    id: 'french-core-2000',
    label: 'French — Core 2000 (built server-side)',
    source: 'worker',
    workerEndpoint: '/studyengine/decks/french-core-2000',
    courseHint: 'French',
  },
];

export function getFrenchCoreImportSnapshot(state: AppState): FrenchCoreImportSnapshot {
  let activeCount = 0;
  let archivedCount = 0;
  const items = state.items || {};
  for (const id in items) {
    if (!Object.prototype.hasOwnProperty.call(items, id)) continue;
    const item = items[id];
    if (!item) continue;
    const tags = Array.isArray(item.tags) ? item.tags : [];
    const subDeck = String(item.subDeck || item.subdeck || '');
    const isFrenchCore =
      tags.includes('french-core-2000') ||
      (item.course === 'French' && subDeck === 'Core 2000' && String(item.targetLanguage || '').startsWith('fr'));
    if (!isFrenchCore) continue;
    if (item.archived) archivedCount += 1;
    else activeCount += 1;
  }
  return { activeCount, archivedCount, totalCount: activeCount + archivedCount };
}

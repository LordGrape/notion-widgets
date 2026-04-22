import { computeCoverageRatio } from './learn-coverage';
import { getCourseSubDeckEntries } from './learn-mode';
import type { AppState, StudyItem } from './types';

interface SubDeckRailCounts {
  consolidated: number;
  taught: number;
  unlearned: number;
  total: number;
}

interface SubDeckRailEntry {
  key: string;
  name: string;
  counts: SubDeckRailCounts;
}

interface RenderSnapshot {
  signature: string;
}

const rootSnapshots = new WeakMap<HTMLElement, RenderSnapshot>();

/**
 * Render the Learn tab sub-deck rail for a course.
 *
 * Idempotent: if relevant course/sub-deck composition and learn-status counts
 * have not changed for this root, no DOM write occurs.
 */
export function renderLearnSubDeckRail(root: HTMLElement, courseId: string, state: AppState): void {
  const safeCourseId = String(courseId || '');
  const entries = buildEntries(state, safeCourseId);
  const allItems = getCourseItems(state, safeCourseId);
  const coverage = computeCoverageRatio(allItems);
  const activeSubDeck = getActiveSubDeck(state, safeCourseId);

  const signature = [
    safeCourseId,
    activeSubDeck || '',
    coverage.consolidated,
    coverage.total,
    ...entries.map((entry) => `${entry.key}:${entry.counts.consolidated}:${entry.counts.taught}:${entry.counts.unlearned}:${entry.counts.total}`)
  ].join('|');

  const prev = rootSnapshots.get(root);
  if (prev && prev.signature === signature) return;

  root.innerHTML = buildRailHtml(safeCourseId, entries, coverage, activeSubDeck, state);
  wireArrowNavigation(root);
  rootSnapshots.set(root, { signature });
}

function buildEntries(state: AppState, courseId: string): SubDeckRailEntry[] {
  const source = getCourseSubDeckEntries(courseId, state);
  return source.map((entry) => {
    const counts = getSubDeckLearnCounts(state, courseId, entry.key);
    return {
      key: entry.key,
      name: String(entry.meta.name || entry.key),
      counts
    };
  });
}

function getCourseItems(state: AppState, courseId: string): StudyItem[] {
  return Object.values(state?.items || {}).filter((item): item is StudyItem => !!item && item.course === courseId);
}

export function getSubDeckLearnCounts(state: AppState, courseId: string, subDeckKey: string): SubDeckRailCounts {
  let consolidated = 0;
  let taught = 0;
  let unlearned = 0;
  let total = 0;
  const items = state?.items || {};

  Object.keys(items).forEach((itemId) => {
    const item = items[itemId];
    if (!item || item.course !== courseId || item.subDeck !== subDeckKey || item.archived) return;
    total += 1;
    if (item.learnStatus === 'consolidated') consolidated += 1;
    else if (item.learnStatus === 'taught') taught += 1;
    else unlearned += 1;
  });

  return { consolidated, taught, unlearned, total };
}

function getActiveSubDeck(state: AppState, courseId: string): string | null {
  const ls = state.learnSession;
  if (ls && ls.course === courseId && ls.subDeck) {
    return String(ls.subDeck);
  }
  const selected = state?.ui?.learnSelectedSubDeck?.[courseId];
  return selected ? String(selected) : null;
}

function buildRailHtml(
  courseId: string,
  entries: SubDeckRailEntry[],
  coverage: { consolidated: number; total: number; percent: number },
  activeSubDeck: string | null,
  state: AppState
): string {
  const courseColor = state?.courses?.[courseId]?.color || 'var(--accent-primary)';
  const ring = renderCoverageRing(coverage.percent);
  const hasEntries = entries.length > 0;

  return `
    <div class="learn-rail-course-row">
      <span class="learn-rail-course-icon" aria-hidden="true" style="background:${escapeHtml(courseColor)};"></span>
      <span class="learn-rail-course-name" title="${escapeHtml(courseId)}">${escapeHtml(courseId)}</span>
    </div>
    <section class="learn-rail-coverage" aria-label="Course encoding coverage">
      ${ring}
      <p class="learn-rail-coverage-copy">${coverage.consolidated} of ${coverage.total} consolidated</p>
    </section>
    <div class="learn-rail-list" role="list">
      ${hasEntries ? entries.map((entry) => renderSubDeckButton(entry, activeSubDeck)).join('') : '<p class="learn-rail-empty">No sub-decks yet.</p>'}
    </div>
  `;
}

function renderSubDeckButton(entry: SubDeckRailEntry, activeSubDeck: string | null): string {
  const isActive = activeSubDeck === entry.key;
  const allConsolidated = entry.counts.total > 0 && entry.counts.consolidated === entry.counts.total;

  return `
    <button type="button" class="learn-subdeck${isActive ? ' is-active' : ''}" data-learn-subdeck-key="${escapeHtml(entry.key)}" role="button" ${isActive ? 'aria-current="true"' : ''}>
      <div class="learn-subdeck-main">
        <div class="learn-subdeck-name-row">
          <span class="learn-subdeck-name">${escapeHtml(entry.name)}</span>
          ${allConsolidated ? renderCheckIcon() : ''}
        </div>
        <div class="learn-subdeck-dots" aria-label="Consolidated ${entry.counts.consolidated}, taught ${entry.counts.taught}, unlearned ${entry.counts.unlearned}">
          <span class="learn-subdeck-dot-group"><span class="learn-subdeck-dot is-consolidated" aria-hidden="true"></span><span>${entry.counts.consolidated}</span></span>
          <span class="learn-subdeck-dot-group"><span class="learn-subdeck-dot is-taught" aria-hidden="true"></span><span>${entry.counts.taught}</span></span>
          <span class="learn-subdeck-dot-group"><span class="learn-subdeck-dot is-unlearned" aria-hidden="true"></span><span>${entry.counts.unlearned}</span></span>
        </div>
      </div>
      <span class="learn-subdeck-badge">${entry.counts.consolidated}/${entry.counts.total}</span>
    </button>
  `;
}

function renderCoverageRing(percent: number): string {
  const size = 72;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference * (1 - clamped / 100);

  return `<svg class="learn-rail-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" class="learn-rail-ring-track"></circle>
    <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" class="learn-rail-ring-fill" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" class="learn-rail-ring-label">${clamped}%</text>
  </svg>`;
}

function renderCheckIcon(): string {
  return `<svg class="learn-subdeck-check" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5"></path></svg>`;
}

function wireArrowNavigation(root: HTMLElement): void {
  if ((root as HTMLElement & { __learnRailWired?: boolean }).__learnRailWired) return;
  (root as HTMLElement & { __learnRailWired?: boolean }).__learnRailWired = true;

  root.addEventListener('keydown', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.matches('[data-learn-subdeck-key]')) return;
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const buttons = Array.from(root.querySelectorAll<HTMLElement>('[data-learn-subdeck-key]'));
    const idx = buttons.indexOf(target);
    if (idx < 0) return;
    const next = event.key === 'ArrowDown'
      ? Math.min(buttons.length - 1, idx + 1)
      : Math.max(0, idx - 1);
    const nextBtn = buttons[next];
    if (nextBtn) {
      nextBtn.focus();
      event.preventDefault();
    }
  });
}

function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

(globalThis as typeof globalThis & { __studyEngineLearnRail?: Record<string, unknown> }).__studyEngineLearnRail = {
  renderLearnSubDeckRail,
  getSubDeckLearnCounts
};

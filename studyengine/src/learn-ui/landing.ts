export interface LearnLandingCounts {
  consolidated: number;
  taught: number;
  unlearned: number;
  total: number;
}

export interface LearnStatusLabels {
  unlearned: string;
  taught: string;
  consolidated: string;
}

export interface LearnEmptyCopy {
  heading: string;
  body: string;
  cta: string;
  encodingLabel: string;
  retrievalLabel: string;
}

export interface LearnSubDeckLandingView {
  subDeckName: string;
  counts: LearnLandingCounts;
  cacheLine: string;
  labels: LearnStatusLabels;
  startLabel: string;
  regenerateLabel: string;
  hasCache: boolean;
}

export function renderLearnEmptyStateHtml(copy: LearnEmptyCopy): string {
  return ''
    + '<div class="learn-empty-pedagogy">'
    + '<div class="learn-empty-stage" aria-hidden="true">'
    + '<div class="learn-loop-card learn-loop-card--model"><span>' + escapeHtml(copy.encodingLabel) + '</span><strong>Model the idea</strong></div>'
    + '<div class="learn-loop-card learn-loop-card--produce"><span>Your Turn</span><strong>Explain it back</strong></div>'
    + '<div class="learn-loop-card learn-loop-card--feedback"><span>' + escapeHtml(copy.retrievalLabel) + '</span><strong>Calibrate before review</strong></div>'
    + '</div>'
    + '<div class="learn-empty-copy">'
    + '<h2>' + escapeHtml(copy.heading) + '</h2>'
    + '<p class="learn-empty-body">' + escapeHtml(copy.body) + '</p>'
    + '<div class="learn-empty-step-grid" aria-label="Learn loop">'
    + '<div class="learn-empty-step"><span class="learn-empty-step-mark">1</span><strong>Worked example</strong><span>Start with the reasoning chain.</span></div>'
    + '<div class="learn-empty-step"><span class="learn-empty-step-mark">2</span><strong>Production</strong><span>Answer in your own words.</span></div>'
    + '<div class="learn-empty-step"><span class="learn-empty-step-mark">3</span><strong>Feedback</strong><span>Adjust before review.</span></div>'
    + '</div>'
    + '<p class="learn-empty-cta">' + escapeHtml(copy.cta) + '</p>'
    + '</div>'
    + '</div>';
}

export function renderLearnSubDeckLandingHtml(view: LearnSubDeckLandingView): string {
  const total = normalizeCount(view.counts.total);
  const consolidated = normalizeCount(view.counts.consolidated);
  const taught = normalizeCount(view.counts.taught);
  const unlearned = normalizeCount(view.counts.unlearned);
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((consolidated / total) * 100))) : 0;

  return ''
    + '<div class="learn-subdeck-landing">'
    + '<div class="learn-subdeck-landing-card">'
    + '<div>'
    + '<div class="learn-landing-kicker">Selected sub-deck</div>'
    + '<h3>' + escapeHtml(view.subDeckName) + '</h3>'
    + '</div>'
    + '<p class="learn-subdeck-status">' + total + ' cards in scope</p>'
    + '<div class="learn-landing-meter" aria-hidden="true"><span class="learn-landing-meter-fill" style="width:' + pct + '%"></span></div>'
    + '<div class="learn-landing-counts" aria-label="Learn status counts">'
    + '<div class="learn-landing-count"><strong>' + unlearned + '</strong><span>' + escapeHtml(view.labels.unlearned) + '</span></div>'
    + '<div class="learn-landing-count"><strong>' + taught + '</strong><span>' + escapeHtml(view.labels.taught) + '</span></div>'
    + '<div class="learn-landing-count"><strong>' + consolidated + '</strong><span>' + escapeHtml(view.labels.consolidated) + '</span></div>'
    + '</div>'
    + '<p class="learn-subdeck-cache-status">' + escapeHtml(view.cacheLine) + '</p>'
    + '<div class="learn-landing-actions">'
    + '<button type="button" class="learn-start-btn learn-landing-start-btn" id="learnLandingStartBtn"' + (total > 0 ? '' : ' disabled') + '>' + escapeHtml(view.startLabel) + '</button>'
    + (view.hasCache ? '<button type="button" class="learn-regen-btn secondary" id="learnLandingRegenBtn">' + escapeHtml(view.regenerateLabel) + '</button>' : '')
    + '</div>'
    + '</div>'
    + '</div>';
}

function normalizeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function escapeHtml(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

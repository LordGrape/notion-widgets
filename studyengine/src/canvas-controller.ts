import { effect } from '@preact/signals';
import { items, courses, settings, stats, calibration, currentView } from './signals';
import { countDue, avgRetention, esc } from './utils';

function ctx2d(id: string): CanvasRenderingContext2D | null {
  const c = document.getElementById(id) as HTMLCanvasElement | null;
  return c?.getContext('2d') || null;
}

export function drawRetentionCurve(): void {
  const ctx = ctx2d('retentionCanvas');
  if (!ctx) return;
  const canvas = ctx.canvas;
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || Number(canvas.getAttribute('height') || 200);
  canvas.width = w;
  canvas.height = h;

  ctx.clearRect(0, 0, w, h);

  const all = Object.values(items.value).filter((it) => it && !it.archived);
  const retention = Math.max(0.35, Math.min(0.99, avgRetention(items.value) ?? (settings.value.desiredRetention || 0.9)));
  const base = Math.pow(retention, 1 / 7);

  ctx.beginPath();
  ctx.strokeStyle = 'rgba(139,92,246,0.9)';
  ctx.lineWidth = 2;
  for (let d = 0; d <= 30; d++) {
    const x = (d / 30) * (w - 20) + 10;
    const yv = Math.pow(base, d);
    const y = h - 16 - yv * (h - 28);
    if (d === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.fillStyle = 'var(--text-secondary)';
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.fillText(`${all.length} cards`, 10, 14);
}

export function drawSparkline(): void {
  const ctx = ctx2d('heroSparkline');
  if (!ctx) return;
  const canvas = ctx.canvas;
  const w = canvas.clientWidth || 180;
  const h = canvas.clientHeight || 48;
  canvas.width = w;
  canvas.height = h;
  ctx.clearRect(0, 0, w, h);

  const hist = calibration.value.history || [];
  const points = hist.slice(-24).map((v) => (v.correct ? 1 : 0));
  const data = points.length ? points : [0.55, 0.62, 0.58, 0.7, 0.75, 0.78];
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(167,139,250,0.95)';
  ctx.lineWidth = 2;
  data.forEach((v, i) => {
    const x = (i / Math.max(1, data.length - 1)) * (w - 4) + 2;
    const y = h - 2 - Math.max(0, Math.min(1, v)) * (h - 6);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

export function drawTierRing(): void {
  const ctx = ctx2d('tierRingCanvas');
  if (!ctx) return;
  const canvas = ctx.canvas;
  const size = Math.min(canvas.clientWidth || 120, canvas.clientHeight || 120);
  canvas.width = size;
  canvas.height = size;
  ctx.clearRect(0, 0, size, size);

  const due = countDue(items.value).byTier;
  const total = Object.values(due).reduce((a, b) => a + b, 0) || 1;
  const tiers = [
    ['quickfire', '#3b82f6'],
    ['explain', '#22c55e'],
    ['apply', '#f59e0b'],
    ['distinguish', '#8b5cf6'],
    ['mock', '#ef4444'],
    ['worked', '#06b6d4'],
  ] as const;

  let start = -Math.PI / 2;
  tiers.forEach(([tier, color]) => {
    const val = due[tier] || 0;
    if (!val) return;
    const sweep = (val / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.arc(size / 2, size / 2, size / 2 - 12, start, start + sweep);
    ctx.stroke();
    start += sweep;
  });
}

function renderLearnModeView(): void {
  const content = document.getElementById('learnContent');
  if (!content) return;

  const all = Object.values(items.value).filter((it) => it && !it.archived);
  const byCourse = new Map<string, number>();
  all.forEach((it) => byCourse.set(it.course || 'Unassigned', (byCourse.get(it.course || 'Unassigned') || 0) + 1));

  content.innerHTML =
    '<div class="learn-dashboard-stats">' +
      '<div class="learn-dash-header">Learn mode overview</div>' +
      '<div class="learn-dash-row">' +
        `<div class="learn-dash-stat"><div class="learn-dash-val">${all.length}</div><div class="learn-dash-label">Cards</div></div>` +
        `<div class="learn-dash-stat"><div class="learn-dash-val">${Object.keys(courses.value).length}</div><div class="learn-dash-label">Courses</div></div>` +
        `<div class="learn-dash-stat"><div class="learn-dash-val">${stats.value.streakDays || 0}</div><div class="learn-dash-label">Streak</div></div>` +
        `<div class="learn-dash-stat"><div class="learn-dash-val">${Math.round((settings.value.desiredRetention || 0.9) * 100)}%</div><div class="learn-dash-label">Target</div></div>` +
      '</div>' +
    '</div>' +
    '<div class="learn-heatmap-section">' +
      '<div class="learn-summary-section-title">Topics by course</div>' +
      '<div class="learn-heatmap-grid">' +
        [...byCourse.entries()].map(([name, count]) =>
          `<div class="learn-heatmap-cell ${count > 10 ? 'in-progress' : 'not-started'}"><div class="learn-heatmap-name">${esc(name)}</div><div class="learn-heatmap-meta">${count} cards</div></div>`
        ).join('') +
      '</div>' +
    '</div>';
}

export function initCanvasController(): void {
  effect(() => {
    items.value;
    settings.value;
    stats.value;
    calibration.value;
    drawRetentionCurve();
    drawSparkline();
    drawTierRing();
  });

  effect(() => {
    const view = currentView.value;
    items.value;
    courses.value;
    settings.value;
    stats.value;
    if (view === 'learn') renderLearnModeView();
  });

  document.getElementById('learnExitBtn')?.addEventListener('click', () => {
    currentView.value = 'dashboard';
  });
}

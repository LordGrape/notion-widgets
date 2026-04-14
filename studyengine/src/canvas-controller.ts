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

  const padding = { top: 20, right: 20, bottom: 35, left: 40 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  ctx.clearRect(0, 0, w, h);

  const all = Object.values(items.value).filter((it) => it && !it.archived);
  const retention = Math.max(0.35, Math.min(0.99, avgRetention(items.value) ?? (settings.value.desiredRetention || 0.9)));
  const base = Math.pow(retention, 1 / 7);

  // Calculate points for the curve
  const points: { x: number; y: number; yv: number }[] = [];
  for (let d = 0; d <= 30; d++) {
    const x = padding.left + (d / 30) * chartW;
    const yv = Math.pow(base, d);
    const y = padding.top + chartH - yv * chartH;
    points.push({ x, y, yv });
  }

  // Draw gradient fill under the curve
  const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
  gradient.addColorStop(0, 'rgba(139, 92, 246, 0.35)');
  gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.15)');
  gradient.addColorStop(1, 'rgba(139, 92, 246, 0.02)');

  ctx.beginPath();
  ctx.moveTo(points[0].x, padding.top + chartH);
  for (let i = 0; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Draw grid lines
  ctx.strokeStyle = 'rgba(var(--accent-rgb), 0.08)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  // Horizontal grid lines (retention %)
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (i / 4) * chartH;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartW, y);
    ctx.stroke();
  }

  // Vertical grid lines (days)
  for (let i = 0; i <= 6; i++) {
    const x = padding.left + (i / 6) * chartW;
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, padding.top + chartH);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Draw the curve line
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.95)';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < points.length; i++) {
    if (i === 0) ctx.moveTo(points[i].x, points[i].y);
    else ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();

  // Add glow effect to the line
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.3)';
  ctx.lineWidth = 6;
  for (let i = 0; i < points.length; i++) {
    if (i === 0) ctx.moveTo(points[i].x, points[i].y);
    else ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();

  // Draw Y-axis labels (retention %)
  ctx.fillStyle = 'var(--text-tertiary)';
  ctx.font = '10px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const pct = 100 - i * 25;
    const y = padding.top + (i / 4) * chartH;
    ctx.fillText(`${pct}%`, padding.left - 8, y);
  }

  // Draw X-axis labels (days)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const dayLabels = ['Today', '5d', '10d', '15d', '20d', '25d', '30d'];
  for (let i = 0; i <= 6; i++) {
    const x = padding.left + (i / 6) * chartW;
    ctx.fillText(dayLabels[i], x, padding.top + chartH + 8);
  }

  // Draw title with card count
  ctx.fillStyle = 'var(--text-secondary)';
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${all.length} cards tracked`, padding.left, 14);
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

export function drawActivityHeatmap(): void {
  const container = document.getElementById('activityHeatmapHost');
  if (!container) return;

  // Clear existing content
  container.innerHTML = '';

  // Create canvas for the heatmap
  const canvas = document.createElement('canvas');
  canvas.id = 'activityHeatmap';
  canvas.style.width = '100%';
  canvas.style.height = 'auto';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Set canvas dimensions
  const cellSize = 20;
  const gap = 3;
  const cols = 7; // Days of week
  const rows = 5; // Weeks
  const padding = { top: 25, right: 10, bottom: 10, left: 35 };

  const w = padding.left + cols * (cellSize + gap) + padding.right;
  const h = padding.top + rows * (cellSize + gap) + padding.bottom;

  canvas.width = w;
  canvas.height = h;

  // Get daily review data from stats
  const dailyHistory = stats.value?.dailyHistory || {};
  const today = new Date();

  // Generate last 30 days of data
  const dayData: { date: Date; count: number; label: string }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const count = dailyHistory[key]?.reviews || 0;
    dayData.push({
      date: d,
      count,
      label: key
    });
  }

  // Find max count for normalization
  const maxCount = Math.max(1, ...dayData.map(d => d.count));

  // Color scale function (green intensity based on review count)
  const getCellColor = (count: number): string => {
    if (count === 0) return 'rgba(var(--accent-rgb), 0.06)';
    const intensity = Math.min(1, count / Math.max(1, maxCount * 0.6));
    // Green gradient from subtle to vibrant
    const r = Math.floor(34 + (16 - 34) * intensity);
    const g = Math.floor(197 + (185 - 197) * intensity);
    const b = Math.floor(94 + (129 - 94) * intensity);
    const a = 0.25 + intensity * 0.65;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  };

  // Draw day labels (Mon, Wed, Fri)
  ctx.fillStyle = 'var(--text-tertiary)';
  ctx.font = '9px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  const dowLabels = ['Mon', 'Wed', 'Fri'];
  for (let row = 0; row < rows; row++) {
    if (row % 2 === 0 && row < 5) {
      const y = padding.top + row * (cellSize + gap) + cellSize / 2;
      ctx.fillText(dowLabels[row / 2 | 0] || '', padding.left - 6, y);
    }
  }

  // Draw month labels at top
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  const months: string[] = [];
  dayData.forEach((day, idx) => {
    const col = idx % 7;
    const month = day.date.toLocaleDateString('en-US', { month: 'short' });
    if (col === 3 && !months.includes(month)) {
      months.push(month);
      const x = padding.left + col * (cellSize + gap) + cellSize / 2;
      ctx.fillText(month, x, padding.top - 8);
    }
  });

  // Draw cells
  dayData.forEach((day, idx) => {
    const col = idx % 7;
    const row = Math.floor(idx / 7);

    const x = padding.left + col * (cellSize + gap);
    const y = padding.top + row * (cellSize + gap);

    // Cell background
    ctx.fillStyle = getCellColor(day.count);
    ctx.beginPath();
    ctx.roundRect(x, y, cellSize, cellSize, 4);
    ctx.fill();

    // Cell border (subtle)
    ctx.strokeStyle = 'rgba(var(--accent-rgb), 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Highlight today
    const isToday = day.date.toDateString() === today.toDateString();
    if (isToday) {
      ctx.strokeStyle = 'var(--accent)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });

  // Draw legend
  const legendY = h - 5;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'var(--text-tertiary)';
  ctx.font = '9px Inter, system-ui, sans-serif';
  ctx.fillText('Less', padding.left, legendY);

  // Legend boxes
  const legendBoxes = 4;
  for (let i = 0; i < legendBoxes; i++) {
    const x = padding.left + 30 + i * 14;
    const intensity = i / (legendBoxes - 1);
    const count = Math.round(intensity * maxCount * 0.6);
    ctx.fillStyle = getCellColor(count);
    ctx.beginPath();
    ctx.roundRect(x, legendY - 10, 12, 12, 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(var(--accent-rgb), 0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.textAlign = 'left';
  ctx.fillText('More', padding.left + 30 + legendBoxes * 14 + 4, legendY);
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
    drawActivityHeatmap();
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

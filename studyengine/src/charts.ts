import type { StudyItem } from './types';

const el = (id: string): HTMLElement | null => document.getElementById(id);
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
declare const SyncEngine: {
  get: (namespace: string, key: string) => unknown;
};
declare const __studyEngineSessionFlow: {
  state?: Record<string, any>;
  retrievability?: (fsrs: any, timestamp: number) => number;
} | undefined;
declare const gsap: {
  fromTo: (target: unknown, fromVars: Record<string, unknown>, toVars: Record<string, unknown>) => void;
  killTweensOf: (target: Element) => void;
};
declare const playClick: (() => void) | undefined;

interface CanvasContextResult {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}

interface RetentionPoint {
  day: number;
  retention: number;
  x: number;
  y: number;
}

interface RetentionGraphSnapshot {
  points: RetentionPoint[];
  pad: { top: number; right: number; bottom: number; left: number };
  gw: number;
  gh: number;
  w: number;
  h: number;
  days: number;
  itemCount: number;
  label: string;
  chartSettings: RetentionChartSettings;
  lastItemsByFilter: Record<string, StudyItem>;
  lastLabelPrefix: string;
  baseImage?: ImageData;
}

export interface RetentionChartSettings {
  desiredRetention: number;
}

interface SessionHistoryRow {
  ts?: string;
  rating?: number;
  tier?: 'quickfire' | 'explain' | 'apply' | 'distinguish' | 'mock' | 'worked';
}

interface TutorSessionRow {
  date?: string;
  cards?: number;
}

interface TutorAnalytics {
  sessionHistory?: TutorSessionRow[];
}

/* Stores computed point data per canvas for hover lookups */
const retentionGraphData: Record<string, RetentionGraphSnapshot | null> = {};

/* Wire canvas mouse/touch events for retention graphs */
const wiredRetentionCanvases: Record<string, boolean> = {};

export function getCanvasCtx(canvasId: string, w: number, h: number): CanvasContextResult | null {
  const c = el(canvasId) as HTMLCanvasElement | null;
  if (!c) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = w * dpr;
  c.height = h * dpr;
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.scale(dpr, dpr);
  return { ctx, w, h };
}

export function getAccentRGB(): string {
  const s = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim();
  return s || '139,92,246';
}

export function getTextSecondary(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#6b7280';
}

export function getTextColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#1a1a2e';
}

export function drawRetentionCurve(
  canvasId: string,
  itemsByFilter: Record<string, StudyItem>,
  labelPrefix: string,
  chartSettings: RetentionChartSettings,
): void {
  const parent = el(canvasId) as HTMLCanvasElement | null;
  if (!parent) return;
  const rect = parent.parentElement;
  let pw = rect ? rect.clientWidth - 24 : 280;
  pw = Math.max(200, pw);
  const ph = window.matchMedia('(max-width: 479px)').matches ? 160 : 185;

  const r = getCanvasCtx(canvasId, pw, ph);
  if (!r) return;
  const { ctx, w, h } = r;
  const rgb = getAccentRGB();
  const textSec = getTextSecondary();
  const textCol = getTextColor();

  const now = Date.now();
  const bridgeRetrievability = __studyEngineSessionFlow?.retrievability;
  if (typeof bridgeRetrievability !== 'function') return;
  const items: StudyItem[] = [];
  for (const id in itemsByFilter) {
    if (!Object.prototype.hasOwnProperty.call(itemsByFilter, id)) continue;
    const it = itemsByFilter[id];
    if (it && it.fsrs && it.fsrs.lastReview) items.push(it);
  }

  const emptyStateEl = rect ? rect.querySelector('.retention-empty-state') : null;
  retentionGraphData[canvasId] = null;

  if (!items.length) {
    if (emptyStateEl) {
      parent.style.display = 'none';
      (emptyStateEl as HTMLElement).style.display = 'flex';
      if ((window as Window & typeof globalThis & { gsap?: unknown }).gsap) {
        gsap.killTweensOf(emptyStateEl);
        gsap.fromTo(
          emptyStateEl,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' },
        );
      } else {
        (emptyStateEl as HTMLElement).style.opacity = '1';
        (emptyStateEl as HTMLElement).style.transform = 'translateY(0)';
      }
    } else {
      ctx.fillStyle = textSec;
      ctx.font = '500 9px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Review items to see retention forecast', w / 2, h / 2);
    }
    return;
  }

  parent.style.display = '';
  if (emptyStateEl) {
    (emptyStateEl as HTMLElement).style.display = 'none';
    (emptyStateEl as HTMLElement).style.opacity = '';
    (emptyStateEl as HTMLElement).style.transform = '';
  }

  const days = 30;
  const pad = { top: 8, right: 12, bottom: 22, left: 32 };
  const gw = w - pad.left - pad.right;
  const gh = h - pad.top - pad.bottom;

  const points: RetentionPoint[] = [];
  for (let d = 0; d <= days; d++) {
    const futureTs = now + d * 24 * 60 * 60 * 1000;
    let sum = 0;
    items.forEach((it) => {
      sum += bridgeRetrievability(it.fsrs, futureTs);
    });
    const avg = sum / items.length;
    const x = pad.left + (d / days) * gw;
    const y = pad.top + gh - clamp(avg, 0, 1) * gh;
    points.push({ day: d, retention: avg, x, y });
  }

  retentionGraphData[canvasId] = {
    points,
    pad,
    gw,
    gh,
    w,
    h,
    days,
    itemCount: items.length,
    label: labelPrefix || 'All courses',
    chartSettings,
    lastItemsByFilter: itemsByFilter,
    lastLabelPrefix: labelPrefix || 'All courses',
  };

  ctx.strokeStyle = `rgba(${rgb},0.06)`;
  ctx.lineWidth = 0.5;
  [0.25, 0.5, 0.75, 1.0].forEach((v) => {
    const gy = pad.top + gh - v * gh;
    ctx.beginPath();
    ctx.moveTo(pad.left, gy);
    ctx.lineTo(w - pad.right, gy);
    ctx.stroke();
  });

  ctx.fillStyle = textSec;
  ctx.font = '600 7px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  [0, 0.25, 0.5, 0.75, 1.0].forEach((v) => {
    const gy = pad.top + gh - v * gh;
    ctx.fillText(`${Math.round(v * 100)}%`, pad.left - 4, gy);
  });

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  [0, 7, 14, 21, 30].forEach((d) => {
    const gx = pad.left + (d / days) * gw;
    ctx.fillText(`${d}d`, gx, h - pad.bottom + 6);
  });

  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + gh);
  grad.addColorStop(0, `rgba(${rgb},0.18)`);
  grad.addColorStop(1, `rgba(${rgb},0.01)`);

  ctx.beginPath();
  ctx.moveTo(points[0].x, pad.top + gh);
  points.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, pad.top + gh);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.strokeStyle = `rgba(${rgb},0.7)`;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  [0, 7, 14, 21, 30].forEach((d) => {
    const p = points[d];
    if (!p) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${rgb},0.5)`;
    ctx.fill();
  });

  ctx.beginPath();
  ctx.arc(points[0].x, points[0].y, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${rgb},0.9)`;
  ctx.fill();

  ctx.fillStyle = textCol;
  ctx.font = '700 8px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${Math.round(points[0].retention * 100)}% today`, points[0].x + 8, points[0].y - 2);

  const dr = clamp(chartSettings.desiredRetention, 0, 1);
  const drY = pad.top + gh - dr * gh;
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = `rgba(${rgb},0.25)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, drY);
  ctx.lineTo(w - pad.right, drY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = textSec;
  ctx.font = '600 7px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`target ${Math.round(dr * 100)}%`, w - pad.right, drY - 2);

  const cacheCanvas = el(canvasId) as HTMLCanvasElement | null;
  if (cacheCanvas && retentionGraphData[canvasId]) {
    const cacheCtx = cacheCanvas.getContext('2d');
    if (cacheCtx) {
      retentionGraphData[canvasId]!.baseImage = cacheCtx.getImageData(0, 0, cacheCanvas.width, cacheCanvas.height);
    }
  }
}

export function hideCanvasTooltip(): void {
  const tooltip = el('canvasTooltip');
  if (tooltip) tooltip.classList.remove('show');
}

export function showCanvasTooltip(
  canvasId: string,
  pt: RetentionPoint,
  label: string,
  itemCount: number,
  clientX: number,
  clientY: number,
): void {
  const tooltip = el('canvasTooltip');
  if (!tooltip) return;

  const dayLabel = pt.day === 0 ? 'Today' : pt.day === 1 ? 'Tomorrow' : `Day ${pt.day}`;
  (el('ctDay') as HTMLElement).textContent = dayLabel;
  (el('ctRet') as HTMLElement).textContent = `${Math.round(pt.retention * 100)}%`;
  (el('ctCourse') as HTMLElement).textContent = `${label || 'All courses'} · ${itemCount} card${itemCount !== 1 ? 's' : ''}`;

  const retCol = pt.retention >= 0.85 ? 'var(--rate-good)' : pt.retention >= 0.65 ? 'var(--rate-hard)' : 'var(--rate-again)';
  (el('ctRet') as HTMLElement).style.color = retCol;

  const tipW = 160;
  let left = clientX - tipW / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tipW - 8));
  let top = clientY - 68;
  if (top < 6) top = clientY + 16;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.classList.add('show');
}

export function drawRetentionHighlight(canvasId: string, idx: number): void {
  if (idx == null || idx < 0) return;
  const data = retentionGraphData[canvasId];
  const canvas = el(canvasId) as HTMLCanvasElement | null;
  if (!data || !canvas || !data.points || !data.points.length) return;

  const pt = data.points[idx];
  const rgb = getAccentRGB();
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.setLineDash([2, 2]);
  ctx.strokeStyle = `rgba(${rgb},0.2)`;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(pt.x, data.pad.top);
  ctx.lineTo(pt.x, data.pad.top + data.gh);
  ctx.stroke();
  ctx.setLineDash([]);

  const glow = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 10);
  glow.addColorStop(0, `rgba(${rgb},0.3)`);
  glow.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${rgb},1)`;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();

  ctx.restore();
}

export function redrawRetentionBase(canvasId: string): void {
  const data = retentionGraphData[canvasId];
  if (!data) return;
  drawRetentionCurve(canvasId, data.lastItemsByFilter || {}, data.lastLabelPrefix || '', data.chartSettings);
}

export function handleRetentionHover(canvasId: string, clientX: number, clientY: number): void {
  const canvas = el(canvasId) as HTMLCanvasElement | null;
  const data = retentionGraphData[canvasId];
  if (!canvas || !data || !data.points || !data.points.length) {
    hideCanvasTooltip();
    return;
  }

  const cRect = canvas.getBoundingClientRect();
  const mx = clientX - cRect.left;

  const scaleX = cRect.width / data.w;
  let nearest = -1;
  let nearestDist = Infinity;
  data.points.forEach((p, i) => {
    const px = p.x * scaleX;
    const dist = Math.abs(mx - px);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = i;
    }
  });

  if (nearest < 0 || nearestDist > 22) {
    hideCanvasTooltip();
    if (data.baseImage) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.putImageData(data.baseImage, 0, 0);
    }
    return;
  }

  const pt = data.points[nearest];
  showCanvasTooltip(canvasId, pt, data.label, data.itemCount, clientX, clientY);

  if (data.baseImage) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.putImageData(data.baseImage, 0, 0);
      drawRetentionHighlight(canvasId, nearest);
    }
  }
}

export function wireRetentionInteractivity(canvasId: string): void {
  if (wiredRetentionCanvases[canvasId]) return;
  const canvas = el(canvasId) as HTMLCanvasElement | null;
  if (!canvas) return;

  wiredRetentionCanvases[canvasId] = true;

  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    handleRetentionHover(canvasId, e.clientX, e.clientY);
  });
  canvas.addEventListener('mouseleave', () => {
    hideCanvasTooltip();
    const data = retentionGraphData[canvasId];
    if (data && data.baseImage) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.putImageData(data.baseImage, 0, 0);
    }
  });

  canvas.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      if (e.touches && e.touches.length === 1) {
        e.preventDefault();
        const t = e.touches[0];
        handleRetentionHover(canvasId, t.clientX, t.clientY);
      }
    },
    { passive: false },
  );
  canvas.addEventListener('touchend', () => {
    setTimeout(hideCanvasTooltip, 1200);
    const data = retentionGraphData[canvasId];
    if (data && data.baseImage) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.putImageData(data.baseImage, 0, 0);
    }
  });
}

export function drawSparkline(canvasId: string): void {
  const parent = el(canvasId) as HTMLCanvasElement | null;
  if (!parent) return;
  let pw = parent.parentElement ? parent.parentElement.clientWidth - 24 : 200;
  pw = Math.max(140, Math.min(pw, 500));
  const ph = 80;

  const r = getCanvasCtx(canvasId, pw, ph);
  if (!r) return;
  const { ctx, w, h } = r;
  const rgb = getAccentRGB();
  const textSec = getTextSecondary();
  const textCol = getTextColor();

  const runtimeState = __studyEngineSessionFlow?.state;
  const history: SessionHistoryRow[] = (runtimeState && runtimeState.calibration && runtimeState.calibration.history) || [];
  const days: Record<string, { count: number; ratingSum: number; ratingN: number }> = {};
  const now = new Date();
  for (let d = 29; d >= 0; d--) {
    const dt = new Date(now);
    dt.setDate(dt.getDate() - d);
    const key = dt.toISOString().slice(0, 10);
    days[key] = { count: 0, ratingSum: 0, ratingN: 0 };
  }
  history.forEach((entry) => {
    if (!entry.ts) return;
    const dk = entry.ts.slice(0, 10);
    if (days[dk]) {
      days[dk].count++;
      days[dk].ratingSum += entry.rating || 0;
      days[dk].ratingN++;
    }
  });

  const dayKeys = Object.keys(days).sort();
  let maxCount = 1;
  dayKeys.forEach((k) => {
    if (days[k].count > maxCount) maxCount = days[k].count;
  });

  const pad = { left: 4, right: 4, top: 8, bottom: 18 };
  const gw = w - pad.left - pad.right;
  const gh = h - pad.top - pad.bottom;
  const gap = 2;
  const barW = Math.max(3, Math.floor((gw - gap * 29) / 30));

  let totalReviews = 0;
  dayKeys.forEach((k) => {
    totalReviews += days[k].count;
  });
  if (totalReviews === 0) {
    ctx.fillStyle = textSec;
    ctx.font = '600 9px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Complete a session to see activity', w / 2, h / 2);
    return;
  }

  ctx.strokeStyle = `rgba(${rgb},0.06)`;
  ctx.lineWidth = 0.5;
  [0.25, 0.5, 0.75].forEach((v) => {
    const y = pad.top + gh - v * gh;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
  });

  dayKeys.forEach((k, i) => {
    const d = days[k];
    const x = pad.left + i * (barW + gap);
    const barH = Math.max(d.count > 0 ? 3 : 0, (d.count / maxCount) * gh);
    const y = pad.top + gh - barH;

    let col = `rgba(${rgb},0.15)`;
    if (d.count > 0) {
      const avg = d.ratingSum / d.ratingN;
      if (avg >= 3) col = 'rgba(34,197,94,0.7)';
      else if (avg >= 2) col = 'rgba(245,158,11,0.7)';
      else col = 'rgba(239,68,68,0.7)';
    }

    if (d.count > 0) {
      ctx.fillStyle = col;
      const radius = Math.min(barW / 2, 3);
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, [radius, radius, 0, 0]);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, barW, barH);
      }

      if (i === dayKeys.length - 1) {
        ctx.shadowColor = col;
        ctx.shadowBlur = 8;
        ctx.fillStyle = col;
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(x, y, barW, barH, [radius, radius, 0, 0]);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, barW, barH);
        }
        ctx.shadowBlur = 0;
      }
    } else {
      ctx.fillStyle = `rgba(${rgb},0.10)`;
      ctx.beginPath();
      ctx.arc(x + barW / 2, pad.top + gh - 1, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  ctx.fillStyle = textSec;
  ctx.font = '600 7px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const labelIndices = [0, 7, 14, 21, 29];
  labelIndices.forEach((i) => {
    if (!dayKeys[i]) return;
    const x = pad.left + i * (barW + gap) + barW / 2;
    let label: string;
    if (i === 29) {
      label = 'Today';
    } else {
      const parts = dayKeys[i].split('-');
      label = `${parts[1]}-${parts[2]}`;
    }
    ctx.fillText(label, x, h - pad.bottom + 4);
  });

  const todayCount = days[dayKeys[29]] ? days[dayKeys[29]].count : 0;
  if (todayCount > 0) {
    const tx = pad.left + 29 * (barW + gap) + barW / 2;
    const ty = pad.top + gh - Math.max(3, (todayCount / maxCount) * gh) - 6;
    ctx.fillStyle = textCol;
    ctx.font = '800 8px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(String(todayCount), tx, ty);
  }
}

export function drawTierRing(canvasId: string): void {
  const r = getCanvasCtx(canvasId, 64, 64);
  if (!r) return;
  const { ctx } = r;
  const cx = 32;
  const cy = 32;
  const radius = 22;
  const thick = 7;
  const rgb = getAccentRGB();
  const textCol = getTextColor();

  const runtimeState = __studyEngineSessionFlow?.state;
  const history: SessionHistoryRow[] = (runtimeState && runtimeState.calibration && runtimeState.calibration.history) || [];
  const recent = history.slice(-50);
  const tierCounts: Record<'quickfire' | 'explain' | 'apply' | 'distinguish' | 'mock' | 'worked', number> = {
    quickfire: 0,
    explain: 0,
    apply: 0,
    distinguish: 0,
    mock: 0,
    worked: 0,
  };
  let total = 0;
  recent.forEach((h) => {
    if (h.tier && tierCounts[h.tier] != null) {
      tierCounts[h.tier]++;
      total++;
    }
  });

  if (total === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${rgb},0.08)`;
    ctx.lineWidth = thick;
    ctx.stroke();
    ctx.fillStyle = getTextSecondary();
    ctx.font = '700 8px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('—', cx, cy);
    return;
  }

  const tierOrder: Array<'quickfire' | 'explain' | 'apply' | 'distinguish' | 'mock' | 'worked'> = [
    'quickfire',
    'explain',
    'apply',
    'distinguish',
    'mock',
    'worked',
  ];
  const tierColors: Record<'quickfire' | 'explain' | 'apply' | 'distinguish' | 'mock' | 'worked', string> = {
    quickfire: '#3b82f6',
    explain: '#8b5cf6',
    apply: '#f59e0b',
    distinguish: '#ec4899',
    mock: '#ef4444',
    worked: '#10b981',
  };

  let angle = -Math.PI / 2;
  tierOrder.forEach((t) => {
    const pct = tierCounts[t] / total;
    if (pct <= 0) return;
    const endAngle = angle + pct * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, angle, endAngle);
    ctx.strokeStyle = tierColors[t];
    ctx.lineWidth = thick;
    ctx.lineCap = 'butt';
    ctx.stroke();
    angle = endAngle;
  });

  ctx.fillStyle = textCol;
  ctx.font = '800 11px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(total), cx, cy - 2);
  ctx.fillStyle = getTextSecondary();
  ctx.font = '600 6px Inter, system-ui, sans-serif';
  ctx.fillText('reviews', cx, cy + 8);
}

export function drawActivityHeatmap(containerId: string): void {
  const host = document.getElementById(containerId);
  if (!host) return;

  const fn = drawActivityHeatmap as ((id: string) => void) & {
    _viewYear?: number;
    _viewMonth?: number;
  };

  if (!fn._viewYear) {
    fn._viewYear = new Date().getFullYear();
    fn._viewMonth = new Date().getMonth();
  }
  const viewYear = fn._viewYear as number;
  const viewMonth = fn._viewMonth as number;

  const dayMap: Record<string, number> = {};
  try {
    const analytics = SyncEngine.get('studyengine', 'tutorAnalytics') as TutorAnalytics | undefined;
    if (analytics && analytics.sessionHistory) {
      analytics.sessionHistory.forEach((row) => {
        if (!row || !row.date) return;
        const key = row.date;
        dayMap[key] = (dayMap[key] || 0) + (row.cards || 0);
      });
    }
  } catch (e) {
    void e;
  }

  const runtimeState = __studyEngineSessionFlow?.state;
  let hasSessionData = !!(runtimeState && runtimeState.stats && runtimeState.stats.lastSessionDate);
  if (!hasSessionData) {
    for (const dayKey in dayMap) {
      if (Object.prototype.hasOwnProperty.call(dayMap, dayKey) && dayMap[dayKey] > 0) {
        hasSessionData = true;
        break;
      }
    }
  }
  if (!hasSessionData) {
    host.innerHTML =
      '<div class="chart-empty">' +
      '  <div class="chart-empty-icon">📅</div>' +
      '  <div class="chart-empty-title">No sessions yet</div>' +
      '  <div class="chart-empty-desc">Start a session to track your daily study activity.</div>' +
      '</div>';
    if ((window as Window & typeof globalThis & { gsap?: unknown }).gsap) {
      const activityEmpty = host.querySelector('.chart-empty');
      if (activityEmpty) {
        gsap.fromTo(
          activityEmpty,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' },
        );
      }
    }
    return;
  }

  const now = new Date();
  const todayStr =
    now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const startOffset = (firstDow + 6) % 7;

  const isCurrentMonth = (viewYear === now.getFullYear() && viewMonth === now.getMonth());

  function getIntensity(cards: number): string {
    if (!cards || cards <= 0) return 'rgba(var(--accent-rgb), 0.06)';
    if (cards <= 3) return 'rgba(var(--accent-rgb), 0.20)';
    if (cards <= 8) return 'rgba(var(--accent-rgb), 0.38)';
    if (cards <= 15) return 'rgba(var(--accent-rgb), 0.55)';
    if (cards <= 25) return 'rgba(var(--accent-rgb), 0.72)';
    return 'rgba(var(--accent-rgb), 0.90)';
  }

  let streakCount = 0;
  const checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayCards = dayMap[todayStr] || 0;
  if (todayCards <= 0) {
    checkDate.setDate(checkDate.getDate() - 1);
  }
  for (let s = 0; s < 365; s++) {
    const ck =
      checkDate.getFullYear() + '-' + String(checkDate.getMonth() + 1).padStart(2, '0') + '-' + String(checkDate.getDate()).padStart(2, '0');
    if ((dayMap[ck] || 0) > 0) {
      streakCount++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  let monthTotal = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dk = viewYear + '-' + String(viewMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    monthTotal += (dayMap[dk] || 0);
  }

  let h = '<div class="cal-heatmap-wrap">';

  h += '<div class="cal-heatmap-nav">';
  h += '<button class="cal-heatmap-nav-btn" id="calHeatPrev">◀</button>';
  h += '<span class="cal-heatmap-title">' + monthNames[viewMonth] + ' ' + viewYear + '</span>';
  h += '<button class="cal-heatmap-nav-btn" id="calHeatNext"' + (isCurrentMonth ? ' disabled style="opacity:0.3;cursor:default"' : '') + '>▶</button>';
  h += '</div>';

  h += '<div class="cal-heatmap-grid">';

  const dowLabels = ['Mo','Tu','We','Th','Fr','Sa','Su'];
  dowLabels.forEach((dl) => {
    h += '<div class="cal-heatmap-dow">' + dl + '</div>';
  });

  for (let e = 0; e < startOffset; e++) {
    h += '<div class="cal-heatmap-cell empty"></div>';
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = viewYear + '-' + String(viewMonth + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    const cards = dayMap[dateStr] || 0;
    const bg = getIntensity(cards);
    const isToday = dateStr === todayStr;
    const isFuture = new Date(viewYear, viewMonth, day) > now;
    let cls = 'cal-heatmap-cell';
    if (isToday) cls += ' today';
    if (isFuture) cls += ' future';
    h += '<div class="' + cls + '" data-date="' + dateStr + '" data-cards="' + cards + '" style="background:' + bg + (cards > 0 ? ';box-shadow:inset 0 0 8px rgba(var(--accent-rgb),' + (Math.min(0.3, cards * 0.02)) + ')' : '') + '">' + day + '</div>';
  }

  h += '</div>';

  h += '<div class="cal-heatmap-stats">';
  h += '<span class="cal-heatmap-streak">' + (streakCount > 0 ? '🔥 ' + streakCount + ' day streak' : 'No streak') + '</span>';
  h += '<span>' + monthTotal + ' reviews</span>';
  h += '</div>';

  h += '</div>';

  host.innerHTML = h;

  const tooltip = document.createElement('div');
  tooltip.className = 'cal-heatmap-tooltip';
  document.body.appendChild(tooltip);
  document.querySelectorAll('.cal-heatmap-tooltip').forEach((t, i) => {
    if (i > 0) t.remove();
  });

  host.querySelectorAll('.cal-heatmap-cell:not(.empty)').forEach((cell) => {
    cell.addEventListener('mouseenter', () => {
      const date = cell.getAttribute('data-date') as string;
      const c = parseInt(cell.getAttribute('data-cards') || '0', 10) || 0;
      const parts = date.split('-');
      const mo = monthNames[parseInt(parts[1], 10) - 1] || '';
      tooltip.textContent = mo + ' ' + parseInt(parts[2], 10) + ': ' + c + ' card' + (c !== 1 ? 's' : '');
      tooltip.classList.add('show');
      const rect = cell.getBoundingClientRect();
      tooltip.style.left = (rect.left + rect.width / 2 - tooltip.offsetWidth / 2) + 'px';
      tooltip.style.top = (rect.top - tooltip.offsetHeight - 6) + 'px';
    });
    cell.addEventListener('mouseleave', () => {
      tooltip.classList.remove('show');
    });
  });

  const prevBtn = document.getElementById('calHeatPrev');
  const nextBtn = document.getElementById('calHeatNext');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      fn._viewMonth = (fn._viewMonth as number) - 1;
      if ((fn._viewMonth as number) < 0) {
        fn._viewMonth = 11;
        fn._viewYear = (fn._viewYear as number) - 1;
      }
      drawActivityHeatmap(containerId);
      try { if (typeof playClick === 'function') playClick(); } catch (e) { void e; }
    });
  }
  if (nextBtn && !isCurrentMonth) {
    nextBtn.addEventListener('click', () => {
      fn._viewMonth = (fn._viewMonth as number) + 1;
      if ((fn._viewMonth as number) > 11) {
        fn._viewMonth = 0;
        fn._viewYear = (fn._viewYear as number) + 1;
      }
      drawActivityHeatmap(containerId);
      try { if (typeof playClick === 'function') playClick(); } catch (e) { void e; }
    });
  }

  if ((window as Window & typeof globalThis & { gsap?: unknown }).gsap) {
    gsap.fromTo(
      host.querySelectorAll('.cal-heatmap-cell:not(.empty)'),
      { opacity: 0, scale: 0.7 },
      { opacity: 1, scale: 1, duration: 0.3, stagger: 0.01, ease: 'back.out(1.4)' },
    );
  }
}

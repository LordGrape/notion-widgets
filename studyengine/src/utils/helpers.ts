// Utility functions - ported from studyengine/js/utils.js

import type { Tier } from '../types';

export function uid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function esc(s: string | number | undefined | null): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function tierLabel(tier: string): string {
  const labels: Record<string, string> = {
    quickfire: 'QF',
    explain: 'EI',
    apply: 'AI',
    distinguish: 'DI',
    mock: 'ME',
    worked: 'WE'
  };
  return labels[tier] || '—';
}

export function tierColour(tier: string): string {
  if (typeof document === 'undefined') return '#8b5cf6';
  const root = document.documentElement;
  const colors: Record<string, string> = {
    quickfire: getComputedStyle(root).getPropertyValue('--tier-qf').trim(),
    explain: getComputedStyle(root).getPropertyValue('--tier-ex').trim(),
    apply: getComputedStyle(root).getPropertyValue('--tier-ap').trim(),
    distinguish: getComputedStyle(root).getPropertyValue('--tier-di').trim(),
    mock: getComputedStyle(root).getPropertyValue('--tier-mk').trim(),
    worked: getComputedStyle(root).getPropertyValue('--tier-we').trim()
  };
  return colors[tier] || getComputedStyle(root).getPropertyValue('--accent').trim() || '#8b5cf6';
}

export function tierFullName(tier: string): string {
  const names: Record<string, string> = {
    quickfire: 'Quick Fire',
    explain: 'Explain',
    apply: 'Apply',
    distinguish: 'Distinguish',
    mock: 'Mock Exam',
    worked: 'Worked Example'
  };
  return names[tier] || tier;
}

export function toRgba(hex: string, alpha?: number): string {
  if (!hex) hex = '#8b5cf6';
  hex = String(hex).trim();
  if (hex.indexOf('var(') === 0) {
    if (typeof document === 'undefined') return `rgba(139,92,246,${alpha ?? 1})`;
    const temp = document.createElement('div');
    temp.style.color = hex;
    document.body.appendChild(temp);
    const computed = getComputedStyle(temp).color;
    document.body.removeChild(temp);
    const m = computed.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (m) return `rgba(${m[1]},${m[2]},${m[3]},${alpha ?? 1})`;
    return `rgba(139,92,246,${alpha ?? 1})`;
  }
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const rr = isNaN(r) ? 139 : r;
  const gg = isNaN(g) ? 92 : g;
  const bb = isNaN(b) ? 246 : b;
  return `rgba(${rr},${gg},${bb},${alpha ?? 1})`;
}

export function fmtMMSS(totalSec: number): string {
  totalSec = Math.max(0, totalSec | 0);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function isoDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function daysBetween(a: number, b: number): number {
  return (b - a) / (1000 * 60 * 60 * 24);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function countWords(text: string): number {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

// Toast notification system
let toastEl: HTMLDivElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function toast(msg: string): void {
  if (typeof document === 'undefined') return;
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.style.cssText =
      'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);' +
      'z-index:99;padding:10px 12px;border-radius:14px;' +
      'background:rgba(var(--accent-rgb),0.16);border:1px solid rgba(var(--accent-rgb),0.22);' +
      'backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);' +
      'color:var(--text);font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;' +
      'box-shadow:var(--shadow-soft);opacity:0;pointer-events:none;';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  if (toastTimer) clearTimeout(toastTimer);
  if (typeof gsap !== 'undefined') {
    gsap.to(toastEl, { opacity: 1, y: -4, duration: 0.18, ease: 'power2.out' });
  } else {
    toastEl.style.opacity = '1';
  }
  toastTimer = setTimeout(() => {
    if (typeof gsap !== 'undefined' && toastEl) {
      gsap.to(toastEl, { opacity: 0, y: 0, duration: 0.22, ease: 'power2.inOut' });
    } else if (toastEl) {
      toastEl.style.opacity = '0';
    }
  }, 1400);
}

// Markdown rendering (requires marked and DOMPurify globals)
export function renderMd(text: string): string {
  if (!text) return '';
  if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
    return '<span style="white-space:pre-wrap;">' + esc(text) + '</span>';
  }
  try {
    const raw = marked.parse(String(text), { breaks: true, gfm: true });
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del',
        'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'blockquote', 'code', 'pre', 'span', 'a', 'table',
        'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'sup', 'sub'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style'],
      ADD_ATTR: ['target']
    });
  } catch (e) {
    return '<span style="white-space:pre-wrap;">' + esc(text) + '</span>';
  }
}

// Deep clone helper
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
  if (Array.isArray(obj)) return obj.map(deepClone) as unknown as T;
  const cloned = {} as Record<string, unknown>;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone((obj as Record<string, unknown>)[key]);
    }
  }
  return cloned as T;
}

// Course key normalization
export function courseKey(name: string): string {
  return String(name || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Module ID generation
export function generateModuleId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = 'mod_';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// Assessment ID generation
export function generateAssessmentId(): string {
  return 'assess_' + generateModuleId().slice(4);
}

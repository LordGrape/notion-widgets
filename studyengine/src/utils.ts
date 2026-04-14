/*
 * Utils TypeScript Module
 * Phase 3 conversion: types only, ZERO logic changes
 */

import { retrievability } from './fsrs';
import type { StudyItem, CalibrationData } from './types';

// Global dependencies
declare const isEmbedded: boolean;
declare const state: {
  items: Record<string, StudyItem>;
  courses: Record<string, { archived?: boolean }>;
};
declare const settings: { ttsVoice?: string };
declare const ICONS: Record<string, string>;
declare const session: { queue: StudyItem[]; idx: number; currentShown?: boolean } | null;
declare const modelAnswerEl: HTMLElement | null;
declare const viewDash: HTMLElement;
declare const viewSession: HTMLElement;
declare const viewDone: HTMLElement;
declare const activeNav: string;
export const visualGenerationPending: Record<string, boolean> = {};

// Helper functions (globals from this module or others)
export function el(id: string): HTMLElement | null {
  return document.getElementById(id);
}
declare function saveState(): void;
declare function isItemInArchivedSubDeck(item: StudyItem): boolean;
declare function switchNav(nav: string): void;
/**
 * Clamp number between min and max
 */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

// Audio functions from core.js
declare function playOpen(): void;
declare function playClose(): void;

// DOM globals
declare const document: Document;
declare const window: Window & typeof globalThis;
declare const console: Console;

// Module-local state
let toastEl: HTMLDivElement | null = null;
let toastTimer: number | null = null;

const sidebarSelection: {
  level: 'all' | 'course' | 'module' | 'topic';
  course: string | null;
  module: string | null;
  topic: string | null;
} = { level: 'all', course: null, module: null, topic: null };

const sidebarExpanded: Record<string, boolean> = {};

const VISUAL_WORKER_URL = 'https://widget-sync.lordgrape-widgets.workers.dev/studyengine/visual';
const TTS_WORKER_URL = 'https://widget-sync.lordgrape-widgets.workers.dev/studyengine/tts';

let ttsAudioCtx: AudioContext | null = null;
let ttsCurrentSource: AudioBufferSourceNode | null = null;

let mermaidIdCounter = 0;

// Lightbox state
let lightboxZoom = 1;
let lightboxPanX = 0;
let lightboxPanY = 0;
let lightboxDragging = false;
let lightboxLastX = 0;
let lightboxLastY = 0;

/**
 * Generate a UUID v4
 */
export function uid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Escape HTML special characters
 */
export function esc(s: string): string {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/**
 * Get widget key for API calls
 */
function getWidgetKey(): string {
  try {
    if (typeof SyncEngine !== 'undefined') {
      const se = SyncEngine as unknown as { _key?: string; key?: string; passphrase?: string };
      if (se._key) return se._key;
      if (se.key) return se.key;
      if (se.passphrase) return se.passphrase;
    }
  } catch (e) {}
  try {
    const w = window as unknown as { WIDGET_KEY?: string };
    if (w.WIDGET_KEY) return w.WIDGET_KEY;
  } catch (e2) {}
  try {
    return localStorage.getItem('WIDGET_KEY') || localStorage.getItem('widgetKey') || '';
  } catch (e3) {}
  return '';
}

/**
 * Play text-to-speech for the given text
 */
function playTTS(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!text || text.length < 3) { resolve(); return; }
    const voiceName = settings.ttsVoice || 'en-US-Studio-O';
    fetch(TTS_WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Widget-Key': getWidgetKey()
      },
      body: JSON.stringify({
        text: String(text).slice(0, 2000),
        voiceName: voiceName
      })
    })
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then((d: unknown) => {
      const data = d as { audioContent?: string };
      if (!data || !data.audioContent) { resolve(); return null; }
      const binary = atob(data.audioContent);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
      if (!ttsAudioCtx) ttsAudioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      if (ttsAudioCtx.state === 'suspended') {
        return ttsAudioCtx.resume().then(() => {
          return ttsAudioCtx!.decodeAudioData(bytes.buffer);
        });
      }
      return ttsAudioCtx.decodeAudioData(bytes.buffer);
    })
    .then((buffer) => {
      if (!buffer || !ttsAudioCtx) { resolve(); return; }
      if (ttsCurrentSource) {
        try { ttsCurrentSource.stop(); } catch (e) {}
      }
      const source = ttsAudioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(ttsAudioCtx.destination);
      source.onended = () => {
        if (ttsCurrentSource === source) ttsCurrentSource = null;
        resolve();
      };
      ttsCurrentSource = source;
      source.start(0);
    })
    .catch((err) => {
      console.warn('TTS playback failed:', err);
      resolve();
    });
  });
}

/**
 * Stop TTS playback
 */
function stopTTS(): void {
  if (ttsCurrentSource) {
    try { ttsCurrentSource.stop(); } catch (e) {}
    ttsCurrentSource = null;
  }
  document.querySelectorAll('.listen-tts-btn.playing').forEach((btn) => {
    btn.classList.remove('playing');
    btn.innerHTML = '🔊 Listen';
  });
}

/**
 * Insert listen button for TTS
 */
function insertListenButton(targetEl: HTMLElement, text: string): void {
  if (!targetEl || !text || text.length < 10) return;
  if (!targetEl.parentElement) return;
  if (targetEl.parentElement.querySelector('.listen-tts-btn')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'listen-tts-btn';
  btn.setAttribute('aria-label', 'Listen to answer');
  btn.innerHTML = '🔊 Listen';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (btn.classList.contains('playing')) {
      stopTTS();
      return;
    }
    stopTTS();
    btn.classList.add('playing');
    btn.innerHTML = '⏹ Stop';
    playTTS(text).then(() => {
      if (!btn.isConnected) return;
      btn.classList.remove('playing');
      btn.innerHTML = '🔊 Listen';
    });
  });
  targetEl.insertAdjacentElement('afterend', btn);
  if ((window as unknown as { gsap?: typeof gsap }).gsap) {
    (window as unknown as { gsap: typeof gsap }).gsap.fromTo(btn, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' });
  }
}

// Stop TTS on tab switch
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopTTS();
});

/**
 * Generate visual for an item using the worker
 */
export async function generateVisual(item: StudyItem): Promise<string | null> {
  if (!item || !item.prompt || !item.modelAnswer) return null;
  try {
    const res = await fetch(VISUAL_WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Widget-Key': getWidgetKey()
      },
      body: JSON.stringify({
        prompt: item.prompt,
        modelAnswer: item.modelAnswer,
        tier: item.tier || item._presentTier || 'explain',
        course: item.course || '',
        topic: item.topic || '',
        conceptA: item.conceptA || '',
        conceptB: item.conceptB || ''
      })
    });
    if (!res.ok) return null;
    const data = await res.json() as { visual?: string };
    return data.visual || null;
  } catch (e) {
    console.error('[StudyEngine] Visual generation failed for item:', item && item.id, e);
    return null;
  }
}

/**
 * Apply zoom/pan transform to lightbox
 */
function applyLightboxTransform(body: HTMLElement): void {
  const svg = body && body.querySelector('svg') as SVGSVGElement | null;
  if (!svg) return;
  svg.style.transform = 'translate(' + lightboxPanX + 'px,' + lightboxPanY + 'px) scale(' + lightboxZoom + ')';
  svg.style.transformOrigin = 'center center';
}

/**
 * Open visual lightbox with SVG content
 */
function openVisualLightbox(svgHTML: string): void {
  const ov = el('visualLightbox');
  const body = el('visualLightboxBody');
  if (!ov || !body) return;
  body.innerHTML = svgHTML;
  lightboxZoom = 1;
  lightboxPanX = 0;
  lightboxPanY = 0;
  applyLightboxTransform(body);
  ov.classList.add('show');
  ov.setAttribute('aria-hidden', 'false');
  try { playOpen(); } catch (e) {}
}

/**
 * Close visual lightbox
 */
function closeVisualLightbox(): void {
  const ov = el('visualLightbox');
  if (!ov) return;
  ov.classList.remove('show');
  ov.setAttribute('aria-hidden', 'true');
  try { playClose(); } catch (e) {}
}

// Wire up lightbox events
(function wireVisualLightbox() {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, select, .rate, [data-rate], .conf-pill, .listen-tts-btn')) return;
    const closeBtn = target.closest('#visualLightboxClose');
    if (closeBtn) {
      e.preventDefault();
      closeVisualLightbox();
      return;
    }
    const ov = el('visualLightbox');
    if (ov && e.target === ov) {
      closeVisualLightbox();
      return;
    }
    const vc = target.closest('.visual-container');
    if (!vc) return;
    const svg = vc.querySelector('.mermaid-render svg');
    if (!svg) return;
    e.preventDefault();
    openVisualLightbox((svg as SVGElement).outerHTML);
  });

  document.addEventListener('wheel', (e) => {
    const body = el('visualLightboxBody');
    const ov = el('visualLightbox');
    if (!body || !ov || !ov.classList.contains('show')) return;
    if (!body.contains(e.target as Node) && e.target !== body) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    lightboxZoom = Math.max(0.5, Math.min(4, lightboxZoom + delta));
    applyLightboxTransform(body);
  }, { passive: false });

  document.addEventListener('mousedown', (e) => {
    const body = el('visualLightboxBody');
    const ov = el('visualLightbox');
    if (!body || !ov || !ov.classList.contains('show')) return;
    if (!body.contains(e.target as Node)) return;
    lightboxDragging = true;
    lightboxLastX = e.clientX;
    lightboxLastY = e.clientY;
  });

  document.addEventListener('mousemove', (e) => {
    if (!lightboxDragging) return;
    const body = el('visualLightboxBody');
    if (!body) return;
    const dx = (e.clientX - lightboxLastX);
    const dy = (e.clientY - lightboxLastY);
    lightboxPanX += dx;
    lightboxPanY += dy;
    lightboxLastX = e.clientX;
    lightboxLastY = e.clientY;
    applyLightboxTransform(body);
  });

  document.addEventListener('mouseup', () => {
    lightboxDragging = false;
  });

  // Touch: pinch-zoom + drag
  const lightboxTouches: Record<number, Touch> = {};
  let lightboxInitialPinchDist = 0;
  let lightboxInitialZoom = 1;

  function getTouchDist(t1: Touch, t2: Touch): number {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  document.addEventListener('touchstart', (e) => {
    const body = el('visualLightbox') && el('visualLightboxBody');
    const ov = el('visualLightbox');
    if (!body || !ov || !ov.classList.contains('show')) return;
    if (!body.contains(e.target as Node) && e.target !== body) return;
    if (e.touches.length === 2) {
      e.preventDefault();
      lightboxInitialPinchDist = getTouchDist(e.touches[0], e.touches[1]);
      lightboxInitialZoom = lightboxZoom;
    } else if (e.touches.length === 1) {
      lightboxDragging = true;
      lightboxLastX = e.touches[0].clientX;
      lightboxLastY = e.touches[0].clientY;
    }
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    const body = el('visualLightboxBody');
    const ov = el('visualLightbox');
    if (!body || !ov || !ov.classList.contains('show')) return;
    if (e.touches.length === 2 && lightboxInitialPinchDist > 0) {
      e.preventDefault();
      const dist = getTouchDist(e.touches[0], e.touches[1]);
      const scale = dist / lightboxInitialPinchDist;
      lightboxZoom = Math.max(0.5, Math.min(4, lightboxInitialZoom * scale));
      applyLightboxTransform(body);
    } else if (e.touches.length === 1 && lightboxDragging) {
      e.preventDefault();
      const dx = e.touches[0].clientX - lightboxLastX;
      const dy = e.touches[0].clientY - lightboxLastY;
      lightboxPanX += dx;
      lightboxPanY += dy;
      lightboxLastX = e.touches[0].clientX;
      lightboxLastY = e.touches[0].clientY;
      applyLightboxTransform(body);
    }
  }, { passive: false });

  document.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) lightboxInitialPinchDist = 0;
    if (e.touches.length === 0) lightboxDragging = false;
  });

  document.addEventListener('keydown', (e) => {
    const ov = el('visualLightbox');
    if (e.key === 'Escape' && ov && ov.classList.contains('show')) {
      closeVisualLightbox();
      e.stopPropagation();
    }
  }, true);
})();

/**
 * Render a mermaid block HTML
 */
function renderMermaidBlock(mermaidCode: string, placement: string, itemId?: string): string {
  if (!mermaidCode) return '';
  const id = 'mermaid-' + (++mermaidIdCounter);
  const label = (placement === 'prompt') ? 'Visual Cue' : 'Visual Summary';
  const idAttr = itemId ? ' data-item-id="' + esc(itemId) + '"' : '';
  return '' +
    '<div class="visual-container"' + idAttr + ' data-visual-placement="' + esc(placement) + '">' +
      '<div class="visual-label">' + label + '</div>' +
      '<div class="mermaid-render" id="' + id + '" data-mermaid="' + esc(mermaidCode) + '"></div>' +
    '</div>';
}

/**
 * Sanitize mermaid code for rendering
 */
function sanitizeMermaidCode(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let t = raw.trim();
  t = t.replace(/^```mermaid\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap)\b/i.test(t)) {
    const idx = t.search(/\b(graph|flowchart)\s+(TD|LR|TB|BT|RL)\b/i);
    if (idx > 0) t = t.slice(idx);
  }
  const lines = t.split('\n');
  const cleaned: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (/(?:-->|--o|-.->|==>)\|[^|]*$/i.test(line)) continue;
    if (/(?:-->|--o|-.->|==>)\s*$/i.test(line) && i === lines.length - 1) continue;
    cleaned.push(line);
  }
  return cleaned.join('\n').trim();
}

/**
 * Attempt to recover truncated mermaid code
 */
function attemptRecoverTruncatedMermaid(elm: HTMLElement, code: string): boolean {
  const wrap = elm.closest('.visual-container');
  const itemId = wrap && wrap.getAttribute('data-item-id');
  const placement = (wrap && wrap.getAttribute('data-visual-placement')) || 'answer';
  if (!itemId || (elm as HTMLElement).dataset.mermaidRetryDone || !looksIncompleteMermaid(code)) return false;
  (elm as HTMLElement).dataset.mermaidRetryDone = '1';
  const it = state.items[itemId];
  if (!it) return false;
  delete it.visual;
  state.items[itemId] = it;
  saveState();
  generateVisual(it).then((visual) => {
    if (!visual || !wrap || !wrap.parentNode) {
      elm.innerHTML = '<pre class="mermaid-fallback">' + esc(code) + '</pre>';
      elm.removeAttribute('data-mermaid');
      return;
    }
    it.visual = visual;
    state.items[itemId] = it;
    saveState();
    wrap.outerHTML = renderMermaidBlock(visual, placement, itemId);
    setTimeout(initMermaidBlocks, 50);
  });
  return true;
}

/**
 * Initialize mermaid blocks in the DOM
 */
function initMermaidBlocks(): void {
  if (typeof mermaid === 'undefined') {
    console.warn('[StudyEngine] Mermaid.js not loaded — visual cues will show as code');
    return;
  }
  const blocks = document.querySelectorAll('.mermaid-render[data-mermaid]');
  if (!blocks.length) return;
  blocks.forEach((elm) => {
    const rawCode = elm.getAttribute('data-mermaid');
    if (!rawCode || elm.querySelector('svg')) return;
    const code = sanitizeMermaidCode(rawCode);
    if (!code) {
      if (attemptRecoverTruncatedMermaid(elm as HTMLElement, rawCode)) return;
      elm.innerHTML = '<pre class="mermaid-fallback">' + esc(rawCode) + '</pre>';
      elm.removeAttribute('data-mermaid');
      return;
    }
    const id = elm.id || ('mermaid-auto-' + (++mermaidIdCounter));
    elm.id = id;
    try {
      mermaid.render(id + '-svg', code).then((result) => {
        elm.innerHTML = result.svg;
        elm.removeAttribute('data-mermaid');
        if ((window as unknown as { gsap?: typeof gsap }).gsap) {
          (window as unknown as { gsap: typeof gsap }).gsap.fromTo(elm, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
        }
      }).catch((err) => {
        console.warn('[StudyEngine] Mermaid render failed:', err);
        if (attemptRecoverTruncatedMermaid(elm as HTMLElement, rawCode)) return;
        elm.innerHTML = '<pre class="mermaid-fallback">' + esc(rawCode) + '</pre>';
        elm.removeAttribute('data-mermaid');
      });
    } catch (e) {
      console.warn('[StudyEngine] Mermaid render exception:', e);
      if (attemptRecoverTruncatedMermaid(elm as HTMLElement, rawCode)) return;
      elm.innerHTML = '<pre class="mermaid-fallback">' + esc(rawCode) + '</pre>';
      elm.removeAttribute('data-mermaid');
    }
  });
}

/**
 * Ensure visual is generated for answer
 */
function ensureAnswerVisual(it: StudyItem, revealTier: string): void {
  if (!it || !it.id || it.visual || visualGenerationPending[it.id]) return;
  visualGenerationPending[it.id] = true;
  generateVisual(it).then((visual) => {
    visualGenerationPending[it.id] = false;
    if (!visual) return;
    it.visual = visual;
    state.items[it.id] = it;
    saveState();

    if (!session) return;
    const current = session.queue[session.idx];
    if (!current || current.id !== it.id) return;
    const currentTier = current._presentTier || current.tier || 'quickfire';
    if (currentTier !== revealTier) return;

    if (currentTier === 'quickfire') {
      if (session.currentShown && modelAnswerEl && modelAnswerEl.style.display !== 'none' && !modelAnswerEl.querySelector('.visual-container')) {
        modelAnswerEl.insertAdjacentHTML('beforeend', renderMermaidBlock(visual, 'answer', it.id));
        setTimeout(initMermaidBlocks, 50);
      }
      return;
    }

    const rightAns = document.getElementById('modelAnswerRight');
    if (!rightAns || rightAns.querySelector('.visual-container')) return;
    const slot = rightAns.querySelector('.visual-slot');
    if (slot) {
      slot.insertAdjacentHTML('beforebegin', renderMermaidBlock(visual, 'answer', it.id));
    } else {
      rightAns.insertAdjacentHTML('beforeend', renderMermaidBlock(visual, 'answer', it.id));
    }
    setTimeout(initMermaidBlocks, 50);
  }).catch(() => {
    visualGenerationPending[it.id] = false;
  });
}

/**
 * Check if mermaid code looks incomplete (truncated)
 */
function looksIncompleteMermaid(s: string): boolean {
  if (!s || typeof s !== 'string') return true;
  let t = s.trim().replace(/^```mermaid\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  const graphIdx = t.search(/\bgraph\s+(TD|LR)\b/i);
  if (graphIdx === -1) return true;
  t = t.slice(graphIdx).trim();
  const lines = t.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return true;
  const last = lines[lines.length - 1];
  // Truncated mid-edge
  const l = String(last || '').trim();
  if (l.endsWith('-->') || l.endsWith('--o') || l.endsWith('==>')) return true;
  if (l.endsWith('--')) return true;
  // Unclosed pipe label
  const arrowPos = Math.max(l.lastIndexOf('-->'), l.lastIndexOf('--o'), l.lastIndexOf('==>'));
  if (arrowPos >= 0) {
    const after = l.slice(arrowPos + 3);
    const firstPipe = after.indexOf('|');
    if (firstPipe >= 0) {
      const secondPipe = after.indexOf('|', firstPipe + 1);
      if (secondPipe < 0) return true;
    }
  }
  // Truncated node definition
  if (/\([^)]*$/.test(last) || /\[[^\]]*$/.test(last) || /\{[^}]*$/.test(last)) return true;
  // Truncated quoted string
  const quoteCount = (last.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) return true;
  return false;
}

/**
 * Get abbreviated tier label
 */
export function tierLabel(tier: string): string {
  return ({
    quickfire: 'QF',
    explain: 'EI',
    apply: 'AI',
    distinguish: 'DI',
    mock: 'ME',
    worked: 'WE'
  } as Record<string, string>)[tier] || '—';
}

/**
 * Get tier color from CSS variables
 */
export function tierColour(tier: string): string {
  return ({
    quickfire: getComputedStyle(document.documentElement).getPropertyValue('--tier-qf').trim(),
    explain: getComputedStyle(document.documentElement).getPropertyValue('--tier-ex').trim(),
    apply: getComputedStyle(document.documentElement).getPropertyValue('--tier-ap').trim(),
    distinguish: getComputedStyle(document.documentElement).getPropertyValue('--tier-di').trim(),
    mock: getComputedStyle(document.documentElement).getPropertyValue('--tier-mk').trim(),
    worked: getComputedStyle(document.documentElement).getPropertyValue('--tier-we').trim()
  } as Record<string, string>)[tier] || getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
}

/**
 * Convert hex color to rgba
 */
function toRgba(hex: string, alpha?: number): string {
  if (!hex) hex = '#8b5cf6';
  hex = String(hex).trim();
  if (hex.indexOf('var(') === 0) {
    const temp = document.createElement('div');
    temp.style.color = hex;
    document.body.appendChild(temp);
    hex = getComputedStyle(temp).color;
    document.body.removeChild(temp);
    const m = hex.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (m) return 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + (alpha != null ? alpha : 1) + ')';
    return 'rgba(139,92,246,' + (alpha != null ? alpha : 1) + ')';
  }
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  if (isNaN(r)) return 'rgba(139,92,246,' + (alpha != null ? alpha : 1) + ')';
  if (isNaN(g)) return 'rgba(139,92,246,' + (alpha != null ? alpha : 1) + ')';
  if (isNaN(b)) return 'rgba(139,92,246,' + (alpha != null ? alpha : 1) + ')';
  return 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha != null ? alpha : 1) + ')';
}

/**
 * Set tier badge display
 */
function setTierBadge(tier: string): void {
  const badge = document.querySelector('.tier-badge');
  if (!badge) return;
  const config: Record<string, { icon: string; label: string; bg: string }> = {
    quickfire: { icon: '⚡', label: 'QF', bg: 'var(--tier-qf)' },
    explain: { icon: '💬', label: 'EI', bg: 'var(--tier-ex)' },
    apply: { icon: '🔧', label: 'AI', bg: 'var(--tier-ap)' },
    distinguish: { icon: '⚖', label: 'DI', bg: 'var(--tier-di)' },
    mock: { icon: '📝', label: 'ME', bg: 'var(--tier-mk)' },
    worked: { icon: '📐', label: 'WE', bg: 'var(--tier-we)' }
  };
  const c = config[tier] || config.quickfire;
  badge.innerHTML = '<span class="tiny">' + c.icon + '</span> ' + c.label;
  (badge as HTMLElement).style.background = c.bg;
  (badge as HTMLElement).style.color = '#fff';
  const glow = tierColour(tier);
  (badge as HTMLElement).style.boxShadow = '0 0 18px ' + toRgba(glow || '#8b5cf6', 0.3);
  if ((window as unknown as { gsap?: typeof gsap }).gsap) {
    (window as unknown as { gsap: typeof gsap }).gsap.fromTo(badge, { scale: 0.85, opacity: 0.6 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(2)' });
  }
  const sessionTierText = el('sessionTierText');
  if (sessionTierText) sessionTierText.textContent = tierLabel(tier);
  const sessionTierDot = document.querySelector('.session-tier-pill .tiny');
  if (sessionTierDot) (sessionTierDot as HTMLElement).style.color = glow;
}

/**
 * Switch to a different view
 */
function showView(nextId: string): void {
  const views = [viewDash, viewSession, viewDone];
  const next = el(nextId);
  // Clean up any stale calendar heatmap tooltips
  document.querySelectorAll('.cal-heatmap-tooltip').forEach((t) => { t.remove(); });
  views.forEach((v) => { v.classList.remove('active'); });
  next?.classList.add('active');

  // Standalone: session mode collapses sidebar
  if (!isEmbedded) {
    if (nextId === 'viewSession' || nextId === 'viewDone') document.body.classList.add('in-session');
    else if (nextId === 'viewDash') document.body.classList.remove('in-session');
  }

  // Standalone: avoid context views "sticking" outside dashboard
  if (!isEmbedded) {
    if (nextId !== 'viewDash') {
      try {
        // hideContextViews() will be defined in sidebar.js
        (window as unknown as { hideContextViews?: () => void }).hideContextViews?.();
      } catch (eCtx) {}
    }
  }

  // Hide/show nav tabs during session
  const navTabs = document.querySelector('.nav-tabs');
  if (navTabs) {
    if (nextId === 'viewSession' || nextId === 'viewDone') {
      (navTabs as HTMLElement).style.display = 'none';
    } else {
      (navTabs as HTMLElement).style.display = 'flex';
    }
  }

  // When returning to dashboard, restore the active tab
  if (nextId === 'viewDash') {
    switchNav(activeNav);
  }

  if ((window as unknown as { gsap?: typeof gsap }).gsap) {
    (window as unknown as { gsap: typeof gsap }).gsap.fromTo(next, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
  }
}

/**
 * Count due items by tier
 */
function countDue(
  itemsById: Record<string, StudyItem>,
  course?: string | null,
  topic?: string | null
): { total: number; byTier: Record<string, number> } {
  const now = Date.now();
  const out: { total: number; byTier: Record<string, number> } = { total: 0, byTier: { quickfire:0, explain:0, apply:0, distinguish:0, mock:0, worked:0 } };
  for (const id in itemsById) {
    if (!itemsById.hasOwnProperty(id)) continue;
    const it = itemsById[id];
    if (!it || it.archived) continue;
    if (isItemInArchivedSubDeck(it)) continue;
    if (it.course && state.courses[it.course] && state.courses[it.course].archived) continue;
    if (course && course !== 'All' && it.course !== course) continue;
    if (topic && topic !== 'All' && (it.topic || '') !== topic) continue;
    const f = it.fsrs || null;
    const due = f && f.due ? new Date(f.due).getTime() : 0;
    const isDue = (!f || !f.lastReview) ? true : (due <= now);
    if (isDue) {
      out.total++;
      const hasMockField = it.timeLimitMins && it.timeLimitMins > 0;
      const hasDistinguish = it.conceptA && it.conceptB;
      const hasApply = it.task || it.scenario;
      const paraCount = (it.modelAnswer || '').split('\n\n').filter((s) => String(s).trim()).length;
      let dt = 'quickfire';
      if (hasMockField) {
        dt = 'mock';
      } else if (hasDistinguish) {
        dt = 'distinguish';
      } else if (hasApply) {
        dt = 'apply';
      } else if (paraCount >= 2) {
        dt = 'worked';
      }
      if (out.byTier[dt] != null) out.byTier[dt]++;
    }
  }
  return out;
}

/**
 * Calculate average retention for items
 */
function avgRetention(itemsById: Record<string, StudyItem>): number | null {
  const now = Date.now();
  let sum = 0;
  let n = 0;
  for (const id in itemsById) {
    if (!itemsById.hasOwnProperty(id)) continue;
    const it = itemsById[id];
    if (!it || !it.fsrs || it.archived) continue;
    if (isItemInArchivedSubDeck(it)) continue;
    if (it.course && state.courses[it.course] && state.courses[it.course].archived) continue;
    sum += retrievability(it.fsrs, now);
    n++;
  }
  if (!n) return null;
  return sum / n;
}

/**
 * Calculate calibration percentage
 */
function calibrationPct(cal: CalibrationData | null | undefined): number | null {
  if (!cal || !cal.totalSelfRatings) return null;
  const p = (cal.totalActualCorrect || 0) / Math.max(1, cal.totalSelfRatings);
  return clamp(p, 0, 1);
}

/**
 * Get icon HTML
 */
function icon(name: string, size?: number): string {
  let svg = ICONS[name] || '';
  if (size) {
    svg = svg.replace(/width="\d+"/, 'width="' + size + '"').replace(/height="\d+"/, 'height="' + size + '"');
  }
  return '<span class="se-icon" aria-hidden="true">' + svg + '</span>';
}

/**
 * Format seconds as MM:SS
 */
export function fmtMMSS(totalSec: number): string {
  totalSec = Math.max(0, totalSec|0);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}

/**
 * Show toast message
 */
export function toast(msg: string): void {
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
  if ((window as unknown as { gsap?: typeof gsap }).gsap) {
    (window as unknown as { gsap: typeof gsap }).gsap.to(toastEl, { opacity: 1, y: -4, duration: 0.18, ease: 'power2.out' });
  } else {
    toastEl.style.opacity = '1';
  }
  toastTimer = window.setTimeout(() => {
    if ((window as unknown as { gsap?: typeof gsap }).gsap) {
      (window as unknown as { gsap: typeof gsap }).gsap.to(toastEl, { opacity: 0, y: 0, duration: 0.22, ease: 'power2.inOut' });
    } else if (toastEl) {
      toastEl.style.opacity = '0';
    }
  }, 1400);
}

/**
 * Get ISO timestamp
 */
export function isoNow(): string {
  return new Date().toISOString();
}

/**
 * Get ISO date (YYYY-MM-DD)
 */
function isoDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/**
 * Calculate days between two timestamps
 */
export function daysBetween(a: number | Date, b: number | Date): number {
  const aMs = a instanceof Date ? a.getTime() : a;
  const bMs = b instanceof Date ? b.getTime() : b;
  return (bMs - aMs) / (1000 * 60 * 60 * 24);
}

/**
 * Render markdown to HTML
 */
export function renderMd(text: string): string {
  if (!text) return '';
  const w = window as unknown as { marked?: { parse: (md: string, opts?: unknown) => string }; DOMPurify?: { sanitize: (dirty: string, config?: unknown) => string } };
  if (typeof w.marked === 'undefined' || typeof w.DOMPurify === 'undefined') {
    return '<span style="white-space:pre-wrap;">' + esc(text) + '</span>';
  }
  try {
    const raw = w.marked.parse(String(text), { breaks: true, gfm: true });
    return w.DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: ['p','br','strong','b','em','i','u','s','del',
        'ul','ol','li','h1','h2','h3','h4','h5','h6',
        'blockquote','code','pre','span','a','table',
        'thead','tbody','tr','th','td','hr','sup','sub'],
      ALLOWED_ATTR: ['href','target','rel','class','style'],
      ADD_ATTR: ['target']
    });
  } catch (e) {
    return '<span style="white-space:pre-wrap;">' + esc(text) + '</span>';
  }
}

// Attach to window for .js consumers
const win = window as unknown as Record<string, unknown>;

win.uid = uid;
win.esc = esc;
win.getWidgetKey = getWidgetKey;
win.playTTS = playTTS;
win.stopTTS = stopTTS;
win.insertListenButton = insertListenButton;
win.generateVisual = generateVisual;
win.applyLightboxTransform = applyLightboxTransform;
win.openVisualLightbox = openVisualLightbox;
win.closeVisualLightbox = closeVisualLightbox;
win.renderMermaidBlock = renderMermaidBlock;
win.sanitizeMermaidCode = sanitizeMermaidCode;
win.attemptRecoverTruncatedMermaid = attemptRecoverTruncatedMermaid;
win.initMermaidBlocks = initMermaidBlocks;
win.ensureAnswerVisual = ensureAnswerVisual;
win.looksIncompleteMermaid = looksIncompleteMermaid;
win.tierLabel = tierLabel;
win.tierColour = tierColour;
win.toRgba = toRgba;
win.setTierBadge = setTierBadge;
win.showView = showView;
win.countDue = countDue;
win.avgRetention = avgRetention;
win.calibrationPct = calibrationPct;
win.icon = icon;
win.fmtMMSS = fmtMMSS;
win.toast = toast;
win.isoNow = isoNow;
win.isoDate = isoDate;
win.daysBetween = daysBetween;
win.renderMd = renderMd;

// Sidebar state exports
win.sidebarSelection = sidebarSelection;
win.sidebarExpanded = sidebarExpanded;
win.visualGenerationPending = visualGenerationPending;
win.mermaidIdCounter = mermaidIdCounter;

export {};

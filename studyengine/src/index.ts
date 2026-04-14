/*
 * Study Engine TypeScript Entry Point
 */

// CSS imports (Vite inlines these)
import './css/base.css';
import './css/dashboard.css';
import './css/session.css';
import './css/sidebar.css';
import './css/modals.css';
import './css/learn.css';

// Modules in dependency order
import './fsrs';
import './utils';
import './tiers';
import './courses';
import './cards';
import './state';
import './signals';

// Preact
import { h, render } from 'preact';
import { App, mountSidebar } from './App';
import { hydrateFromSync, currentView, items, courses } from './signals';

const w = window as unknown as Record<string, unknown>;

// ── Bridge globals (available immediately) ──────────────────────
w.switchNav = (view: string) => { currentView.value = view; };
w.startSession = () => { currentView.value = 'session'; };
w.resumeSavedSession = (snap: unknown) => {
  (w as any)._resumeSnap = snap;
  currentView.value = 'session';
};
w.renderDashboard = () => {
  // Sync global state → signals so Preact re-renders
  const st = (w as any).state;
  if (st) {
    if (st.items) items.value = { ...st.items };
    if (st.courses) courses.value = { ...st.courses };
  }
};

// Missing globals that Preact components and modals call
if (!w.openCreateCourseFlow) {
  w.openCreateCourseFlow = () => {
    const ocm = w.openCourseModal as (() => void) | undefined;
    if (ocm) { ocm(); return; }
    // Fallback: open the course modal overlay directly
    const ov = document.getElementById('courseModalOv');
    if (ov) { ov.classList.add('show'); ov.setAttribute('aria-hidden', 'false'); }
  };
}
if (!w.openCourseModal) {
  w.openCourseModal = () => {
    const ov = document.getElementById('courseModalOv');
    if (ov) { ov.classList.add('show'); ov.setAttribute('aria-hidden', 'false'); }
  };
}
if (!w.openSettings) {
  w.openSettings = () => {
    const ov = document.getElementById('settingsModalOv');
    if (ov) { ov.classList.add('show'); ov.setAttribute('aria-hidden', 'false'); }
  };
}
if (!w.renderModal) {
  w.renderModal = () => {}; // stub — prevents openModal() crash
}
if (!w.openCourseDetail) {
  w.openCourseDetail = (name: string) => {
    console.log('[bridge] openCourseDetail:', name);
  };
}
if (!w.updateBreadcrumb) w.updateBreadcrumb = () => {};
if (!w.applySidebarFilter) w.applySidebarFilter = () => {};
if (!w.reconcileStats) w.reconcileStats = () => {};

// ── Mount ───────────────────────────────────────────────────────
function mountApp() {
  mountSidebar();
  const root = document.getElementById('preact-root');
  if (root) render(h(App, null), root);

  // Wire topbar nav tabs
  document.querySelectorAll('.nav-tab[data-nav]').forEach(tab => {
    tab.addEventListener('click', () => {
      const nav = tab.getAttribute('data-nav');
      if (nav === 'home') currentView.value = 'dashboard';
      if (nav === 'courses') currentView.value = 'dashboard';
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  // Wire topbar buttons
  document.getElementById('mainAddCard')?.addEventListener('click', () => {
    (w.openModal as (() => void) | undefined)?.();
  });
  document.getElementById('mainSettingsBtn')?.addEventListener('click', () => {
    (w.openSettings as (() => void) | undefined)?.();
  });
}

// Gate hydration on SyncEngine readiness
document.addEventListener('DOMContentLoaded', () => {
  const SE = (window as any).SyncEngine;

  if (SE && typeof SE.onReady === 'function') {
    // SyncEngine has onReady — wait for data to load
    SE.onReady(() => {
      hydrateFromSync();
      mountApp();
    });
    // Safety: if onReady never fires within 3s, mount anyway
    setTimeout(() => {
      if (!document.getElementById('preact-root')?.children.length) {
        hydrateFromSync();
        mountApp();
      }
    }, 3000);
  } else {
    // No onReady — try hydrating now, retry after delay
    hydrateFromSync();
    mountApp();
    // Re-hydrate after SyncEngine likely finishes
    setTimeout(() => { hydrateFromSync(); }, 1500);
  }
});

// Hide visual lightbox on load (shouldn't be visible)
document.addEventListener('DOMContentLoaded', () => {
  const lb = document.getElementById('visualLightbox');
  if (lb && !lb.classList.contains('show')) {
    lb.style.display = 'none';
  }
});

export {};

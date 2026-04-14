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
import { setOpenCourseModal, setRenderModal, setRenderDashboard } from './cards';
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
if (!w.openCourseModal) {
  w.openCourseModal = () => {
    const ov = document.getElementById('courseOv');
    if (ov) { ov.classList.add('show'); ov.setAttribute('aria-hidden', 'false'); }
  };
}
if (!w.openCreateCourseFlow) {
  w.openCreateCourseFlow = () => {
    (w.openCourseModal as (() => void))();
  };
}
if (!w.openSettings) {
  w.openSettings = () => {
    const ov = document.getElementById('settingsOv');
    if (ov) { ov.classList.add('show'); ov.setAttribute('aria-hidden', 'false'); }
  };
}
if (!w.openImportModal) {
  w.openImportModal = () => {
    (w.openModal as ((tab: string) => void) | undefined)?.('import');
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

// ── Wire cards.ts dependency injection ─────────────────────────
setOpenCourseModal(() => (w.openCourseModal as (() => void) | undefined)?.());
setRenderModal(() => (w.renderModal as (() => void) | undefined)?.());
setRenderDashboard(() => (w.renderDashboard as (() => void) | undefined)?.());

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

  // Wire modal close buttons
  const closeOverlay = (ovId: string) => {
    const ov = document.getElementById(ovId);
    if (ov) { ov.classList.remove('show'); ov.setAttribute('aria-hidden', 'true'); }
  };
  document.getElementById('modalClose')?.addEventListener('click', () => {
    (w.closeModal as (() => void) | undefined)?.();
  });
  document.getElementById('settingsClose')?.addEventListener('click', () => closeOverlay('settingsOv'));
  document.getElementById('courseClose')?.addEventListener('click', () => closeOverlay('courseOv'));

  // Wire legacy dashboard action buttons
  document.getElementById('addBtn')?.addEventListener('click', () => {
    (w.openModal as (() => void) | undefined)?.();
  });
  document.getElementById('importBtn')?.addEventListener('click', () => {
    (w.openImportModal as (() => void) | undefined)?.();
  });
  document.getElementById('manageCourses')?.addEventListener('click', () => {
    (w.openCourseModal as (() => void) | undefined)?.();
  });
  document.getElementById('gearBtn')?.addEventListener('click', () => {
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

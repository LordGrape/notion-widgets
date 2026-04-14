/*
 * Study Engine TypeScript Entry Point
 * Phase 3: Import converted modules in dependency order
 */

// CSS imports (Vite inlines these)
import './css/base.css';
import './css/dashboard.css';
import './css/session.css';
import './css/sidebar.css';
import './css/modals.css';
import './css/learn.css';

// FSRS module (converted first - no other dependencies)
import './fsrs';

// Utils (depends on fsrs functions via globals)
import './utils';

// Tiers (depends on utils functions via globals)
import './tiers';

// Courses (depends on utils/tiers functions via globals)
import './courses';

// Cards (depends on utils/courses functions via globals)
import './cards';

// State (depends on all other modules - must be last)
import './state';

// Signals (reactive bridge - after state)
import './signals';

// Preact root component (Phase 4)
import { h, render } from 'preact';
import { App, mountSidebar } from './App';
import { hydrateFromSync, currentView } from './signals';

// Mount after SyncEngine is ready
document.addEventListener('DOMContentLoaded', () => {
  // Hydrate signals from SyncEngine
  hydrateFromSync();

  // Mount Preact sidebar into its dedicated slot
  mountSidebar();

  // Mount Preact app views into #preact-root
  const root = document.getElementById('preact-root');
  if (root) render(h(App, null), root);

  // ── Topbar nav tab wiring ─────────────────────────────────────────────────
  document.querySelectorAll('.nav-tab[data-nav]').forEach(tab => {
    tab.addEventListener('click', () => {
      const nav = tab.getAttribute('data-nav');
      if (nav === 'home') currentView.value = 'dashboard';
      if (nav === 'courses') currentView.value = 'dashboard';
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  // Main topbar action buttons
  const mainAddCard = document.getElementById('mainAddCard');
  if (mainAddCard) {
    mainAddCard.addEventListener('click', () => {
      (window as unknown as { openModal?: () => void }).openModal?.();
    });
  }
  const mainSettingsBtn = document.getElementById('mainSettingsBtn');
  if (mainSettingsBtn) {
    mainSettingsBtn.addEventListener('click', () => {
      (window as unknown as { openSettings?: () => void }).openSettings?.();
    });
  }

  // ── Bridge globals ────────────────────────────────────────────────────────
  // These allow static modals and legacy JS to co-exist with Preact signals.

  const w = window as unknown as Record<string, unknown>;

  // Navigation bridge
  w.switchNav = (view: string) => { currentView.value = view; };

  // Session bridges
  w.startSession = () => { currentView.value = 'session'; };
  w.resumeSavedSession = (snap: unknown) => {
    (w as unknown as { _resumeSnap?: unknown })._resumeSnap = snap;
    currentView.value = 'session';
  };

  // Dashboard refresh (no-op — signals drive reactivity)
  w.renderDashboard = () => {};

  // Breadcrumb / filter (no-op stubs until fully migrated)
  if (!w.updateBreadcrumb) w.updateBreadcrumb = () => {};
  if (!w.applySidebarFilter) w.applySidebarFilter = () => {};

  // reconcileStats stub
  if (!w.reconcileStats) w.reconcileStats = () => {};
});

// Export empty to make this a module
export {};

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
import { App } from './App';
import { hydrateFromSync } from './signals';

// Mount after SyncEngine is ready
document.addEventListener('DOMContentLoaded', () => {
  // Hydrate signals from SyncEngine
  hydrateFromSync();
  
  // Mount Preact app (using h() instead of JSX in .ts file)
  const root = document.getElementById('preact-root');
  if (root) render(h(App, null), root);
});

// Export empty to make this a module
export {};

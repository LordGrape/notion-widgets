// CSS imports — Vite inlines these into the single-file build
import './css/base.css';
import './css/dashboard.css';
import './css/session.css';
import './css/sidebar.css';
import './css/modals.css';
import './css/learn.css';

// Import and initialise typed logic modules
import { initStateSignals, appState, settings, persistState } from './signals';

// Initialize state from SyncEngine
try {
  initStateSignals();
} catch (e) {
  console.warn('[StudyEngine] State init deferred — SyncEngine may not be ready yet');
}

// Expose to global scope for original HTML onclick handlers
(window as any).appState = appState;
(window as any).settings = settings;
(window as any).saveState = persistState;

console.log('[StudyEngine] TypeScript modules loaded via Vite');

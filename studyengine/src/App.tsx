/*
 * App TypeScript Component
 * Phase 4: Root Preact component
 */

import { h, Fragment } from 'preact';
import { currentView } from './signals';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';

export function App() {
  return (
    <div id="app-root">
      {/* Phase 4: Preact Sidebar component */}
      <Sidebar />
      
      {/* Phase 4: Dashboard component - conditionally rendered based on view */}
      {currentView.value === 'dashboard' && <Dashboard />}
      
      {/* Unconverted views still render via their .js DOM manipulation */}
    </div>
  );
}

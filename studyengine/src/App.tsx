/*
 * App TypeScript Component
 * Phase 4: Root Preact component
 */

import { h, Fragment } from 'preact';
import { currentView } from './signals';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Session } from './components/Session';
import { Tutor } from './components/Tutor';
import { Learn } from './components/Learn';

export function App() {
  return (
    <div id="app-root">
      {/* Phase 4: Preact Sidebar component */}
      <Sidebar />
      
      {/* Phase 4: Dashboard component - conditionally rendered based on view */}
      {currentView.value === 'dashboard' && <Dashboard />}
      
      {/* Phase 4: Session component */}
      {currentView.value === 'session' && <Session />}
      
      {/* Phase 4: Learn component */}
      {currentView.value === 'learn' && <Learn />}
      
      {/* Phase 4: Tutor overlay - renders when tutorOpen is true */}
      <Tutor />
      
      {/* Unconverted views still render via their .js DOM manipulation */}
    </div>
  );
}

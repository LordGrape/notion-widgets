/*
 * App TypeScript Component
 * Phase 4: Root Preact component
 */

import { h, Fragment, render } from 'preact';
import { currentView } from './signals';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Session } from './components/Session';
import { Done } from './components/Done';
import { Tutor } from './components/Tutor';
import { Learn } from './components/Learn';

export function App() {
  return (
    <Fragment>
      {currentView.value === 'dashboard' && <Dashboard />}
      {currentView.value === 'session' && <Session />}
      {currentView.value === 'done' && <Done />}
      {currentView.value === 'learn' && <Learn />}
      <Tutor />
    </Fragment>
  );
}

export function mountSidebar() {
  const sidebarRoot = document.getElementById('preact-sidebar');
  if (sidebarRoot) {
    render(h(Sidebar, null), sidebarRoot);
  }
}

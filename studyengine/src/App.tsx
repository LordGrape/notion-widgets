/*
 * App TypeScript Component
 * Phase 4: Root Preact component
 */

import { h, Fragment, render } from 'preact';
import { useComputed } from '@preact/signals';
import { currentView } from './signals';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Session } from './components/Session';
import { Done } from './components/Done';
import { Tutor } from './components/Tutor';
import { Learn } from './components/Learn';

export function App() {
  // useComputed creates a reactive computation that triggers re-render
  const view = useComputed(() => currentView.value);
  const viewName = view.value;

  return (
    <Fragment>
      {viewName === 'dashboard' && <Dashboard />}
      {viewName === 'session' && <Session />}
      {viewName === 'done' && <Done />}
      {viewName === 'learn' && <Learn />}
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

/*
 * App TypeScript Component
 * Phase 4: Root Preact component
 */

import { h, Fragment, render, ComponentChild } from 'preact';
import { computed } from '@preact/signals';
import { currentView } from './signals';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Session } from './components/Session';
import { Done } from './components/Done';
import { Tutor } from './components/Tutor';
import { Learn } from './components/Learn';

// Computed signal that returns the current view component
const activeView = computed<ComponentChild>(() => {
  const view = currentView.value;
  if (view === 'dashboard') return h(Dashboard, null);
  if (view === 'session') return h(Session, null);
  if (view === 'done') return h(Done, null);
  if (view === 'learn') return h(Learn, null);
  return h(Dashboard, null);
});

export function App() {
  return (
    <Fragment>
      {activeView.value}
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

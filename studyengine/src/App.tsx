/*
 * App TypeScript Component
 * Phase 4: Root Preact component - MINIMAL
 * Only renders Sidebar and Tutor. Dashboard, Session, Done views are handled
 * imperatively by dom-controller.ts updating the HTML shell.
 */

import { h, render } from 'preact';
import { Sidebar } from './components/Sidebar';
import { Tutor } from './components/Tutor';

export function App() {
  // Tutor is a floating panel that works alongside the HTML shell
  return h(Tutor, null);
}

export function mountSidebar() {
  const sidebarRoot = document.getElementById('preact-sidebar');
  if (sidebarRoot) {
    render(h(Sidebar, null), sidebarRoot);
  }
}

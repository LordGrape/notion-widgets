/*
 * App TypeScript Component
 * Phase 4: Root Preact component - MINIMAL
 * Only renders Sidebar and Tutor. Dashboard, Session, Done views are handled
 * imperatively by dom-controller.ts updating the HTML shell.
 */

import { createRoot } from 'react-dom/client';
import { Sidebar } from './components/Sidebar';
import { Tutor } from './components/Tutor';

export function App() {
  // Tutor is a floating panel that works alongside the HTML shell
  return <Tutor />;
}

export function mountSidebar() {
  const sidebarRoot = document.getElementById('preact-sidebar');
  if (sidebarRoot) {
    createRoot(sidebarRoot).render(<Sidebar />);
  }
}

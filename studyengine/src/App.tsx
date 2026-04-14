/*
 * App TypeScript Component
 * Phase 5: React components for Session/Done/Learn views
 * ViewRouter handles session, done, and learn views.
 * Dashboard stays in HTML shell.
 */

import { createRoot } from 'react-dom/client';
import { Sidebar } from './components/Sidebar';
import { Tutor } from './components/Tutor';
import { ViewRouter } from './components/ViewRouter';

export function App() {
  // Tutor is a floating panel that works alongside other views
  // ViewRouter renders Session/Done/Learn when active
  return (
    <>
      <ViewRouter />
      <Tutor />
    </>
  );
}

export function mountSidebar() {
  const sidebarRoot = document.getElementById('preact-sidebar');
  if (sidebarRoot) {
    createRoot(sidebarRoot).render(<Sidebar />);
  }
}

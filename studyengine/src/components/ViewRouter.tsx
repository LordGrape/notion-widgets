/*
 * ViewRouter Component
 * Routes between Session, Done, and Learn views based on currentView signal
 */

import { currentView } from '../signals';
import { Session } from './Session';
import { Done } from './Done';
import { Learn } from './Learn';

export function ViewRouter() {
  const view = currentView.value;

  // Only render React components for these views
  // Dashboard stays in HTML shell
  if (view === 'session') return <Session />;
  if (view === 'done') return <Done />;
  if (view === 'learn') return <Learn />;

  return null;
}

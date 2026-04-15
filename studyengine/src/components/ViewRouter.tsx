/*
 * ViewRouter Component
 * Routes between Session, Done, and Learn views based on currentView signal
 */

import { currentView } from '../signals';
import { Session } from './Session';
import { Done } from './Done';
import { Learn } from './Learn';
import { Dashboard } from './Dashboard';

export function ViewRouter() {
  const view = currentView.value;

  if (view === 'dashboard') return <Dashboard />;
  if (view === 'session') return <Session />;
  if (view === 'done') return <Done />;
  if (view === 'learn') return <Learn />;

  return null;
}

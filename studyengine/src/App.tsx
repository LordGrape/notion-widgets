import { useComputed } from '@preact/signals';
import { currentView, isEmbedded } from './signals';
import { Dashboard } from './components/Dashboard';
import { Session } from './components/Session';
import { Sidebar } from './components/Sidebar';
import './css/index.css';

export function App() {
  const view = useComputed(() => currentView.value);
  const embedded = useComputed(() => isEmbedded.value);

  return (
    <div id="studyengine-root" class={embedded.value ? 'embedded' : 'standalone'}>
      {!embedded.value && <Sidebar />}
      <main class="main-area">
        <div class="main-content">
          <div class="wrap">
            <div class="shell">
              <div class="card" id="rootCard">
                {view.value === 'dashboard' && <Dashboard />}
                {view.value === 'session' && <Session />}
                {view.value === 'done' && <DoneView />}
                {view.value === 'learn' && <LearnPlaceholder />}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function DoneView() {
  return (
    <div class="view active" id="viewDone">
      <div class="done-celebration">
        <div class="done-emoji">🎉</div>
        <div class="done-headline">Session Complete</div>
        <div class="done-subtitle">Great work! Your progress has been saved.</div>
      </div>
      <button
        class="big-btn"
        onClick={() => { currentView.value = 'dashboard'; }}
      >
        Back to Dashboard
      </button>
    </div>
  );
}

function LearnPlaceholder() {
  return (
    <div class="view active" id="viewLearn">
      <div class="learn-shell">
        <div class="learn-topbar">
          <span class="learn-title">LEARNING</span>
        </div>
        <div class="learn-content">
          <p>Learn mode coming soon...</p>
        </div>
      </div>
    </div>
  );
}

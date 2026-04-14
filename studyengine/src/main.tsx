import { render } from 'preact';
import { App } from './App';
import { initStateSignals } from './signals';

// Initialize state from SyncEngine before rendering
initStateSignals();

// Wait for core.js to initialize SyncEngine
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app');
  if (root) {
    render(<App />, root);
  } else {
    // Fallback to body if #app doesn't exist
    const appDiv = document.createElement('div');
    appDiv.id = 'app';
    document.body.appendChild(appDiv);
    render(<App />, appDiv);
  }
});

/*
 * ProgressBar Component
 * Session progress indicator
 */

import { h } from 'preact';
import { sessionIndex, sessionQueue } from '../../signals';

export function ProgressBar() {
  const total = sessionQueue.value.length;
  const current = sessionIndex.value + 1;
  const progress = total > 0 ? (sessionIndex.value / total) * 100 : 0;

  return (
    <div class="progress-bar-container">
      <div class="progress-text">
        {current} of {total}
      </div>
      <div class="progress-bar">
        <div 
          class="progress-fill" 
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

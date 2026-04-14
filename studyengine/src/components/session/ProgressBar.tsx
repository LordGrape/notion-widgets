/*
 * ProgressBar Component
 * Session progress indicator
 */

import { sessionIndex, sessionQueue } from '../../signals';

export function ProgressBar() {
  const total = sessionQueue.value.length;
  const current = sessionIndex.value + 1;
  const progress = total > 0 ? (sessionIndex.value / total) * 100 : 0;

  return (
    <div className="progress-bar-container">
      <div className="progress-text">
        {current} of {total}
      </div>
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

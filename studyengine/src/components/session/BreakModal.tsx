/*
 * BreakModal Component
 * Microbreak overlay
 */

import { useEffect, useState } from 'react';
import { breakTimeRemaining, breakActive } from '../../signals';

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const BREAK_TIPS = [
  'Stand up and stretch your legs',
  'Look at something 20 feet away for 20 seconds',
  'Take a few deep breaths',
  'Roll your shoulders back and forth',
  'Close your eyes and rest for a moment',
  'Drink some water',
  'Stretch your arms overhead'
];

interface BreakModalProps {
  duration: number;
  onSkip: () => void;
}

export function BreakModal({ duration, onSkip }: BreakModalProps) {
  const [remaining, setRemaining] = useState(duration);
  const [tip] = useState(() => BREAK_TIPS[Math.floor(Math.random() * BREAK_TIPS.length)]);

  useEffect(() => {
    if (remaining <= 0) {
      onSkip();
      return;
    }

    const timer = setTimeout(() => {
      setRemaining(r => r - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [remaining, onSkip]);

  return (
    <div className="break-overlay show">
      <div className="break-modal">
        <div className="break-icon">🧘</div>
        <h2>Time for a break</h2>
        <div className="break-timer">{formatTime(remaining)}</div>
        <p className="break-tip">{tip}</p>
        <button className="break-skip-btn" onClick={onSkip}>
          Skip break
        </button>
      </div>
    </div>
  );
}

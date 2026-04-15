/*
 * Apply Tier Renderer
 * Application/scenario-based
 */

import { useEffect, useState } from 'react';
import { userAnswer, currentShown } from '../../signals';
import type { StudyItem } from '../../types';

interface ApplyProps {
  item: StudyItem;
  onReveal: () => void;
  onDontKnow?: () => void;
}

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function Apply({ item, onReveal, onDontKnow }: ApplyProps) {
  const shown = currentShown.value;
  const [draft, setDraft] = useState(userAnswer.value);
  const [secondsLeft, setSecondsLeft] = useState((item.timeLimitMins ?? 0) * 60);
  const dontKnow = onDontKnow ?? onReveal;

  useEffect(() => {
    setDraft(userAnswer.value);
  }, [userAnswer.value, item.id]);

  useEffect(() => {
    setSecondsLeft((item.timeLimitMins ?? 0) * 60);
  }, [item.id, item.timeLimitMins]);

  useEffect(() => {
    if (shown || !item.timeLimitMins || secondsLeft <= 0) return;
    const t = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [shown, item.timeLimitMins, secondsLeft]);

  const handleInput = (val: string) => {
    setDraft(val);
    userAnswer.value = val;
  };

  return (
    <div className="tier-content tier-apply">
      <div className="se-tier-header">
        <div className="se-tier-label">Apply</div>
        {item.timeLimitMins ? <div className="se-tier-timer">{formatTime(secondsLeft)}</div> : null}
      </div>

      <div className="se-tier-scenario">{item.scenario || item.prompt}</div>
      {item.task ? <p className="prompt">{item.task}</p> : null}

      {!shown ? (
        <>
          <textarea
            className="se-tier-textarea"
            placeholder="How would you apply this concept in this scenario?"
            value={draft}
            onChange={(e) => handleInput(e.target.value)}
          />
          <div className="se-tier-actions">
            <button className="big-btn se-tier-reveal-btn" onClick={onReveal}>Check</button>
            <button className="se-tier-dk-link" onClick={dontKnow}>I don't know</button>
          </div>
        </>
      ) : (
        <div className="se-tier-answer">
          <div className="answer-header">Model Answer</div>
          <div className="md-content">{item.modelAnswer}</div>
        </div>
      )}
    </div>
  );
}

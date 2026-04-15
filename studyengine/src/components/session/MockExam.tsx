/*
 * MockExam Tier Renderer
 * Exam-style question with rubric
 */

import { useEffect, useState } from 'react';
import { userAnswer, currentShown } from '../../signals';
import type { StudyItem } from '../../types';

interface MockExamProps {
  item: StudyItem;
  onReveal: () => void;
  onDontKnow?: () => void;
}

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function MockExam({ item, onReveal, onDontKnow }: MockExamProps) {
  const shown = currentShown.value;
  const [draft, setDraft] = useState(userAnswer.value);
  const [secondsLeft, setSecondsLeft] = useState((item.timeLimitMins ?? 5) * 60);
  const dontKnow = onDontKnow ?? onReveal;

  useEffect(() => {
    setDraft(userAnswer.value);
  }, [userAnswer.value, item.id]);

  useEffect(() => {
    setSecondsLeft((item.timeLimitMins ?? 5) * 60);
  }, [item.id, item.timeLimitMins]);

  useEffect(() => {
    if (shown || secondsLeft <= 0) return;
    const t = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [shown, secondsLeft]);

  const handleInput = (val: string) => {
    setDraft(val);
    userAnswer.value = val;
  };

  return (
    <div className="tier-content tier-mock">
      <div className="se-tier-header">
        <div className="se-tier-label">Mock Exam</div>
        <div className="se-tier-timer">{formatTime(secondsLeft)}</div>
      </div>

      <div className="se-tier-formal">
        <p className="prompt">{item.prompt}</p>
      </div>

      {!shown ? (
        <>
          <textarea
            className="se-tier-textarea"
            placeholder="Write your exam response..."
            value={draft}
            onChange={(e) => handleInput(e.target.value)}
          />
          <div className="se-tier-actions">
            <button className="big-btn se-tier-reveal-btn" onClick={onReveal}>Submit</button>
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

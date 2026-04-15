/*
 * Explain Tier Renderer
 * Longer written explanation
 */

import { useEffect, useState } from 'react';
import { userAnswer, currentShown } from '../../signals';
import type { StudyItem } from '../../types';

interface ExplainProps {
  item: StudyItem;
  onReveal: () => void;
  onDontKnow?: () => void;
}

export function Explain({ item, onReveal, onDontKnow }: ExplainProps) {
  const shown = currentShown.value;
  const [draft, setDraft] = useState(userAnswer.value);

  useEffect(() => {
    setDraft(userAnswer.value);
  }, [userAnswer.value, item.id]);

  const handleInput = (val: string) => {
    setDraft(val);
    userAnswer.value = val;
  };

  const dontKnow = onDontKnow ?? onReveal;

  return (
    <div className="tier-content tier-explain">
      <p className="prompt">Explain this concept in your own words:</p>
      {!shown ? (
        <>
          <textarea
            className="se-tier-textarea"
            placeholder="Write your explanation..."
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

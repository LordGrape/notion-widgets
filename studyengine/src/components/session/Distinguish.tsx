/*
 * Distinguish Tier Renderer
 * Compare/contrast, discrimination
 */

import { useEffect, useState } from 'react';
import { userAnswer, currentShown } from '../../signals';
import type { StudyItem } from '../../types';

interface DistinguishProps {
  item: StudyItem;
  onReveal: () => void;
  onDontKnow?: () => void;
}

export function Distinguish({ item, onReveal, onDontKnow }: DistinguishProps) {
  const shown = currentShown.value;
  const [draft, setDraft] = useState(userAnswer.value);
  const dontKnow = onDontKnow ?? onReveal;

  useEffect(() => {
    setDraft(userAnswer.value);
  }, [userAnswer.value, item.id]);

  const handleInput = (val: string) => {
    setDraft(val);
    userAnswer.value = val;
  };

  return (
    <div className="tier-content tier-distinguish">
      <p className="prompt">Compare and contrast:</p>
      <div className="se-tier-concepts">
        <div className="se-tier-concept-pill">{item.conceptA || 'Concept A'}</div>
        <div className="se-tier-concept-pill">{item.conceptB || 'Concept B'}</div>
      </div>

      {!shown ? (
        <>
          <textarea
            className="se-tier-textarea"
            placeholder="Explain the key differences and similarities..."
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

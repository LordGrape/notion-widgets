/*
 * WorkedExample Tier Renderer
 * Step-by-step problem solving
 */

import { useEffect, useMemo, useState } from 'react';
import { userAnswer, currentShown } from '../../signals';
import type { StudyItem } from '../../types';

interface WorkedExampleProps {
  item: StudyItem;
  onReveal: () => void;
  onDontKnow?: () => void;
}

export function WorkedExample({ item, onReveal, onDontKnow }: WorkedExampleProps) {
  const shown = currentShown.value;
  const [draft, setDraft] = useState(userAnswer.value);
  const dontKnow = onDontKnow ?? onReveal;

  const scaffoldSteps = useMemo(
    () => (item.workedScaffold || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    [item.workedScaffold]
  );

  useEffect(() => {
    setDraft(userAnswer.value);
  }, [userAnswer.value, item.id]);

  const handleInput = (val: string) => {
    setDraft(val);
    userAnswer.value = val;
  };

  return (
    <div className="tier-content tier-worked">
      {scaffoldSteps.length > 0 ? (
        <>
          <p className="prompt">Complete the missing steps:</p>
          <ol className="se-tier-worked-list">
            {scaffoldSteps.map((step, idx) => <li key={`${idx}-${step}`}>{step}</li>)}
          </ol>
        </>
      ) : (
        <p className="prompt">{item.prompt}</p>
      )}

      {!shown ? (
        <>
          <textarea
            className="se-tier-textarea"
            placeholder="Fill in your working and missing steps..."
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
          <div className="answer-header">Worked Solution</div>
          <div className="md-content">{item.modelAnswer}</div>
        </div>
      )}
    </div>
  );
}

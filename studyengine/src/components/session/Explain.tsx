/*
 * Explain Tier Renderer
 * Longer written explanation
 */

import { userAnswer, currentShown } from '../../signals';
import type { StudyItem } from '../../types';

interface ExplainProps {
  item: StudyItem;
  onReveal: () => void;
}

export function Explain({ item, onReveal }: ExplainProps) {
  const shown = currentShown.value;

  return (
    <div className="tier-content tier-explain">
      {!shown ? (
        <div className="generative-input">
          <textarea
            id="userText"
            className="response-textarea"
            placeholder="Explain this concept in your own words..."
            value={userAnswer.value}
            onInput={(e) => userAnswer.value = (e.target as HTMLTextAreaElement).value}
            rows={8}
          />
          <div className="button-row">
            <button className="qa-btn" onClick={onReveal}>
              Check Answer
            </button>
            <button className="ghost-btn" onClick={onReveal}>
              Don't know
            </button>
          </div>
        </div>
      ) : (
        <div className="revealed-content">
          {item.modelAnswer && (
            <div className="model-answer">
              <div className="answer-header">Model Answer</div>
              <div className="md-content">{item.modelAnswer}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

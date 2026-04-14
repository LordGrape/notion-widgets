/*
 * Apply Tier Renderer
 * Application/scenario-based
 */

import { userAnswer, currentShown } from '../../signals';
import type { StudyItem } from '../../types';

interface ApplyProps {
  item: StudyItem;
  onReveal: () => void;
}

export function Apply({ item, onReveal }: ApplyProps) {
  const shown = currentShown.value;

  return (
    <div className="tier-content tier-apply">
      <div className="scenario-block">
        <div className="scenario-label">Scenario</div>
        <div className="scenario-text">{item.scenario || item.prompt}</div>
      </div>

      {!shown ? (
        <div className="generative-input">
          <textarea
            id="userText"
            className="response-textarea"
            placeholder="How would you apply this concept in this scenario?"
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

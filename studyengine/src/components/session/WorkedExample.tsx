/*
 * WorkedExample Tier Renderer
 * Step-by-step problem solving
 */

import { userAnswer, currentShown } from '../../signals';
import type { StudyItem } from '../../types';

interface WorkedExampleProps {
  item: StudyItem;
  onReveal: () => void;
}

export function WorkedExample({ item, onReveal }: WorkedExampleProps) {
  const shown = currentShown.value;

  return (
    <div className="tier-content tier-worked">
      {!shown ? (
        <div className="generative-input">
          <div className="steps-hint">
            Work through this problem step by step:
          </div>
          <textarea
            id="userText"
            className="response-textarea"
            placeholder="Show your work..."
            value={userAnswer.value}
            onInput={(e) => userAnswer.value = (e.target as HTMLTextAreaElement).value}
            rows={10}
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
              <div className="answer-header">Worked Solution</div>
              <div className="md-content">{item.modelAnswer}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

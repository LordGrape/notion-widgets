/*
 * Distinguish Tier Renderer
 * Compare/contrast, discrimination
 */

import { userAnswer, currentShown } from '../../signals';
import type { StudyItem } from '../../types';

interface DistinguishProps {
  item: StudyItem;
  onReveal: () => void;
}

export function Distinguish({ item, onReveal }: DistinguishProps) {
  const shown = currentShown.value;

  return (
    <div className="tier-content tier-distinguish">
      <div className="concepts-row">
        <div className="concept-box">
          <div className="concept-label">Concept A</div>
          <div className="concept-name">{item.conceptA || 'Concept A'}</div>
        </div>
        <div className="concept-divider">vs</div>
        <div className="concept-box">
          <div className="concept-label">Concept B</div>
          <div className="concept-name">{item.conceptB || 'Concept B'}</div>
        </div>
      </div>

      {!shown ? (
        <div className="generative-input">
          <textarea
            id="userText"
            className="response-textarea"
            placeholder="Explain the key differences between these concepts..."
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

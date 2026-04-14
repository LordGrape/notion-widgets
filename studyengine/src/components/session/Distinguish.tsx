/*
 * Distinguish Tier Renderer
 * Compare/contrast, discrimination
 */

import { h } from 'preact';
import { userAnswer, currentShown } from '../../signals';
import type { StudyItem } from '../../types';

interface DistinguishProps {
  item: StudyItem;
  onReveal: () => void;
}

export function Distinguish({ item, onReveal }: DistinguishProps) {
  const shown = currentShown.value;

  return (
    <div class="tier-content tier-distinguish">
      <div class="concepts-row">
        <div class="concept-box">
          <div class="concept-label">Concept A</div>
          <div class="concept-name">{item.conceptA || 'Concept A'}</div>
        </div>
        <div class="concept-divider">vs</div>
        <div class="concept-box">
          <div class="concept-label">Concept B</div>
          <div class="concept-name">{item.conceptB || 'Concept B'}</div>
        </div>
      </div>

      {!shown ? (
        <div class="generative-input">
          <textarea
            id="userText"
            class="response-textarea"
            placeholder="Explain the key differences between these concepts..."
            value={userAnswer.value}
            onInput={(e) => userAnswer.value = (e.target as HTMLTextAreaElement).value}
            rows={8}
          />
          <div class="button-row">
            <button class="qa-btn" onClick={onReveal}>
              Check Answer
            </button>
            <button class="ghost-btn" onClick={onReveal}>
              Don't know
            </button>
          </div>
        </div>
      ) : (
        <div class="revealed-content">
          {item.modelAnswer && (
            <div class="model-answer">
              <div class="answer-header">Model Answer</div>
              <div class="md-content">{item.modelAnswer}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

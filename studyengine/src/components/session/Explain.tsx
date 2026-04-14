/*
 * Explain Tier Renderer
 * Longer written explanation
 */

import { h } from 'preact';
import { userAnswer, currentShown } from '../../signals';
import type { StudyItem } from '../../types';

interface ExplainProps {
  item: StudyItem;
  onReveal: () => void;
}

export function Explain({ item, onReveal }: ExplainProps) {
  const shown = currentShown.value;

  return (
    <div class="tier-content tier-explain">
      {!shown ? (
        <div class="generative-input">
          <textarea
            id="userText"
            class="response-textarea"
            placeholder="Explain this concept in your own words..."
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

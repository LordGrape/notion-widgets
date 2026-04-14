/*
 * Apply Tier Renderer
 * Application/scenario-based
 */

import { h } from 'preact';
import { userAnswer, currentShown } from '../../signals';
import type { StudyItem } from '../../types';

interface ApplyProps {
  item: StudyItem;
  onReveal: () => void;
}

export function Apply({ item, onReveal }: ApplyProps) {
  const shown = currentShown.value;

  return (
    <div class="tier-content tier-apply">
      <div class="scenario-block">
        <div class="scenario-label">Scenario</div>
        <div class="scenario-text">{item.scenario || item.prompt}</div>
      </div>

      {!shown ? (
        <div class="generative-input">
          <textarea
            id="userText"
            class="response-textarea"
            placeholder="How would you apply this concept in this scenario?"
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

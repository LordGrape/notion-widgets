/*
 * WorkedExample Tier Renderer
 * Step-by-step problem solving
 */

import { h } from 'preact';
import { userAnswer, currentShown } from '../../signals';
import type { StudyItem } from '../../types';

interface WorkedExampleProps {
  item: StudyItem;
  onReveal: () => void;
}

export function WorkedExample({ item, onReveal }: WorkedExampleProps) {
  const shown = currentShown.value;

  return (
    <div class="tier-content tier-worked">
      {!shown ? (
        <div class="generative-input">
          <div class="steps-hint">
            Work through this problem step by step:
          </div>
          <textarea
            id="userText"
            class="response-textarea"
            placeholder="Show your work..."
            value={userAnswer.value}
            onInput={(e) => userAnswer.value = (e.target as HTMLTextAreaElement).value}
            rows={10}
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
              <div class="answer-header">Worked Solution</div>
              <div class="md-content">{item.modelAnswer}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

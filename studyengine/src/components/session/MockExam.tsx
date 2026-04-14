/*
 * MockExam Tier Renderer
 * Exam-style question with rubric
 */

import { h } from 'preact';
import { userAnswer, currentShown, essayPhase } from '../../signals';
import type { StudyItem } from '../../types';

interface MockExamProps {
  item: StudyItem;
  onReveal: () => void;
}

export function MockExam({ item, onReveal }: MockExamProps) {
  const shown = currentShown.value;
  const phase = essayPhase.value;

  // Rubric component
  const rubric = (
    <div class="rubric" id="rubric">
      <div class="rub-row" data-rub="acc">
        <div class="lbl">Accuracy</div>
        <div class="rub-pills">
          <div class="rub-pill" data-idx="0">Missed key points</div>
          <div class="rub-pill" data-idx="1">Partial</div>
          <div class="rub-pill" data-idx="2">Complete</div>
        </div>
      </div>
      <div class="rub-row" data-rub="dep">
        <div class="lbl">Depth</div>
        <div class="rub-pills">
          <div class="rub-pill" data-idx="0">Surface</div>
          <div class="rub-pill" data-idx="1">Adequate</div>
          <div class="rub-pill" data-idx="2">Thorough</div>
        </div>
      </div>
      <div class="rub-row" data-rub="cla">
        <div class="lbl">Clarity</div>
        <div class="rub-pills">
          <div class="rub-pill" data-idx="0">Unclear</div>
          <div class="rub-pill" data-idx="1">Decent</div>
          <div class="rub-pill" data-idx="2">Clear</div>
        </div>
      </div>
    </div>
  );

  if (!shown) {
    return (
      <div class="tier-content tier-mock">
        <div class="generative-input">
          <textarea
            id="userText"
            class="response-textarea"
            placeholder="Write your exam response..."
            value={userAnswer.value}
            onInput={(e) => userAnswer.value = (e.target as HTMLTextAreaElement).value}
            rows={10}
          />
          <div class="word-count" id="essayWordCount">0 words</div>
          <div class="button-row">
            <button class="qa-btn" id="submitBtn" onClick={onReveal}>
              Submit
            </button>
            <button class="ghost-btn" id="dontKnowBtn" onClick={onReveal}>
              Don't know
            </button>
          </div>
        </div>
        {rubric}
      </div>
    );
  }

  return (
    <div class="tier-content tier-mock">
      <div class="revealed-content">
        {item.modelAnswer && (
          <div class="model-answer">
            <div class="answer-header">Model Answer</div>
            <div class="md-content">{item.modelAnswer}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/*
 * MockExam Tier Renderer
 * Exam-style question with rubric
 */

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
    <div className="rubric" id="rubric">
      <div className="rub-row" data-rub="acc">
        <div className="lbl">Accuracy</div>
        <div className="rub-pills">
          <div className="rub-pill" data-idx="0">Missed key points</div>
          <div className="rub-pill" data-idx="1">Partial</div>
          <div className="rub-pill" data-idx="2">Complete</div>
        </div>
      </div>
      <div className="rub-row" data-rub="dep">
        <div className="lbl">Depth</div>
        <div className="rub-pills">
          <div className="rub-pill" data-idx="0">Surface</div>
          <div className="rub-pill" data-idx="1">Adequate</div>
          <div className="rub-pill" data-idx="2">Thorough</div>
        </div>
      </div>
      <div className="rub-row" data-rub="cla">
        <div className="lbl">Clarity</div>
        <div className="rub-pills">
          <div className="rub-pill" data-idx="0">Unclear</div>
          <div className="rub-pill" data-idx="1">Decent</div>
          <div className="rub-pill" data-idx="2">Clear</div>
        </div>
      </div>
    </div>
  );

  if (!shown) {
    return (
      <div className="tier-content tier-mock">
        <div className="generative-input">
          <textarea
            id="userText"
            className="response-textarea"
            placeholder="Write your exam response..."
            value={userAnswer.value}
            onInput={(e) => userAnswer.value = (e.target as HTMLTextAreaElement).value}
            rows={10}
          />
          <div className="word-count" id="essayWordCount">0 words</div>
          <div className="button-row">
            <button className="qa-btn" id="submitBtn" onClick={onReveal}>
              Submit
            </button>
            <button className="ghost-btn" id="dontKnowBtn" onClick={onReveal}>
              Don't know
            </button>
          </div>
        </div>
        {rubric}
      </div>
    );
  }

  return (
    <div className="tier-content tier-mock">
      <div className="revealed-content">
        {item.modelAnswer && (
          <div className="model-answer">
            <div className="answer-header">Model Answer</div>
            <div className="md-content">{item.modelAnswer}</div>
          </div>
        )}
      </div>
    </div>
  );
}

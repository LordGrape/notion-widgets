/*
 * QuickFire Tier Renderer
 * Rapid recall, short answer
 */

import { Fragment, useRef, useEffect } from 'react';
import type { StudyItem } from '../../types';
import { currentShown } from '../../signals';

interface QuickFireProps {
  item: StudyItem;
  onReveal: () => void;
  onDontKnow: () => void;
}

export function QuickFire({ item, onReveal, onDontKnow }: QuickFireProps) {
  const shown = currentShown.value;

  return (
    <div className="tier-content tier-quickfire">
      <div className="confidence-prompt" style={{ display: shown ? 'none' : 'block' }}>
        <p>How confident are you that you know this?</p>
        <div className="confidence-buttons">
          <button className="conf-btn low" onClick={onReveal}>Low</button>
          <button className="conf-btn med" onClick={onReveal}>Medium</button>
          <button className="conf-btn high" onClick={onReveal}>High</button>
        </div>
      </div>

      <div className="reveal-section" style={{ display: shown ? 'block' : 'none' }}>
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

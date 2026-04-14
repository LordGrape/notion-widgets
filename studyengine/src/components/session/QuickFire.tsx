/*
 * QuickFire Tier Renderer
 * Rapid recall, short answer
 */

import { h, Fragment } from 'preact';
import { useRef, useEffect } from 'preact/hooks';
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
    <div class="tier-content tier-quickfire">
      <div class="confidence-prompt" style={{ display: shown ? 'none' : 'block' }}>
        <p>How confident are you that you know this?</p>
        <div class="confidence-buttons">
          <button class="conf-btn low" onClick={onReveal}>Low</button>
          <button class="conf-btn med" onClick={onReveal}>Medium</button>
          <button class="conf-btn high" onClick={onReveal}>High</button>
        </div>
      </div>

      <div class="reveal-section" style={{ display: shown ? 'block' : 'none' }}>
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

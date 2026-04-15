/*
 * QuickFire Tier Renderer
 * Rapid recall, short answer
 */

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
      <p className="prompt">{item.prompt}</p>

      {!shown ? (
        <div className="se-tier-actions">
          <button className="big-btn se-tier-reveal-btn" onClick={onReveal}>Reveal</button>
          <button className="se-tier-dk-link" onClick={onDontKnow}>I don't know</button>
        </div>
      ) : (
        <div className="se-tier-answer">
          <div className="answer-header">Model Answer</div>
          <div className="md-content">{item.modelAnswer}</div>
        </div>
      )}
    </div>
  );
}

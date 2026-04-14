/*
 * TierRenderer Component
 * Dispatches to the correct tier component
 */

import type { StudyItem } from '../../types';
import { QuickFire } from './QuickFire';
import { Explain } from './Explain';
import { Apply } from './Apply';
import { Distinguish } from './Distinguish';
import { MockExam } from './MockExam';
import { WorkedExample } from './WorkedExample';

type Tier = 'quickfire' | 'explain' | 'apply' | 'distinguish' | 'mock' | 'worked';

interface TierRendererProps {
  item: StudyItem;
  tier: Tier;
  onReveal: () => void;
  onDontKnow: () => void;
}

export function TierRenderer({ item, tier, onReveal, onDontKnow }: TierRendererProps) {
  switch (tier) {
    case 'quickfire':
      return <QuickFire item={item} onReveal={onReveal} onDontKnow={onDontKnow} />;
    case 'explain':
      return <Explain item={item} onReveal={onReveal} />;
    case 'apply':
      return <Apply item={item} onReveal={onReveal} />;
    case 'distinguish':
      return <Distinguish item={item} onReveal={onReveal} />;
    case 'mock':
      return <MockExam item={item} onReveal={onReveal} />;
    case 'worked':
      return <WorkedExample item={item} onReveal={onReveal} />;
    default:
      return <QuickFire item={item} onReveal={onReveal} onDontKnow={onDontKnow} />;
  }
}

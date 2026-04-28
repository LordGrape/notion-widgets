import { describe, expect, it } from 'vitest';
import { countItemsByClassifiedTier } from './tier-classifier';

describe('countItemsByClassifiedTier', () => {
  it('counts each card exactly once by its classified tier', () => {
    // B3: headline tier stats must use item.tier classification, not eligibility.
    const counts = countItemsByClassifiedTier([
      { tier: 'quickfire' },
      { tier: 'explain' },
      { tier: 'apply' },
      { tier: 'mock' },
      { tier: undefined }
    ] as any);

    expect(counts).toEqual({
      quickfire: 2,
      explain: 1,
      apply: 1,
      distinguish: 0,
      mock: 1,
      worked: 0
    });
  });
});

import { describe, expect, it } from 'vitest';
import { getCardEncodingDefault } from './types';

describe('getCardEncodingDefault', () => {
  it('returns expected defaults by source type', () => {
    expect(getCardEncodingDefault({})).toBe('full-learn');
    expect(getCardEncodingDefault({ source: { type: 'manual' } })).toBe('full-learn');
    expect(getCardEncodingDefault({ source: { type: 'qec', lectureAttended: true } })).toBe('rapid-consolidation');
    expect(getCardEncodingDefault({ source: { type: 'qec', lectureAttended: false } })).toBe('full-learn');
    expect(
      getCardEncodingDefault({ source: { type: 'notion-ai-summary', sourceSection: 'key-concepts', lectureAttended: false } })
    ).toBe('full-learn');
    expect(getCardEncodingDefault({ source: { type: 'lecture-paste-freeform', lectureAttended: true } })).toBe(
      'rapid-consolidation'
    );
  });
});

import { describe, expect, it } from 'vitest';

import { sampaToIpa } from './sampa-to-ipa';

describe('sampaToIpa', () => {
  it('maps known baselines', () => {
    expect(sampaToIpa('bO~ZuR')).toBe('bɔ̃ʒuʁ');
    expect(sampaToIpa('m@RsI')).toBe('məʁsi');
    expect(sampaToIpa('vu')).toBe('vu');
    expect(sampaToIpa('R@gaRde')).toBe('ʁəgaʁde');
  });

  it('converts a sample set from the high-frequency list', () => {
    const cases: Array<[string, string]> = [
      ['d@', 'də'],
      ['la', 'la'],
      ['l@', 'lə'],
      ['EtR', 'ɛtʁ'],
      ['e', 'e'],
      ['a', 'a'],
      ['il', 'il'],
      ['avwaR', 'avwaʁ'],
      ['n@', 'nə'],
      ['Z@', 'ʒə'],
      ['s@', 'sə'],
      ['ki', 'ki'],
      ['d@~', 'də̃'],
      ['@~', 'ə̃'],
      ['9~', 'œ̃'],
      ['ty', 'ty'],
      ['pA', 'pɑ'],
      ['vulwaR', 'vulwaʁ'],
      ['fER', 'fɛʁ'],
      ['puvwaR', 'puvwaʁ'],
    ];

    for (const [sampa, ipa] of cases) {
      expect(sampaToIpa(sampa)).toBe(ipa);
    }
  });
});

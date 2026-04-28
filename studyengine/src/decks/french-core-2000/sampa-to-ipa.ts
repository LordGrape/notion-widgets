// L1b-alpha: French SAMPA → IPA mapping for Lexique 3 `phon` values.
// Reference: https://en.wikipedia.org/wiki/SAMPA_chart_for_French

const MULTI: ReadonlyArray<[string, string]> = [
  ['a~', 'ɑ̃'],
  ['A~', 'ɑ̃'],
  ['e~', 'ɛ̃'],
  ['E~', 'ɛ̃'],
  ['o~', 'ɔ̃'],
  ['O~', 'ɔ̃'],
  ['9~', 'œ̃'],
  ['@~', 'ə̃'],
];

const SINGLE: Readonly<Record<string, string>> = {
  E: 'ɛ',
  '2': 'ø',
  '9': 'œ',
  O: 'ɔ',
  A: 'ɑ',
  I: 'i',
  '@': 'ə',
  S: 'ʃ',
  Z: 'ʒ',
  N: 'ɲ',
  R: 'ʁ',
  H: 'ɥ',
  '8': 'ɥ',
  // pass-through letters observed in Lexique 3 French SAMPA variants
  a: 'a',
  e: 'e',
  i: 'i',
  o: 'o',
  u: 'u',
  y: 'y',
  p: 'p',
  t: 't',
  k: 'k',
  b: 'b',
  d: 'd',
  g: 'g',
  m: 'm',
  n: 'n',
  f: 'f',
  v: 'v',
  s: 's',
  z: 'z',
  l: 'l',
  w: 'w',
  j: 'j',
};

export function sampaToIpa(sampa: string): string {
  let out = '';
  let i = 0;
  while (i < sampa.length) {
    const two = sampa.slice(i, i + 2);
    const multi = MULTI.find(([k]) => k === two);
    if (multi) {
      out += multi[1];
      i += 2;
      continue;
    }

    const ch = sampa[i];
    out += SINGLE[ch] ?? ch;
    i += 1;
  }
  return out;
}

// @ts-nocheck — node: imports + __dirname follow the existing convention used
// by `run5-language-audit.test.ts` in this package; @types/node is not in
// devDeps at the studyengine package level.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  parseLexique3,
  selectTopByFreqfilms2,
  parseTatoebaPairs,
  indexPairsByLemma,
  buildCardJson,
} from './pipeline';
import type { Lexique3Entry, TatoebaPair } from './types';

const FIX_DIR = resolve(__dirname, '__fixtures__');
const lexiqueTsv = readFileSync(resolve(FIX_DIR, 'lexique3-tiny.tsv'), 'utf8');
const fraTsv = readFileSync(resolve(FIX_DIR, 'tatoeba-fra.tsv'), 'utf8');
const engTsv = readFileSync(resolve(FIX_DIR, 'tatoeba-eng.tsv'), 'utf8');
const linksCsv = readFileSync(resolve(FIX_DIR, 'tatoeba-links.csv'), 'utf8');

describe('parseLexique3', () => {
  it('returns [] for empty input', () => {
    expect(parseLexique3('')).toEqual([]);
    expect(parseLexique3('   \n  ')).toEqual([]);
  });

  it('parses the tiny fixture and skips rows with empty lemma', () => {
    const entries = parseLexique3(lexiqueTsv);
    // 11 data rows in the fixture, all with non-empty lemma.
    expect(entries.length).toBe(11);
    const de = entries.find((e) => e.ortho === 'de');
    expect(de).toBeDefined();
    expect(de!.lemme).toBe('de');
    expect(de!.freqlemfilms2).toBeCloseTo(38967.3, 1);
    expect(de!.cgram).toBe('PRE');
  });

  it('throws if a required column is missing from the header', () => {
    const broken = 'ortho\tphon\tlemme\nde\td@\tde\n';
    expect(() => parseLexique3(broken)).toThrow(/required column/);
  });
});

describe('selectTopByFreqfilms2 (per-lemma aggregated)', () => {
  it('returns [] for empty input or n <= 0', () => {
    expect(selectTopByFreqfilms2([], 50)).toEqual([]);
    expect(selectTopByFreqfilms2(parseLexique3(lexiqueTsv), 0)).toEqual([]);
  });

  it('collapses multiple POS / inflected rows for the same lemma to one card', () => {
    const entries = parseLexique3(lexiqueTsv);
    const top = selectTopByFreqfilms2(entries, 50);
    const lemmas = top.map((e) => e.lemme);
    // `être` has 3 rows (être, est, sont); `chien` has 2; `le` has 2.
    // Each must appear exactly once.
    const counts = lemmas.reduce<Record<string, number>>((acc, l) => {
      acc[l] = (acc[l] || 0) + 1;
      return acc;
    }, {});
    expect(counts['être']).toBe(1);
    expect(counts['chien']).toBe(1);
    expect(counts['le']).toBe(1);
  });

  it('prefers the canonical row (ortho === lemme) when collapsing', () => {
    const entries = parseLexique3(lexiqueTsv);
    const top = selectTopByFreqfilms2(entries, 50);
    const être = top.find((e) => e.lemme === 'être');
    expect(être).toBeDefined();
    expect(être!.ortho).toBe('être');
  });

  it('sorts by freqlemfilms2 desc, ties broken by lemma alpha', () => {
    const entries = parseLexique3(lexiqueTsv);
    const top = selectTopByFreqfilms2(entries, 50);
    const freqs = top.map((e) => e.freqlemfilms2);
    for (let i = 1; i < freqs.length; i++) {
      expect(freqs[i]).toBeLessThanOrEqual(freqs[i - 1]);
    }
    // `la` and `le` share freqlemfilms2 == 19234.10 → la first by alpha.
    const laIdx = top.findIndex((e) => e.lemme === 'la');
    const leIdx = top.findIndex((e) => e.lemme === 'le');
    expect(laIdx).toBeGreaterThanOrEqual(0);
    expect(leIdx).toBeGreaterThanOrEqual(0);
    expect(laIdx).toBeLessThan(leIdx);
  });

  it('respects n', () => {
    const entries = parseLexique3(lexiqueTsv);
    const top3 = selectTopByFreqfilms2(entries, 3);
    expect(top3.length).toBe(3);
    expect(top3[0].lemme).toBe('de'); // highest freq
  });
});

describe('parseTatoebaPairs', () => {
  it('returns [] when sentence dumps or links file are empty', () => {
    expect(
      parseTatoebaPairs({ fraSentencesTsv: '', engSentencesTsv: '', linksCsv: '' }),
    ).toEqual([]);
  });

  it('joins fra↔eng pairs and dedupes bidirectional link rows', () => {
    const pairs = parseTatoebaPairs({
      fraSentencesTsv: fraTsv,
      engSentencesTsv: engTsv,
      linksCsv,
    });
    // Sentences 1, 2, 4 have valid en pairs (3 dropped by length, 5 has no en sentence).
    // Sentence 1 is linked in both directions in links.csv → must dedupe to one pair.
    const fraIds = pairs.map((p) => p.fraId).sort((a, b) => a - b);
    expect(fraIds).toEqual([1, 2, 4]);
  });

  it('drops pairs whose French sentence exceeds maxFraLength (default 80)', () => {
    const pairs = parseTatoebaPairs({
      fraSentencesTsv: fraTsv,
      engSentencesTsv: engTsv,
      linksCsv,
    });
    // Sentence 3 is > 80 chars and must be dropped.
    expect(pairs.find((p) => p.fraId === 3)).toBeUndefined();
  });

  it('drops pairs missing a translation link', () => {
    const pairs = parseTatoebaPairs({
      fraSentencesTsv: fraTsv,
      engSentencesTsv: engTsv,
      linksCsv,
    });
    // Sentence 5 is linked to non-existent eng id 999 → no pair.
    expect(pairs.find((p) => p.fraId === 5)).toBeUndefined();
  });

  it('honours a custom maxFraLength', () => {
    const pairs = parseTatoebaPairs({
      fraSentencesTsv: fraTsv,
      engSentencesTsv: engTsv,
      linksCsv,
      maxFraLength: 12,
    });
    // Only "Bonjour." (8 chars) survives; "Le chien dort." is 14, "La maison est grande." is 21.
    expect(pairs.length).toBe(1);
    expect(pairs[0].fraId).toBe(4);
  });
});

describe('indexPairsByLemma', () => {
  it('buckets each pair under every distinct lowercase token in the French side', () => {
    const pairs: TatoebaPair[] = [
      { fraId: 1, fra: 'Le chien dort.', engId: 101, eng: 'The dog sleeps.' },
      { fraId: 2, fra: 'La maison est grande.', engId: 102, eng: 'The house is big.' },
    ];
    const idx = indexPairsByLemma(pairs);
    expect(idx.get('chien')).toEqual([pairs[0]]);
    expect(idx.get('maison')).toEqual([pairs[1]]);
    expect(idx.get('le')).toEqual([pairs[0]]);
    expect(idx.get('la')).toEqual([pairs[1]]);
  });

  it('lowercases tokens and dedupes within a single sentence', () => {
    const pairs: TatoebaPair[] = [
      { fraId: 1, fra: 'Le le LE chien.', engId: 101, eng: 'The dog.' },
    ];
    const idx = indexPairsByLemma(pairs);
    expect(idx.get('le')).toEqual([pairs[0]]);
    expect(idx.get('le')!.length).toBe(1);
  });
});

describe('buildCardJson', () => {
  function lemma(over: Partial<Lexique3Entry> = {}): Lexique3Entry {
    return {
      ortho: 'chien',
      phon: 'SjE~',
      lemme: 'chien',
      cgram: 'NOM',
      genre: 'm',
      nombre: 's',
      freqlemfilms2: 120.55,
      freqfilms2: 100,
      ...over,
    };
  }

  it('packs gender + IPA + gloss + example into modelAnswer markdown', () => {
    const card = buildCardJson({
      lemma: lemma(),
      gloss: 'dog',
      pair: { fraId: 1, fra: 'Le chien dort.', engId: 101, eng: 'The dog is sleeping.' },
    });
    expect(card.prompt).toBe('chien');
    expect(card.modelAnswer).toContain('**masc.**');
    expect(card.modelAnswer).toContain('/ʃjɛ̃/');
    expect(card.modelAnswer).toContain('*dog*');
    expect(card.modelAnswer).toContain('> Le chien dort.');
    expect(card.modelAnswer).toContain('> *The dog is sleeping.*');
  });

  it('omits the example block cleanly when no pair is provided', () => {
    const card = buildCardJson({ lemma: lemma(), gloss: 'dog' });
    expect(card.modelAnswer).not.toContain('>');
    expect(card.modelAnswer).toContain('*dog*');
  });

  it('omits the gender label for non-noun POS', () => {
    const card = buildCardJson({
      lemma: lemma({ ortho: 'être', lemme: 'être', cgram: 'VER', genre: '', phon: 'EtR' }),
      gloss: 'to be',
    });
    expect(card.modelAnswer).not.toContain('masc');
    expect(card.modelAnswer).not.toContain('fem');
    expect(card.modelAnswer).toContain('/ɛtʁ/');
  });

  it('emits the locked import-shape fields and omits fsrs', () => {
    const card = buildCardJson({ lemma: lemma(), gloss: 'dog' });
    expect(card.course).toBe('French');
    expect(card.subDeck).toBe('Core 2000');
    expect(card.topic).toBe('A1');
    expect(card.tier).toBe('quickfire');
    expect(card.targetLanguage).toBe('fr-CA');
    expect(card.languageLevel).toBe(1);
    expect(card.planProfile).toBe('language');
    expect(card.tags).toEqual(['cefr:A1', 'french-core-2000', 'l1b-alpha']);
    // fsrs intentionally omitted so commitImport seeds it (state: 'new', due ≈ 24h).
    expect((card as Record<string, unknown>).fsrs).toBeUndefined();
  });

  it('assigns CEFR bands from rank buckets', () => {
    const a2 = buildCardJson({ lemma: lemma(), gloss: 'dog', rank: 700 });
    const b1 = buildCardJson({ lemma: lemma(), gloss: 'dog', rank: 1700 });
    expect(a2.topic).toBe('A2');
    expect(a2.tags[0]).toBe('cefr:A2');
    expect(b1.topic).toBe('B1');
    expect(b1.tags[0]).toBe('cefr:B1');
  });

  it('ignores audioUrl in L1a (no audio chrome slot)', () => {
    const card = buildCardJson({
      lemma: lemma(),
      gloss: 'dog',
      audioUrl: 'https://example.com/chien.mp3',
    });
    expect(card.modelAnswer).not.toContain('example.com');
    expect(card.modelAnswer).not.toContain('audio');
  });
});

// @ts-nocheck
// L1b-alpha: compile final French Core 2000 import deck JSON.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildCardJson,
  indexPairsByLemma,
  parseLexique3,
  parseTatoebaPairs,
  selectTopByFreqfilms2,
} from '../src/decks/french-core-2000/pipeline';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const LEXIQUE_PATH = resolve(ROOT, 'data', 'lexique3', 'Lexique383.tsv');
const FRA_PATH = resolve(ROOT, 'data', 'tatoeba', 'fra_sentences.tsv');
const ENG_PATH = resolve(ROOT, 'data', 'tatoeba', 'eng_sentences.tsv');
const LINKS_PATH = resolve(ROOT, 'data', 'tatoeba', 'links.csv');

const SAMPLE_GLOSSES_PATH = resolve(ROOT, 'src', 'decks', 'french-core-2000', 'glosses-sample.json');
const GLOSSES_CACHE_PATH = resolve(ROOT, 'data', 'french-core-glosses.json');
const OUT_PATH = resolve(ROOT, 'data', 'french-core-2000.json');

function loadRequired(path: string, label: string): string {
  if (!existsSync(path)) throw new Error(`${label} not found at ${path}`);
  return readFileSync(path, 'utf8');
}

function loadGlossCaches() {
  const sampleRaw = JSON.parse(loadRequired(SAMPLE_GLOSSES_PATH, 'sample glosses')) as Record<string, string>;
  const sample = new Map<string, string>();
  for (const [k, v] of Object.entries(sampleRaw)) {
    if (k.startsWith('_')) continue;
    if (typeof v === 'string' && v.trim()) sample.set(k, v.trim());
  }

  const llm = new Map<string, { gloss: string; exampleHint?: string }>();
  if (existsSync(GLOSSES_CACHE_PATH)) {
    const raw = JSON.parse(readFileSync(GLOSSES_CACHE_PATH, 'utf8')) as {
      byLemmaPos?: Record<string, { lemma?: string; pos?: string; gloss?: string; exampleHint?: string }>;
    };
    for (const [k, v] of Object.entries(raw.byLemmaPos || {})) {
      if (!v || !v.gloss) continue;
      llm.set(k, { gloss: String(v.gloss).trim(), exampleHint: v.exampleHint ? String(v.exampleHint).trim() : undefined });
    }
  }

  return { sample, llm };
}

async function main(): Promise<void> {
  const lexiqueEntries = parseLexique3(loadRequired(LEXIQUE_PATH, 'Lexique'));
  const top = selectTopByFreqfilms2(lexiqueEntries, 2000);

  const tatoebaPairs = parseTatoebaPairs({
    fraSentencesTsv: loadRequired(FRA_PATH, 'Tatoeba French dump'),
    engSentencesTsv: loadRequired(ENG_PATH, 'Tatoeba English dump'),
    linksCsv: loadRequired(LINKS_PATH, 'Tatoeba links'),
  });
  const pairIndex = indexPairsByLemma(tatoebaPairs);

  const { sample, llm } = loadGlossCaches();
  let withExamples = 0;
  let sampleGlossCount = 0;
  let llmGlossCount = 0;
  let fallbackHintCount = 0;
  const cefrDist: Record<string, number> = { A1: 0, A2: 0, B1: 0 };

  const cards = top.map((entry, idx) => {
    const rank = idx + 1;
    const key = `${entry.lemme}::${entry.cgram}`;
    const sampleGloss = sample.get(entry.lemme);
    const cached = llm.get(key);
    const gloss = sampleGloss || cached?.gloss || '[missing gloss]';

    if (sampleGloss) sampleGlossCount += 1;
    else if (cached?.gloss) llmGlossCount += 1;

    let pair = (pairIndex.get(entry.lemme.toLowerCase()) || [])[0];
    if (pair) withExamples += 1;
    else if (cached?.exampleHint) {
      fallbackHintCount += 1;
      pair = { fraId: -1, engId: -1, fra: cached.exampleHint, eng: '' };
    }

    const card = buildCardJson({ lemma: entry, gloss, pair, rank });
    const band = rank <= 500 ? 'A1' : rank <= 1500 ? 'A2' : 'B1';
    cefrDist[band] += 1;
    return card;
  });

  mkdirSync(resolve(ROOT, 'data'), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(cards, null, 2));

  const exampleCoverage = Number(((withExamples / cards.length) * 100).toFixed(2));
  console.log(`[build-french-core-2000] cards=${cards.length}`);
  console.log(`[build-french-core-2000] examples=${withExamples}/${cards.length} (${exampleCoverage}%)`);
  console.log(`[build-french-core-2000] glosses sample=${sampleGlossCount} llm=${llmGlossCount}`);
  console.log(`[build-french-core-2000] exampleFallbackHints=${fallbackHintCount}`);
  console.log(`[build-french-core-2000] cefr=${JSON.stringify(cefrDist)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

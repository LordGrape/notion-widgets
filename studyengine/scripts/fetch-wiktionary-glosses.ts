/**
 * L1b-β: build deterministic English glosses for French Core 2000 from
 * Kaikki's pre-parsed English Wiktionary wiktextract JSONL.
 *
 * Run: `npm run build:french-wiktionary-glosses`
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseLexique3, selectTopByFreqfilms2 } from '../src/decks/french-core-2000/pipeline';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const LEXIQUE_PATH = resolve(ROOT, 'data', 'lexique3', 'Lexique383.tsv');
const OUT_PATH = resolve(ROOT, 'data', 'french-core-glosses-wiktionary.json');
const TMP_PATH = `${OUT_PATH}.tmp`;

const WIKTIONARY_URL =
  process.env.WIKTIONARY_FRENCH_URL || 'https://kaikki.org/dictionary/French/kaikki.org-dictionary-French.jsonl';
const WIKTIONARY_SHA256 = process.env.WIKTIONARY_FRENCH_SHA256 || '';
const FORCE = process.argv.includes('--force');

type WiktionarySense = {
  glosses?: unknown;
};

type WiktionaryEntry = {
  word?: unknown;
  pos?: unknown;
  senses?: unknown;
};

type LexiqueRow = {
  lemme: string;
  cgram: string;
};

type GlossRecord = {
  gloss: string;
  source: 'wiktionary';
};

function keyFor(lemma: string, pos: string): string {
  return `${lemma}::${pos}`;
}

function compatibleWiktionaryPos(cgram: string): Set<string> {
  if (cgram.startsWith('NOM')) return new Set(['noun', 'proper-noun']);
  if (cgram.startsWith('VER')) return new Set(['verb']);
  if (cgram.startsWith('ADJ')) return new Set(['adj', 'num']);
  if (cgram.startsWith('ADV')) return new Set(['adv']);
  if (cgram.startsWith('DET')) return new Set(['det', 'article']);
  if (cgram.startsWith('PRO')) return new Set(['pron']);
  if (cgram.startsWith('PRP')) return new Set(['prep']);
  if (cgram.startsWith('CON')) return new Set(['conj']);
  if (cgram.startsWith('INT')) return new Set(['interj']);
  return new Set<string>();
}

function loadLexiqueTop2000(): LexiqueRow[] {
  if (!existsSync(LEXIQUE_PATH)) {
    throw new Error(`Lexique not found at ${LEXIQUE_PATH}. Run npm run fetch:lexique3 first.`);
  }
  return selectTopByFreqfilms2(parseLexique3(readFileSync(LEXIQUE_PATH, 'utf8')), 2000);
}

function firstGloss(entry: WiktionaryEntry): string {
  if (!Array.isArray(entry.senses)) return '';
  for (const sense of entry.senses as WiktionarySense[]) {
    if (!Array.isArray(sense.glosses)) continue;
    const gloss = sense.glosses.find((item): item is string => typeof item === 'string' && item.trim().length > 0);
    if (gloss) return gloss.trim().replace(/\s+/g, ' ').slice(0, 120);
  }
  return '';
}

function parseEntry(line: string): WiktionaryEntry | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as WiktionaryEntry;
  } catch {
    return null;
  }
}

async function streamWiktionary(
  targetsByLemma: Map<string, LexiqueRow[]>,
): Promise<{ hash: string; glosses: Record<string, GlossRecord> }> {
  const res = await fetch(WIKTIONARY_URL);
  if (!res.ok || !res.body) {
    throw new Error(`[fetch-wiktionary-glosses] HTTP ${res.status} ${res.statusText}`);
  }

  const hash = createHash('sha256');
  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  const glosses: Record<string, GlossRecord> = {};
  let buffer = '';

  const handleLine = (line: string): void => {
    if (!line.trim()) return;
    const entry = parseEntry(line);
    const word = typeof entry?.word === 'string' ? entry.word.trim() : '';
    const wikPos = typeof entry?.pos === 'string' ? entry.pos.trim() : '';
    if (!word || !wikPos) return;
    const candidates = targetsByLemma.get(word);
    if (!candidates) return;
    const gloss = firstGloss(entry);
    if (!gloss) return;
    for (const row of candidates) {
      const key = keyFor(row.lemme, row.cgram);
      if (glosses[key]) continue;
      const compatible = compatibleWiktionaryPos(row.cgram);
      if (compatible.size > 0 && !compatible.has(wikPos)) continue;
      glosses[key] = { gloss, source: 'wiktionary' };
    }
  };

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    hash.update(Buffer.from(chunk.value));
    buffer += decoder.decode(chunk.value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      handleLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  }
  buffer += decoder.decode();
  handleLine(buffer);
  return { hash: hash.digest('hex'), glosses };
}

async function main(): Promise<void> {
  if (existsSync(OUT_PATH) && !FORCE) {
    console.log(`[fetch-wiktionary-glosses] up to date: ${OUT_PATH}`);
    return;
  }

  const top = loadLexiqueTop2000();
  const targetsByLemma = new Map<string, LexiqueRow[]>();
  for (const row of top) {
    const rows = targetsByLemma.get(row.lemme) || [];
    rows.push(row);
    targetsByLemma.set(row.lemme, rows);
  }

  console.log(`[fetch-wiktionary-glosses] streaming ${WIKTIONARY_URL}`);
  const { hash, glosses } = await streamWiktionary(targetsByLemma);
  console.log(`[fetch-wiktionary-glosses] sha256=${hash}`);
  if (WIKTIONARY_SHA256 && hash !== WIKTIONARY_SHA256) {
    throw new Error(`[fetch-wiktionary-glosses] SHA256 mismatch.\n  expected: ${WIKTIONARY_SHA256}\n  actual:   ${hash}`);
  }
  if (!WIKTIONARY_SHA256) {
    console.log('[fetch-wiktionary-glosses] no WIKTIONARY_FRENCH_SHA256 pinned; set it after the first trusted run.');
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(TMP_PATH, `${JSON.stringify(glosses, null, 2)}\n`);
  renameSync(TMP_PATH, OUT_PATH);
  console.log(`[fetch-wiktionary-glosses] wrote ${Object.keys(glosses).length}/${top.length} glosses to ${OUT_PATH}`);
}

main().catch((err) => {
  try {
    if (existsSync(TMP_PATH)) unlinkSync(TMP_PATH);
  } catch {
    // Best effort cleanup after a failed crash-safe write.
  }
  console.error(err);
  process.exit(1);
});

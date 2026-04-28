/**
 * Phase L1a — French Core 2000 ingest pipeline.
 *
 * Pure, deterministic, build-time only. Exported functions are unit-tested
 * in `pipeline.test.ts` against synthetic fixtures under `__fixtures__/`.
 * Not imported by the runtime bundle.
 *
 * See `./types.ts` for the locked-decision rationale and the contract that
 * `CardJson` must satisfy for the existing studyengine.html import path.
 */

import type {
  BuildCardInput,
  CardJson,
  CefrBand,
  Lexique3Entry,
  ParseTatoebaInput,
  TatoebaPair,
} from './types';
import { sampaToIpa } from './sampa-to-ipa';

/* ────────────────────────────────────────────────────────────────────────── */
/* Lexique 3 parsing                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Lexique 3.83 column names we depend on. The full TSV has ~30 columns; we
 * locate these by header name so the parser is resilient to upstream column
 * reorderings (the read-pass calibration clause flagged this as a known risk).
 */
const REQUIRED_COLUMNS = [
  'ortho',
  'phon',
  'lemme',
  'cgram',
  'genre',
  'nombre',
  'freqlemfilms2',
  'freqfilms2',
] as const;

type RequiredColumn = (typeof REQUIRED_COLUMNS)[number];

function parseFloatSafe(value: string): number {
  // Lexique 3 uses `.` as the decimal separator in modern releases; some
  // legacy mirrors use `,`. Accept both.
  const normalised = value.replace(',', '.').trim();
  const num = Number(normalised);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Parse a Lexique 3 TSV dump into typed entries.
 *
 * Behaviour:
 * - Treats the first non-empty line as the header row.
 * - Resolves required columns by name; throws if any required column is
 *   missing (we'd rather fail loudly than silently emit zero-frequency rows).
 * - Skips data rows whose `lemme` column is empty / whitespace.
 * - Empty input → `[]`.
 */
export function parseLexique3(tsvText: string): Lexique3Entry[] {
  if (!tsvText || !tsvText.trim()) return [];

  const lines = tsvText.split(/\r?\n/);
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim()) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const header = lines[headerIdx].split('\t').map((h) => h.trim());
  const colIdx: Record<RequiredColumn, number> = {} as Record<RequiredColumn, number>;
  for (const col of REQUIRED_COLUMNS) {
    const idx = header.indexOf(col);
    if (idx < 0) {
      throw new Error(`Lexique 3 parse: required column "${col}" not found in header`);
    }
    colIdx[col] = idx;
  }

  const out: Lexique3Entry[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cols = line.split('\t');
    const lemme = (cols[colIdx.lemme] || '').trim();
    if (!lemme) continue;
    out.push({
      ortho: (cols[colIdx.ortho] || '').trim(),
      phon: (cols[colIdx.phon] || '').trim(),
      lemme,
      cgram: (cols[colIdx.cgram] || '').trim(),
      genre: (cols[colIdx.genre] || '').trim(),
      nombre: (cols[colIdx.nombre] || '').trim(),
      freqlemfilms2: parseFloatSafe(cols[colIdx.freqlemfilms2] || '0'),
      freqfilms2: parseFloatSafe(cols[colIdx.freqfilms2] || '0'),
    });
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Top-N lemma selection                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Reduce all rows for the same lemma to a single representative entry,
 * preferring the row whose surface form equals the lemma (the canonical
 * dictionary form). Falls back to whichever row Lexique 3 emitted first.
 */
function pickCanonicalRow(rows: Lexique3Entry[]): Lexique3Entry {
  const exact = rows.find((r) => r.ortho === r.lemme);
  return exact ?? rows[0];
}

/**
 * Group entries by lemma, sort groups descending by `freqlemfilms2` (which is
 * already lemma-aggregated upstream — every row sharing a lemma has the same
 * value), and return the top `n` representative rows.
 *
 * Tie-breaking: alphabetical by lemma (Unicode code-point order). This keeps
 * sample output deterministic across runs and platforms.
 *
 * Function name retains the historical "freqfilms2" suffix to preserve the
 * external API agreed in the L1a plan; the implementation correctly uses the
 * lemma-aggregated `freqlemfilms2` per the read-pass diagnosis.
 */
export function selectTopByFreqfilms2(
  entries: Lexique3Entry[],
  n: number,
): Lexique3Entry[] {
  if (n <= 0 || entries.length === 0) return [];

  const groups = new Map<string, Lexique3Entry[]>();
  for (const entry of entries) {
    const bucket = groups.get(entry.lemme);
    if (bucket) bucket.push(entry);
    else groups.set(entry.lemme, [entry]);
  }

  const reps: Lexique3Entry[] = [];
  for (const rows of groups.values()) {
    reps.push(pickCanonicalRow(rows));
  }

  reps.sort((a, b) => {
    if (b.freqlemfilms2 !== a.freqlemfilms2) return b.freqlemfilms2 - a.freqlemfilms2;
    return a.lemme.localeCompare(b.lemme, 'fr');
  });

  return reps.slice(0, n);
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Tatoeba pair parsing                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

interface SentenceMap {
  [id: number]: string;
}

function parseSentenceTsv(tsv: string, expectedLang: string): SentenceMap {
  const out: SentenceMap = {};
  if (!tsv) return out;
  const lines = tsv.split(/\r?\n/);
  for (const line of lines) {
    if (!line || !line.trim()) continue;
    const cols = line.split('\t');
    if (cols.length < 3) continue;
    const id = Number(cols[0]);
    const lang = cols[1].trim();
    const text = cols[2];
    if (!Number.isFinite(id) || lang !== expectedLang || !text) continue;
    out[id] = text;
  }
  return out;
}

const DEFAULT_MAX_FRA_LENGTH = 80;

/**
 * Join Tatoeba French and English sentence dumps via `links.csv` into typed
 * pairs. Filters:
 *
 * - Both sides must exist and be non-empty.
 * - French side length must be ≤ `maxFraLength` (default 80 chars).
 *
 * The `links.csv` format is `sentence_id,translation_id` (one direction per
 * row, with both directions emitted by Tatoeba). We deduplicate by the
 * unordered (fraId, engId) pair so each pair appears once.
 */
export function parseTatoebaPairs(input: ParseTatoebaInput): TatoebaPair[] {
  const maxLen = input.maxFraLength ?? DEFAULT_MAX_FRA_LENGTH;
  const fra = parseSentenceTsv(input.fraSentencesTsv, 'fra');
  const eng = parseSentenceTsv(input.engSentencesTsv, 'eng');

  if (!input.linksCsv) return [];
  const lines = input.linksCsv.split(/\r?\n/);
  const seen = new Set<string>();
  const out: TatoebaPair[] = [];
  for (const line of lines) {
    if (!line || !line.trim()) continue;
    const cols = line.split(',');
    if (cols.length < 2) continue;
    const a = Number(cols[0]);
    const b = Number(cols[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;

    let fraId = -1;
    let engId = -1;
    if (fra[a] != null && eng[b] != null) {
      fraId = a;
      engId = b;
    } else if (fra[b] != null && eng[a] != null) {
      fraId = b;
      engId = a;
    } else {
      continue;
    }

    const key = `${fraId}-${engId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const fraText = fra[fraId];
    const engText = eng[engId];
    if (!fraText || !engText) continue;
    if (fraText.length > maxLen) continue;

    out.push({ fraId, fra: fraText, engId, eng: engText });
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Lemma → pair indexing                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

const FRENCH_TOKEN_RE = /[\p{L}'’-]+/gu;

function tokenizeFrench(text: string): string[] {
  // `Intl.Segmenter` would give us better word-boundary handling for
  // contractions like `l'homme`, but L1a's calling sites only need a coarse
  // lowercase-token bag for surface-form matching against lemmas. Top-50
  // French lemmas are mostly closed-class (de, la, le, et, être, …) whose
  // surface form already appears in sentences.
  const matches = text.match(FRENCH_TOKEN_RE) || [];
  return matches.map((tok) => tok.toLowerCase());
}

/**
 * Bucket Tatoeba pairs by every distinct token that appears in the French
 * sentence. A pair appears under each unique lowercase token exactly once.
 *
 * This is intentionally a surface-form match, NOT a lemmatised match — real
 * lemmatisation requires a French lemmatiser (lefff, spacy-fr, …) which is
 * out of scope for L1a. The top-50 lemmas this is used against are mostly
 * function words and copulas whose surface form is the lemma itself.
 *
 * L1b: replace with proper lemmatisation so we get example coverage on
 * verb forms like `vais` → `aller`.
 */
export function indexPairsByLemma(pairs: TatoebaPair[]): Map<string, TatoebaPair[]> {
  const out = new Map<string, TatoebaPair[]>();
  for (const pair of pairs) {
    const seen = new Set<string>();
    for (const token of tokenizeFrench(pair.fra)) {
      if (seen.has(token)) continue;
      seen.add(token);
      const bucket = out.get(token);
      if (bucket) bucket.push(pair);
      else out.set(token, [pair]);
    }
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Card assembly                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

function genderLabel(genre: string, cgram: string): string {
  // Lexique 3 emits genre only for nouns/adjectives. Verbs / adverbs / etc.
  // get an empty string. We surface a short label only for nouns where it
  // disambiguates (le/la), and only when present.
  if (!cgram.startsWith('NOM')) return '';
  if (genre === 'm') return '**masc.**';
  if (genre === 'f') return '**fem.**';
  return '';
}

function escapeMarkdownLine(text: string): string {
  // Defensive: strip newlines so a stray multi-line example can't break the
  // blockquote rendering. Tatoeba sentences are single-line by construction.
  return text.replace(/\r?\n/g, ' ').trim();
}

/**
 * Assemble one card matching the existing studyengine.html `commitImport`
 * contract. See `CardJson` JSDoc for the rationale on omitted `fsrs` and the
 * markdown packing of gender / IPA / example.
 *
 * L1a: `audioUrl` is always null (no audio integration, no card-chrome slot).
 * The parameter is wired through so L1b can attach Forvo / GCloud-TTS URLs
 * without changing this signature.
 */
export function buildCardJson(input: BuildCardInput): CardJson {
  const { lemma, gloss, pair } = input;
  const gender = genderLabel(lemma.genre, lemma.cgram);
  // L1b-alpha: convert Lexique SAMPA transcription into IPA for card output.
  const ipa = lemma.phon ? `\`/${sampaToIpa(lemma.phon)}/\`` : '';
  const rank = Math.max(1, Math.floor(input.rank ?? 1));
  const cefrBand: CefrBand = rank <= 500 ? 'A1' : rank <= 1500 ? 'A2' : 'B1';

  const headerParts = [gender, ipa].filter(Boolean);
  const header = headerParts.join(' · ');

  const blocks: string[] = [];
  if (header) blocks.push(header);
  blocks.push(`*${gloss.trim()}*`);
  if (pair) {
    const fraLine = escapeMarkdownLine(pair.fra);
    const engLine = escapeMarkdownLine(pair.eng);
    blocks.push(`> ${fraLine}\n> *${engLine}*`);
  }

  // L1a: audioUrl deliberately ignored — no audio slot in card chrome today.
  // L1b reactivates this branch.

  return {
    prompt: lemma.lemme,
    modelAnswer: blocks.join('\n\n'),
    course: 'French',
    subDeck: 'Core 2000',
    topic: cefrBand,
    tier: 'quickfire',
    targetLanguage: 'fr-CA',
    languageLevel: 1,
    planProfile: 'language',
    tags: [`cefr:${cefrBand}`, 'french-core-2000', 'l1b-alpha'],
  };
}

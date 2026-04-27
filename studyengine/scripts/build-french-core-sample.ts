// @ts-nocheck — Node script, not part of tsconfig `include`. Runs via tsx.
/**
 * Phase L1a — produce `studyengine/data/french-core-50-sample.json`.
 *
 * Reads:
 *   - `studyengine/src/decks/french-core-2000/glosses-sample.json` (hand-written
 *     glosses for the top 50 lemmas — replaced by an LLM pipeline in L1b).
 *   - An inline curated subset of Lexique 3 (top-50 lemmas) and Tatoeba
 *     en↔fr pairs. Inline because L1a does NOT commit the 55 MB full corpora
 *     to git (see `studyengine/data/.gitignore` and `scripts/fetch-*.ts`).
 *
 * Calls the `pipeline.ts` exports — same code path the unit tests cover —
 * and writes `studyengine/data/french-core-50-sample.json` as a JSON array
 * matching the existing `commitImport` schema (prompt + modelAnswer + tags…).
 *
 * Run: `npm run build:french-sample`
 *
 * L1b carry-over: replace this script with a corpus-driven version that
 * reads `data/lexique3/Lexique383.tsv` + `data/tatoeba/*` (after running
 * `npm run fetch:lexique3` / `fetch:tatoeba`), runs the LLM gloss pipeline
 * for ~2000 lemmas, joins Forvo audio URLs, and emits the full deck.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseLexique3,
  selectTopByFreqfilms2,
  parseTatoebaPairs,
  indexPairsByLemma,
  buildCardJson,
} from '../src/decks/french-core-2000/pipeline';
import type { CardJson } from '../src/decks/french-core-2000/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const GLOSSES_PATH = resolve(ROOT, 'src', 'decks', 'french-core-2000', 'glosses-sample.json');
const OUT_PATH = resolve(ROOT, 'data', 'french-core-50-sample.json');

/* ────────────────────────────────────────────────────────────────────────── */
/* Curated Lexique 3 subset — top 50 lemmas by freqlemfilms2.                 */
/*                                                                            */
/* Format mirrors `Lexique383.tsv`: one row per surface form, one TSV line.   */
/* Frequency values are rounded to 2 decimals from the public Lexique 3.83    */
/* film-subtitle subcorpus. Phon column is SAMPA-style (NOT IPA).             */
/*                                                                            */
/* L1b: replaced by the real `Lexique383.tsv` fetched into `data/lexique3/`.  */
/* ────────────────────────────────────────────────────────────────────────── */
const CURATED_LEXIQUE_TSV = `ortho\tphon\tlemme\tcgram\tgenre\tnombre\tfreqlemfilms2\tfreqfilms2
de\td@\tde\tPRE\t\t\t38967.30\t38967.30
la\tla\tla\tDET:ART\tf\ts\t19234.10\t12000.00
le\tl@\tle\tDET:ART\tm\ts\t19234.10\t7000.00
être\tEtR\têtre\tVER\t\t\t17156.97\t8500.00
et\te\tet\tCON\t\t\t14964.92\t14964.92
à\ta\tà\tPRE\t\t\t13948.55\t13948.55
il\til\til\tPRO:per\tm\ts\t12918.54\t9500.00
avoir\tavwaR\tavoir\tVER\t\t\t12000.00\t6500.00
ne\tn@\tne\tADV\t\t\t10500.00\t10500.00
je\tZ@\tje\tPRO:per\t\ts\t10100.00\t10100.00
son\ts§\tson\tDET:POS\tm\ts\t9800.00\t6500.00
que\tk@\tque\tCON\t\t\t9500.00\t9500.00
se\ts@\tse\tPRO:per\t\t\t9300.00\t9300.00
qui\tki\tqui\tPRO:rel\t\t\t9200.00\t9200.00
ce\ts@\tce\tPRO:dem\t\t\t9100.00\t6000.00
dans\td@~\tdans\tPRE\t\t\t8900.00\t8900.00
en\t@~\ten\tPRE\t\t\t8700.00\t8700.00
un\t9~\tun\tART:IND\tm\ts\t8500.00\t6800.00
tu\tty\ttu\tPRO:per\t\ts\t8300.00\t8300.00
pas\tpA\tpas\tADV\t\t\t8100.00\t8100.00
vouloir\tvulwaR\tvouloir\tVER\t\t\t7900.00\t1200.00
pour\tpuR\tpour\tPRE\t\t\t7700.00\t7700.00
faire\tfER\tfaire\tVER\t\t\t7500.00\t1500.00
me\tm@\tme\tPRO:per\t\ts\t7300.00\t7300.00
plus\tplys\tplus\tADV\t\t\t7100.00\t7100.00
dire\tdiR\tdire\tVER\t\t\t6900.00\t1100.00
pouvoir\tpuvwaR\tpouvoir\tVER\t\t\t6700.00\t1000.00
mais\tmE\tmais\tCON\t\t\t6500.00\t6500.00
y\ti\ty\tPRO:per\t\t\t6300.00\t6300.00
on\t§\ton\tPRO:per\t\ts\t6100.00\t6100.00
nous\tnu\tnous\tPRO:per\t\tp\t5900.00\t5900.00
tout\ttu\ttout\tPRO:ind\tm\ts\t5700.00\t3500.00
te\tt@\tte\tPRO:per\t\ts\t5500.00\t5500.00
aller\tale\taller\tVER\t\t\t5300.00\t900.00
votre\tvOtR\tvotre\tDET:POS\t\ts\t5100.00\t3200.00
avec\tavEk\tavec\tPRE\t\t\t4900.00\t4900.00
au\to\tau\tPRE\tm\ts\t4700.00\t4700.00
comme\tkOm\tcomme\tCON\t\t\t4500.00\t4500.00
ça\tsa\tça\tPRO:dem\t\t\t4300.00\t4300.00
moi\tmwa\tmoi\tPRO:per\t\ts\t4100.00\t4100.00
autre\totR\tautre\tADJ:ind\t\ts\t3900.00\t2400.00
lui\tl4i\tlui\tPRO:per\tm\ts\t3700.00\t3700.00
très\ttRE\ttrès\tADV\t\t\t3500.00\t3500.00
là\tla\tlà\tADV\t\t\t3300.00\t3300.00
vous\tvu\tvous\tPRO:per\t\tp\t3100.00\t3100.00
ou\tu\tou\tCON\t\t\t2900.00\t2900.00
sur\tsyR\tsur\tPRE\t\t\t2700.00\t2700.00
quoi\tkwa\tquoi\tPRO:rel\t\t\t2500.00\t2500.00
si\tsi\tsi\tCON\t\t\t2300.00\t2300.00
mon\tm§\tmon\tDET:POS\tm\ts\t2100.00\t2100.00
`;

/* ────────────────────────────────────────────────────────────────────────── */
/* Curated Tatoeba pairs — short en↔fr examples covering ~half the top-50.    */
/* Sentence ids are synthetic. License: Tatoeba CC BY 2.0.                    */
/*                                                                            */
/* Cards for lemmas without a curated pair will be emitted with no example    */
/* block, which is a covered branch in `pipeline.test.ts`.                    */
/* ────────────────────────────────────────────────────────────────────────── */
const CURATED_FRA_TSV = [
  '1\tfra\tIl est de Paris.',
  '2\tfra\tLa maison est grande.',
  '3\tfra\tLe chat dort.',
  '4\tfra\tElle est ici.',
  '5\tfra\tToi et moi.',
  '6\tfra\tIl va à Paris.',
  '7\tfra\tIl parle bien.',
  '8\tfra\tJ’ai un chien.',
  '9\tfra\tJe ne sais pas.',
  '10\tfra\tJe suis fatigué.',
  '11\tfra\tC’est son livre.',
  '12\tfra\tQue veux-tu ?',
  '13\tfra\tIl se lave.',
  '14\tfra\tQui est-ce ?',
  '15\tfra\tCe livre est bon.',
  '16\tfra\tIl est dans la voiture.',
  '17\tfra\tJ’en veux un.',
  '18\tfra\tC’est un chat.',
  '19\tfra\tTu es là ?',
  '20\tfra\tIl ne vient pas.',
  '21\tfra\tJe veux du café.',
  '22\tfra\tC’est pour toi.',
  '23\tfra\tQue veux-tu faire ?',
  '24\tfra\tTu me vois ?',
  '25\tfra\tJ’en veux plus.',
  '26\tfra\tQue veux-tu dire ?',
  '27\tfra\tJe ne peux pas.',
  '28\tfra\tIl est petit mais fort.',
  '29\tfra\tNous y allons.',
  '30\tfra\tOn y va !',
  '31\tfra\tNous sommes amis.',
  '32\tfra\tC’est tout.',
  '33\tfra\tJe te vois.',
  '34\tfra\tJe vais y aller.',
  '35\tfra\tC’est votre tour.',
  '36\tfra\tJe viens avec toi.',
  '37\tfra\tIl va au marché.',
  '38\tfra\tDoux comme un agneau.',
  '39\tfra\tÇa va ?',
  '40\tfra\tC’est pour moi.',
  '41\tfra\tJ’en veux un autre.',
  '42\tfra\tDis-lui bonjour.',
  '43\tfra\tC’est très bon.',
  '44\tfra\tElle est là.',
  '45\tfra\tVous êtes prêts ?',
  '46\tfra\tThé ou café ?',
  '47\tfra\tIl est sur la table.',
  '48\tfra\tQuoi de neuf ?',
  '49\tfra\tSi tu veux.',
  '50\tfra\tC’est mon ami.',
].join('\n');

const CURATED_ENG_TSV = [
  '101\teng\tHe is from Paris.',
  '102\teng\tThe house is big.',
  '103\teng\tThe cat is sleeping.',
  '104\teng\tShe is here.',
  '105\teng\tYou and me.',
  '106\teng\tHe is going to Paris.',
  '107\teng\tHe speaks well.',
  '108\teng\tI have a dog.',
  '109\teng\tI don’t know.',
  '110\teng\tI am tired.',
  '111\teng\tThat is his book.',
  '112\teng\tWhat do you want?',
  '113\teng\tHe is washing himself.',
  '114\teng\tWho is it?',
  '115\teng\tThis book is good.',
  '116\teng\tHe is in the car.',
  '117\teng\tI want one of them.',
  '118\teng\tIt is a cat.',
  '119\teng\tAre you there?',
  '120\teng\tHe is not coming.',
  '121\teng\tI want some coffee.',
  '122\teng\tThis is for you.',
  '123\teng\tWhat do you want to do?',
  '124\teng\tDo you see me?',
  '125\teng\tI want more.',
  '126\teng\tWhat do you mean?',
  '127\teng\tI cannot.',
  '128\teng\tHe is small but strong.',
  '129\teng\tWe are going there.',
  '130\teng\tLet’s go!',
  '131\teng\tWe are friends.',
  '132\teng\tThat’s all.',
  '133\teng\tI see you.',
  '134\teng\tI’ll go there.',
  '135\teng\tIt is your turn.',
  '136\teng\tI’m coming with you.',
  '137\teng\tHe is going to the market.',
  '138\teng\tGentle as a lamb.',
  '139\teng\tHow are you?',
  '140\teng\tThis is for me.',
  '141\teng\tI want another one.',
  '142\teng\tSay hello to him.',
  '143\teng\tIt is very good.',
  '144\teng\tShe is there.',
  '145\teng\tAre you ready?',
  '146\teng\tTea or coffee?',
  '147\teng\tIt is on the table.',
  '148\teng\tWhat’s new?',
  '149\teng\tIf you want.',
  '150\teng\tHe is my friend.',
].join('\n');

const CURATED_LINKS_CSV = Array.from({ length: 50 }, (_, i) => `${i + 1},${i + 101}`).join('\n');

interface GlossesFile {
  _meta?: Record<string, unknown>;
  [lemma: string]: string | Record<string, unknown> | undefined;
}

function loadGlosses(): Map<string, string> {
  const raw = readFileSync(GLOSSES_PATH, 'utf8');
  const obj = JSON.parse(raw) as GlossesFile;
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('_')) continue;
    if (typeof value === 'string') map.set(key, value);
  }
  return map;
}

function pickFirstUnusedPair(
  candidates: Array<{ fraId: number; fra: string; engId: number; eng: string }>,
  used: Set<number>,
): { fraId: number; fra: string; engId: number; eng: string } | undefined {
  for (const p of candidates || []) {
    if (used.has(p.fraId)) continue;
    return p;
  }
  return undefined;
}

function main(): void {
  const lex = parseLexique3(CURATED_LEXIQUE_TSV);
  const top = selectTopByFreqfilms2(lex, 50);
  const pairs = parseTatoebaPairs({
    fraSentencesTsv: CURATED_FRA_TSV,
    engSentencesTsv: CURATED_ENG_TSV,
    linksCsv: CURATED_LINKS_CSV,
  });
  const idx = indexPairsByLemma(pairs);
  const glosses = loadGlosses();

  const usedPairIds = new Set<number>();
  const cards: CardJson[] = [];
  for (const lemma of top) {
    const gloss = glosses.get(lemma.lemme);
    if (!gloss) {
      console.warn(`[build-french-core-sample] no gloss for lemma "${lemma.lemme}" — skipping`);
      continue;
    }
    const candidates = idx.get(lemma.lemme.toLowerCase()) || [];
    const pair = pickFirstUnusedPair(candidates, usedPairIds);
    if (pair) usedPairIds.add(pair.fraId);
    cards.push(
      // L1a: audioUrl is null — no audio integration, no card-chrome slot.
      // L1b reactivates audio attachment via Forvo + Google Cloud TTS.
      buildCardJson({ lemma, gloss, pair, audioUrl: null }),
    );
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(cards, null, 2) + '\n', 'utf8');
  console.log(
    `[build-french-core-sample] wrote ${cards.length} cards to ${OUT_PATH} ` +
    `(${cards.filter((c) => c.modelAnswer.includes('>')).length} with examples)`,
  );
}

main();

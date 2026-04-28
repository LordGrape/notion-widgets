// @ts-nocheck
// L1b-alpha: build/refresh gloss cache for French Core 2000 via Worker endpoint.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseLexique3, selectTopByFreqfilms2 } from '../src/decks/french-core-2000/pipeline';
import { sampaToIpa } from '../src/decks/french-core-2000/sampa-to-ipa';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const LEXIQUE_PATH = resolve(ROOT, 'data', 'lexique3', 'Lexique383.tsv');
const SAMPLE_GLOSSES_PATH = resolve(ROOT, 'src', 'decks', 'french-core-2000', 'glosses-sample.json');
const CACHE_PATH = resolve(ROOT, 'data', 'french-core-glosses.json');
const BATCH_SIZE = Number(process.env.BATCH_SIZE || '30');

type GlossRecord = { lemma: string; pos: string; gloss: string; exampleHint?: string; source: 'sample' | 'llm' };

type GlossCacheFile = {
  _meta?: Record<string, unknown>;
  byLemmaPos: Record<string, GlossRecord>;
};

function keyFor(lemma: string, pos: string): string {
  return `${lemma}::${pos}`;
}

function loadLexiqueTop2000() {
  if (!existsSync(LEXIQUE_PATH)) {
    throw new Error(`Lexique not found at ${LEXIQUE_PATH}. Run npm run fetch:lexique3 first.`);
  }
  const tsv = readFileSync(LEXIQUE_PATH, 'utf8');
  return selectTopByFreqfilms2(parseLexique3(tsv), 2000);
}

function loadSampleGlosses(): Record<string, string> {
  const raw = JSON.parse(readFileSync(SAMPLE_GLOSSES_PATH, 'utf8')) as Record<string, string>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('_')) continue;
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return out;
}

function loadCache(): GlossCacheFile {
  if (!existsSync(CACHE_PATH)) return { byLemmaPos: {} };
  const raw = JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as GlossCacheFile;
  return { ...raw, byLemmaPos: raw.byLemmaPos || {} };
}

async function main(): Promise<void> {
  const workerUrl = String(process.env.WORKER_URL || '').trim();
  const widgetSecret = String(process.env.WIDGET_SECRET || '').trim();
  if (!workerUrl || !widgetSecret) {
    throw new Error('WORKER_URL and WIDGET_SECRET env vars are required.');
  }

  const started = Date.now();
  const top = loadLexiqueTop2000();
  const sample = loadSampleGlosses();
  const cache = loadCache();

  for (const lemma of top) {
    const key = keyFor(lemma.lemme, lemma.cgram);
    if (!cache.byLemmaPos[key] && sample[lemma.lemme]) {
      cache.byLemmaPos[key] = {
        lemma: lemma.lemme,
        pos: lemma.cgram,
        gloss: sample[lemma.lemme],
        source: 'sample',
      };
    }
  }

  const missing = top.filter((lemma) => !cache.byLemmaPos[keyFor(lemma.lemme, lemma.cgram)]);
  let totalUsage = 0;

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    const lemmas = batch.map((entry) => ({
      lemma: entry.lemme,
      pos: entry.cgram,
      gender: entry.genre || undefined,
      ipa: sampaToIpa(entry.phon || ''),
    }));

    const res = await fetch(`${workerUrl.replace(/\/$/, '')}/studyengine/gloss`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Widget-Key': widgetSecret,
      },
      body: JSON.stringify({ lemmas }),
    });

    if (!res.ok) {
      throw new Error(`Batch ${i / BATCH_SIZE + 1} failed: HTTP ${res.status} ${await res.text()}`);
    }

    const payload = (await res.json()) as {
      glosses?: Array<{ lemma?: string; gloss?: string; exampleHint?: string; pos?: string }>;
      usage?: { totalTokens?: number };
    };

    if (payload.usage?.totalTokens) totalUsage += payload.usage.totalTokens;

    for (const row of payload.glosses || []) {
      const lemma = String(row.lemma || '').trim();
      const gloss = String(row.gloss || '').trim();
      if (!lemma || !gloss) continue;
      const matched = batch.find((x) => x.lemme === lemma && (!row.pos || x.cgram === row.pos));
      if (!matched) continue;
      const key = keyFor(matched.lemme, matched.cgram);
      if (cache.byLemmaPos[key]?.source === 'sample') continue;
      cache.byLemmaPos[key] = {
        lemma: matched.lemme,
        pos: matched.cgram,
        gloss,
        exampleHint: row.exampleHint ? String(row.exampleHint).trim() : undefined,
        source: 'llm',
      };
    }

    mkdirSync(resolve(ROOT, 'data'), { recursive: true });
    writeFileSync(
      CACHE_PATH,
      JSON.stringify(
        {
          _meta: {
            phase: 'L1b-alpha',
            updatedAt: new Date().toISOString(),
            batchSize: BATCH_SIZE,
          },
          byLemmaPos: cache.byLemmaPos,
        },
        null,
        2,
      ),
    );

    console.log(`[build-french-core-glosses] batch ${Math.floor(i / BATCH_SIZE) + 1} saved`);
  }

  const elapsedMs = Date.now() - started;
  console.log(
    `[build-french-core-glosses] total=${top.length} cached=${Object.keys(cache.byLemmaPos).length} missing=${missing.length} usageTokens=${totalUsage} elapsedMs=${elapsedMs}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// @ts-nocheck — Node script, not part of tsconfig `include`. Runs via tsx.
/**
 * L1a / L1b: download Tatoeba en/fr sentence dumps + links into
 * `studyengine/data/tatoeba/`.
 *
 * Tatoeba publishes weekly dated dumps at `downloads.tatoeba.org`. Pin a
 * specific snapshot date so builds are reproducible. The TSVs we need:
 *
 *   - sentences_detailed/fra_sentences_detailed.tsv (filterable by user/date)
 *   - sentences_detailed/eng_sentences_detailed.tsv
 *   - links.csv (sentence_id, translation_id)
 *
 * For L1a we use the simpler `*_sentences.tsv` (id\tlang\ttext) because the
 * pipeline does not yet exploit per-sentence metadata. L1b may switch to
 * `*_detailed.tsv` for QC speaker filtering on Forvo joins.
 *
 * License: Tatoeba sentences are CC BY 2.0 — attribution required if cards
 * surface them. Surfaced as a blockquote in `modelAnswer` markdown; the
 * Settings → About panel should carry the attribution string in L1b.
 *
 * Run: `npm run fetch:tatoeba`
 *
 * The corpus directory is gitignored. Re-runs are no-ops on hash match.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Target {
  url: string;
  out: string;
  sha256: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '..', 'data', 'tatoeba');

// L1b: pin a snapshot date and fill in SHA256s. Defaults point at Tatoeba's
// canonical exports for "all sentences in language X" (filterable to one
// language) and the bidirectional links CSV. Override with env vars for
// custom mirrors / dated snapshots.
const TARGETS: Target[] = [
  {
    url: process.env.TATOEBA_FRA_URL || 'https://downloads.tatoeba.org/exports/per_language/fra/fra_sentences.tsv.bz2',
    out: resolve(OUT_DIR, 'fra_sentences.tsv.bz2'),
    sha256: process.env.TATOEBA_FRA_SHA256 || '',
  },
  {
    url: process.env.TATOEBA_ENG_URL || 'https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2',
    out: resolve(OUT_DIR, 'eng_sentences.tsv.bz2'),
    sha256: process.env.TATOEBA_ENG_SHA256 || '',
  },
  {
    url: process.env.TATOEBA_LINKS_URL || 'https://downloads.tatoeba.org/exports/links.csv.bz2',
    out: resolve(OUT_DIR, 'links.csv.bz2'),
    sha256: process.env.TATOEBA_LINKS_SHA256 || '',
  },
];

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

async function fetchOne(t: Target): Promise<void> {
  if (existsSync(t.out) && t.sha256) {
    const existing = readFileSync(t.out);
    if (sha256(existing) === t.sha256) {
      console.log(`[fetch-tatoeba] up to date: ${t.out}`);
      return;
    }
    console.log(`[fetch-tatoeba] checksum mismatch — re-downloading ${t.out}`);
  }
  console.log(`[fetch-tatoeba] downloading ${t.url}`);
  const res = await fetch(t.url);
  if (!res.ok) throw new Error(`[fetch-tatoeba] HTTP ${res.status} ${res.statusText} — ${t.url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const hash = sha256(buf);
  console.log(`[fetch-tatoeba] ${t.out} — ${buf.byteLength} bytes, sha256=${hash}`);
  if (t.sha256 && hash !== t.sha256) {
    throw new Error(`[fetch-tatoeba] SHA256 mismatch on ${t.url}\n  expected: ${t.sha256}\n  actual:   ${hash}`);
  }
  writeFileSync(t.out, buf);
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const t of TARGETS) {
    await fetchOne(t);
  }
  console.log(
    '[fetch-tatoeba] done. The .bz2 files must be decompressed before the build script can read them. ' +
    'On Linux/macOS: `bunzip2 *.bz2`. On Windows: use 7-Zip or `tar xjf <file>`. ' +
    '// L1b: integrate streaming bz2 decompression into the build script directly.',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

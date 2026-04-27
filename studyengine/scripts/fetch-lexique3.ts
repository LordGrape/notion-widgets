// @ts-nocheck — Node script, not part of tsconfig `include`. Runs via tsx.
/**
 * L1a / L1b: download Lexique 3 (CC BY-SA) into `studyengine/data/lexique3/`.
 *
 * Pinned URL + SHA256 verify so a single committed checksum reproduces the
 * exact corpus version the build was tuned against. Lexique 3 has had column
 * reorderings between major versions; the pipeline parses by header name so
 * minor releases of the same major are tolerated, but pinning still keeps
 * builds reproducible.
 *
 * Run: `npm run fetch:lexique3`
 *
 * The corpus directory is gitignored. Re-running is a no-op if the file is
 * already present and its SHA256 matches the pinned value.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// L1b: bump these to track upstream releases. Override at runtime via env vars.
const LEXIQUE_URL =
  process.env.LEXIQUE_URL
  || 'https://raw.githubusercontent.com/chrplr/openlexicon/master/datasets-info/Lexique383/Lexique383.tsv';
// Set the expected SHA256 once and check it in. An empty value disables the
// check (useful for the very first fetch when the hash is unknown — record
// the printed hash and edit it back into this file).
const LEXIQUE_SHA256 = process.env.LEXIQUE_SHA256 || '';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '..', 'data', 'lexique3');
const OUT_PATH = resolve(OUT_DIR, 'Lexique383.tsv');

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  if (existsSync(OUT_PATH) && LEXIQUE_SHA256) {
    const existing = readFileSync(OUT_PATH);
    if (sha256(existing) === LEXIQUE_SHA256) {
      console.log(`[fetch-lexique3] up to date: ${OUT_PATH}`);
      return;
    }
    console.log('[fetch-lexique3] checksum mismatch on existing file — re-downloading');
  }

  console.log(`[fetch-lexique3] downloading ${LEXIQUE_URL}`);
  const res = await fetch(LEXIQUE_URL);
  if (!res.ok) {
    throw new Error(`[fetch-lexique3] HTTP ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const hash = sha256(buf);
  console.log(`[fetch-lexique3] downloaded ${buf.byteLength} bytes; sha256=${hash}`);

  if (LEXIQUE_SHA256 && hash !== LEXIQUE_SHA256) {
    throw new Error(
      `[fetch-lexique3] SHA256 mismatch.\n  expected: ${LEXIQUE_SHA256}\n  actual:   ${hash}`,
    );
  }
  if (!LEXIQUE_SHA256) {
    console.log(
      '[fetch-lexique3] no LEXIQUE_SHA256 pinned — record this hash in fetch-lexique3.ts to enable verification on future runs.',
    );
  }

  writeFileSync(OUT_PATH, buf);
  console.log(`[fetch-lexique3] wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

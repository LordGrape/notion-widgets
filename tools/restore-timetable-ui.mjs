import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
const root = new URL('.', import.meta.url);
const payload = readFileSync(new URL('restore-timetable-ui.payload.1', root), 'utf8') + readFileSync(new URL('restore-timetable-ui.payload.2', root), 'utf8');
const implementation = new URL('restore-timetable-ui.impl.mjs', root);
writeFileSync(implementation, brotliDecompressSync(Buffer.from(payload, 'base64')));
try { await import(implementation.href + '?run=' + Date.now()); } finally { unlinkSync(implementation); }

import { readFileSync, writeFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
const root = new URL('.', import.meta.url);
const payload = readFileSync(new URL('timetable-v3.payload.1', root), 'utf8') + readFileSync(new URL('timetable-v3.payload.2', root), 'utf8');
writeFileSync(new URL('../timetable.html', import.meta.url), brotliDecompressSync(Buffer.from(payload, 'base64')));
console.log('Applied Timetable v3.');

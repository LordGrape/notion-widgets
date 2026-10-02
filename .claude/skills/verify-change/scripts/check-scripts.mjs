#!/usr/bin/env node
/* Syntax-check browser scripts: standalone .js files and every inline <script> block in .html files.
 * Same idea as the inline check in the old apply-* workflows, generalised.
 * Usage: node .claude/skills/verify-change/scripts/check-scripts.mjs todo.html core.js ...
 * Exit code 1 if any block fails to parse.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const files = process.argv.slice(2);
if (!files.length) { console.error('Usage: check-scripts.mjs <file.html|file.js> ...'); process.exit(2); }
const dir = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'nw-scripts-'));
let failures = 0, checked = 0;

let seq = 0;
function parses(source, module) {
  const path = join(dir, `${seq++}.${module ? 'mjs' : 'cjs'}`);
  writeFileSync(path, source);
  try { execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' }); return null; }
  catch (err) { return String(err.stderr); }
}

function check(label, source, module) {
  checked++;
  let error = parses(source, module);
  /* A classic script that uses import/export is really a module; retry once as one. */
  if (error && !module && /import|export/.test(error)) error = parses(source, true);
  if (error) {
    failures++;
    console.error(`✗ ${label}\n${error.split('\n').slice(1, 6).join('\n')}`);
  }
}

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.cjs')) {
    check(file, text, file.endsWith('.mjs'));
    continue;
  }
  let n = 0;
  for (const m of text.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] || '';
    const body = m[2];
    if (/\ssrc\s*=/.test(attrs) || !body.trim()) continue;
    const type = (attrs.match(/type\s*=\s*["']?([^"'\s>]+)/i) || [])[1] || '';
    if (type && !/^(module|text\/javascript|application\/javascript)$/i.test(type)) continue;
    const line = text.slice(0, m.index).split('\n').length;
    check(`${file} <script> #${++n} (line ${line})`, body, /module/i.test(type));
  }
}

console.log(`${checked - failures}/${checked} script blocks parse.`);
process.exit(failures ? 1 : 0);

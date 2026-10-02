#!/usr/bin/env node
/* Scan the ADDED lines of a diff for house-rule violations that are mechanical to detect.
 *
 * Usage (from the repository root):
 *   node .claude/skills/ui-review/scripts/scan-ui.mjs              # working tree + untracked vs HEAD
 *   node .claude/skills/ui-review/scripts/scan-ui.mjs origin/main  # everything not yet pushed
 *
 * ERROR  emoji / pictographic glyphs used in UI, credential-looking strings
 * WARN   American spellings in user-facing text, new localStorage, new third-party script origins,
 *        new fonts outside Inter / JetBrains Mono
 * Exit 1 on any ERROR. Warnings need a human look, not automatic fixes.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(root);
const base = process.argv[2] ? `${process.argv[2]}...HEAD` : 'HEAD';
const run = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20 });

const UI = /\.(html|css|js|mjs|ts|tsx|jsx)$/;
const SKIP = /^(\.claude\/|tools\/|worker\/|dist\/|athlete\.html$|studyengine\/(index|studyengine)\.html$|.*\.test\.|.*node_modules|widget-icons\.js$|firac-reader\/site\/widget-icons\.js$)/;

/* Collect added lines with file + line number. */
const added = [];
let file = null, line = 0;
for (const l of run('diff', '-U0', base).split('\n')) {
  if (l.startsWith('+++ ')) { file = l.slice(6); continue; }
  const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
  if (h) { line = Number(h[1]); continue; }
  if (file && l.startsWith('+') && !l.startsWith('+++')) { added.push({ file, line, text: l.slice(1) }); line++; }
}
for (const f of run('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)) {
  if (!existsSync(f)) continue;
  readFileSync(f, 'utf8').split('\n').forEach((text, i) => added.push({ file: f, line: i + 1, text }));
}

const findings = [];
const flag = (level, a, msg) => findings.push({ level, where: `${a.file}:${a.line}`, msg, text: a.text.trim().slice(0, 140) });

/* Glyphs the house style allows: typographic punctuation and the platform modifier symbols. */
const ALLOWED = new Set(['⌘', '⌥', '⇧', '⌃', '↵', '←', '→', '↑', '↓', '·', '•', '—', '–', '…', '×', '✓']);
const SPELLING = [
  [/\bcolor(s|ful)?\b/i, 'colour'], [/\bfavorite(s)?\b/i, 'favourite'], [/\bbehavior(s)?\b/i, 'behaviour'],
  [/\bcenter(s|ed)?\b/i, 'centre'], [/\bgray\b/i, 'grey'], [/\bcanceled\b/i, 'cancelled'], [/\blabeled\b/i, 'labelled'],
  [/\bcatalog\b/i, 'catalogue'], [/\bhonor(s|ed)?\b/i, 'honour'], [/\bfulfill\b/i, 'fulfil'], [/\btraveled\b/i, 'travelled'],
];
/* User-facing text: inside quotes or between tags, excluding CSS declarations, identifiers and code. */
function userText(t) {
  const out = [];
  for (const m of t.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) out.push(m[1]);
  for (const m of t.matchAll(/(["'`])((?:\\.|(?!\1).)*?)\1/g)) {
    const s = m[2];
    if (s.length >= 3 && /\s/.test(s) && !/[{};=]|^\s*[.#\w-]+\s*:|var\(|https?:|\/\//.test(s)) out.push(s);
  }
  for (const m of t.matchAll(/(?:aria-label|title|placeholder|alt)\s*=\s*"([^"]+)"/g)) out.push(m[1]);
  return out.join(' \u0000 ');
}

for (const a of added) {
  if (!UI.test(a.file) || SKIP.test(a.file)) continue;
  for (const ch of a.text.match(/\p{Extended_Pictographic}/gu) || []) {
    if (!ALLOWED.has(ch)) { flag('ERROR', a, `emoji/pictograph "${ch}" in UI; use WidgetIcons (data-widget-icon / WidgetIcons.svg)`); break; }
  }
  if (/\b(secret_[A-Za-z0-9]{20,}|ntn_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|Bearer\s+[A-Za-z0-9._-]{20,})/.test(a.text)) flag('ERROR', a, 'looks like a credential; secrets belong in Worker secrets only');
  const words = userText(a.text);
  for (const [re, want] of SPELLING) if (re.test(words)) flag('WARN', a, `American spelling in user-facing text; Canadian English uses "${want}"`);
  if (/localStorage\.(setItem|getItem|removeItem)/.test(a.text)) flag('WARN', a, 'new localStorage use; persistent state goes through SyncEngine unless a documented boundary allows it');
  const src = a.text.match(/<script[^>]+src=["'](https?:\/\/[^"']+)/);
  if (src && !/cdn\.jsdelivr\.net\/npm\/gsap/.test(src[1])) flag('WARN', a, `new third-party script origin ${new URL(src[1]).host}`);
  const font = a.text.match(/font-family\s*:\s*([^;]+)/);
  if (font && !/Inter|JetBrains Mono|inherit|system-ui|monospace|var\(/.test(font[1])) flag('WARN', a, `font outside the house pair (Inter, JetBrains Mono): ${font[1].trim()}`);
}

if (!findings.length) { console.log('scan-ui: no mechanical issues in added lines.'); process.exit(0); }
for (const f of findings) console.log(`${f.level.padEnd(5)} ${f.where}  ${f.msg}\n      ${f.text}`);
const errors = findings.filter(f => f.level === 'ERROR').length;
console.log(`\n${errors} error(s), ${findings.length - errors} warning(s).`);
process.exit(errors ? 1 : 0);

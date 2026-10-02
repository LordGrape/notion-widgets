#!/usr/bin/env node
/* Predict which GitHub Actions workflows a push to main will start, from the files being pushed.
 * Flags the ones that DEPLOY (wrangler deploy) or COMMIT BACK to main (git push).
 *
 * Usage (from the repository root):
 *   node .claude/skills/ship/scripts/triggered-workflows.mjs              # commits not yet on origin/main + working tree
 *   node .claude/skills/ship/scripts/triggered-workflows.mjs --files a b  # explicit file list
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(root);
const lines = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').map(s => s.trim()).filter(Boolean); } catch { return []; } };

const args = process.argv.slice(2);
let files = args[0] === '--files' ? args.slice(1)
  : [...new Set([...lines('diff', '--name-only', 'origin/main...HEAD'), ...lines('diff', '--name-only', 'HEAD'), ...lines('ls-files', '--others', '--exclude-standard')])];

function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++; }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/* Minimal reader for the `on.push` block: branches, paths, paths-ignore. Enough for this repo's workflows. */
function pushTrigger(text) {
  const src = text.split('\n');
  const onIdx = src.findIndex(l => /^(on|"on"|'on'):\s*$/.test(l));
  if (onIdx < 0) {
    const inline = text.match(/^on:\s*\[?([^\n\]]*)\]?/m);
    return inline && /\bpush\b/.test(inline[1]) ? { branches: null, paths: null, ignore: null } : null;
  }
  let pushIndent = -1, current = null;
  const t = { branches: null, paths: null, ignore: null };
  let found = false;
  for (let i = onIdx + 1; i < src.length; i++) {
    const l = src[i];
    if (!l.trim() || l.trim().startsWith('#')) continue;
    const indent = l.match(/^ */)[0].length;
    if (indent === 0) break;
    if (/^\s*push:\s*$/.test(l)) { pushIndent = indent; found = true; current = null; continue; }
    if (found && indent <= pushIndent) break;
    if (!found) continue;
    const key = l.match(/^\s*(branches|paths|paths-ignore):\s*(\[.*\])?\s*$/);
    if (key) {
      current = key[1] === 'paths-ignore' ? 'ignore' : key[1];
      t[current] = [];
      if (key[2]) t[current] = key[2].slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      continue;
    }
    const item = l.match(/^\s*-\s*(.+?)\s*$/);
    if (item && current) t[current].push(item[1].replace(/^['"]|['"]$/g, ''));
  }
  return found ? t : null;
}

const results = [];
for (const name of readdirSync('.github/workflows').filter(n => /\.ya?ml$/.test(n))) {
  const text = readFileSync(join('.github/workflows', name), 'utf8');
  const t = pushTrigger(text);
  if (!t) continue;
  if (t.branches && !t.branches.some(b => globToRegExp(b).test('main'))) continue;
  let hits = files;
  if (t.paths) hits = files.filter(f => t.paths.some(p => globToRegExp(p).test(f)));
  if (t.ignore) hits = hits.filter(f => !t.ignore.some(p => globToRegExp(p).test(f)));
  if (!hits.length) continue;
  const deploys = /^\s*command:\s*deploy\b(?![^\n]*--dry-run)/m.test(text) || /wrangler (pages )?deploy\b(?![^\n]*--dry-run)/.test(text);
  const commits = /git push/.test(text);
  results.push({ name, deploys, commits, hits: t.paths ? hits : ['(every push to main)'] });
}

if (!files.length) { console.log('Nothing to push.'); process.exit(0); }
if (!results.length) { console.log('No workflows will run for these files.'); process.exit(0); }
const order = r => (r.deploys ? 0 : r.commits ? 1 : 2);
results.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
for (const r of results) {
  const tag = r.deploys ? 'DEPLOYS ' : r.commits ? 'COMMITS ' : 'checks  ';
  console.log(`${tag} ${r.name}\n          ← ${r.hits.slice(0, 6).join(', ')}${r.hits.length > 6 ? ` (+${r.hits.length - 6} more)` : ''}`);
}
if (results.some(r => r.commits)) console.log('\nA COMMITS workflow regenerates output or re-runs an old patch installer, and may push a bot commit to main. Pull --rebase after it finishes, and check that it did not rewrite what you just shipped.');
if (results.some(r => r.deploys)) console.log('A DEPLOYS workflow ships to production on push. Only push this when the user wants it live.');

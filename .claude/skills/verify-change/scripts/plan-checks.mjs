#!/usr/bin/env node
/* Map changed files to the checks this repository actually runs.
 *
 * Usage (from the repository root):
 *   node .claude/skills/verify-change/scripts/plan-checks.mjs            # working tree vs HEAD, plus untracked files
 *   node .claude/skills/verify-change/scripts/plan-checks.mjs origin/main # everything since a base ref
 *   node .claude/skills/verify-change/scripts/plan-checks.mjs --files a.js b.html
 *   add --json for machine-readable output
 *
 * Prints the ordered, de-duplicated command list plus manual checks. It never runs anything.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(root);

const args = process.argv.slice(2);
const json = args.includes('--json');
const positional = args.filter(a => a !== '--json');

function git(...a) {
  return execFileSync('git', a, { encoding: 'utf8' }).split('\n').map(s => s.trim()).filter(Boolean);
}

let changed;
if (positional[0] === '--files') changed = positional.slice(1);
else if (positional[0]) changed = git('diff', '--name-only', `${positional[0]}...HEAD`).concat(git('diff', '--name-only', 'HEAD'));
else changed = git('diff', '--name-only', 'HEAD').concat(git('ls-files', '--others', '--exclude-standard'));
changed = [...new Set(changed)].filter(f => !f.startsWith('.claude/'));

function diffText(file) {
  try {
    const base = positional[0] && positional[0] !== '--files' ? [`${positional[0]}...HEAD`] : ['HEAD'];
    const tracked = execFileSync('git', ['diff', ...base, '--', file], { encoding: 'utf8' });
    if (tracked) return tracked;
    /* Untracked new file: every line is added. A tracked file with no diff has no changes. */
    try { execFileSync('git', ['ls-files', '--error-unmatch', file], { stdio: 'ignore' }); return ''; } catch {}
    return existsSync(file) ? readFileSync(file, 'utf8').split('\n').map(l => '+' + l).join('\n') : '';
  } catch { return ''; }
}

/* Checks that already fail on an unchanged main (audited 2026-10-02). A failure from one of these
   is pre-existing unless your diff touches what it asserts; confirm with the baseline step in SKILL.md.
   Delete an entry once the test is fixed or retired. */
const KNOWN_FAILING = {
  'node tools/test-adaptive-weekly-targets-v1.mjs': 'stale: asserts installer-era strings no longer in action-blocks.js/todo.html',
  'node tools/test-seamless-planning-v1.mjs': 'stale: asserts installer-era strings no longer in the current source',
  'node tools/test-upcoming-assignments-v1.mjs': 'stale: runs browser code without a DOM (document.createElement)',
  'node tools/test-command-centre.cjs': 'failed one focus_sessions assertion in a cloud sandbox; may be environmental, compare against main',
};

const commands = [];
const manual = new Set();
const notes = new Set();
const add = (cmd, why) => { if (!commands.some(c => c.cmd === cmd)) commands.push({ cmd, why }); };
const any = (re) => changed.some(f => re.test(f));

/* Tool tests discover their own targets: each tools/test-* or verify-* file that reads a
   changed source file runs. Patch installers (apply-*, add-*, hotfix-*, restore-*, fix-*,
   repair-*) are history, not checks, and are never selected. */
const toolTests = readdirSync('tools')
  .filter(n => /^(test|verify|qa)-.*\.(mjs|cjs)$/.test(n))
  .map(n => {
    const src = readFileSync(join('tools', n), 'utf8');
    const targets = new Set();
    for (const m of src.matchAll(/['"`](?:\.\.\/)?([\w./-]+\.(?:js|html|mjs|cjs|css|json))['"`]/g)) {
      const p = m[1].replace(/^\.\//, '');
      if (existsSync(p) && !p.startsWith('tools/')) targets.add(p);
    }
    return { name: n, targets: [...targets], browser: /playwright|chromium/.test(src) };
  });

for (const t of toolTests) {
  const hit = changed.filter(f => t.targets.includes(f));
  if (hit.length) add(`node tools/${t.name}`, `reads ${hit.join(', ')}${t.browser ? ' (Playwright)' : ''}`);
}

/* Shared runtime: everything embeds it. */
if (any(/^core\.js$/)) {
  add('node --check core.js', 'syntax of shared runtime');
  add('pnpm check', 'core.js is loaded by every widget and the Command Centre');
  add('node tools/test-command-centre.cjs', 'core.js change: exercise the composed surface (Playwright)');
  manual.add('core.js changed: load at least two standalone widgets (e.g. clock.html, todo.html) and confirm boot, theme and SyncEngine still work');
  notes.add('dist/core.js is a separate, older copy. Do not assume it tracks core.js; leave it alone unless the task is about it.');
}
if (any(/^core\.js$/) && /^[+-](?![+-]).*SyncEngine|^@@.*SyncEngine/m.test(diffText('core.js'))) {
  manual.add('SyncEngine code changed: run the SyncEngine round trip from the verify-change skill (set, reload, get, plus an old-shape record)');
}

/* Root HTML widgets and browser scripts: syntax-check inline and standalone scripts. */
const rootWeb = changed.filter(f => !f.includes('/') && /\.(html|js)$/.test(f) && existsSync(f));
if (rootWeb.length) add(`node .claude/skills/verify-change/scripts/check-scripts.mjs ${rootWeb.join(' ')}`, 'syntax of root widget scripts and inline <script> blocks');

if (any(/^widget-icons\.js$|^tools\/build-widget-icons\.mjs$/)) {
  add('node tools/build-widget-icons.mjs', 'regenerate firac-reader/site/widget-icons.js');
  add('node tools/build-widget-icons.mjs --check', 'CI gate: shared icon bundle is current');
  notes.add('Pushing widget-icons.js to main also redeploys FIRAC Reader (deploy-assets.yml).');
}
if (any(/^widget-platform\.js$|^tools\/build-widget-platform\.mjs$/)) {
  add('node tools/build-widget-platform.mjs', 'regenerate FIRAC copy');
  add('node tools/build-widget-platform.mjs --check', 'CI gate');
}

/* Command Centre / root TypeScript packages. */
if (any(/^apps\/assistant\//) || any(/^packages\/.*\.ts$/) || any(/^tsconfig(\.base)?\.json$/) || any(/^tools\/verify-assistant\.mjs$/)) {
  add('pnpm check', 'root typecheck + Command Centre verification (CI: repository job)');
}
if (any(/^apps\/assistant\//)) {
  add('node --test apps/assistant/*.test.mjs', 'Command Centre unit tests (CI: repository job)');
  add('node tools/test-command-centre.cjs', 'Command Centre visual/interaction test (Playwright)');
}

/* To-do React UI build. */
if (any(/^apps\/todo\//)) {
  add('cd apps/todo && npm ci && npm test && npm run build', 'To-do UI tests and bundle');
}

/* Athlete: source lives in apps/athlete/src, athlete.html is generated. */
if (any(/^apps\/athlete\/src\//) || any(/^athlete\.html$/) || any(/^tools\/(build|verify|qa)-athlete\.mjs$/)) {
  add('node tools/build-athlete.mjs', 'regenerate athlete.html from apps/athlete/src');
  add('node tools/build-athlete.mjs --check', 'generated output matches source');
  add('node tools/verify-athlete.mjs', 'Athlete behaviour checks');
  if (any(/^athlete\.html$/) && !any(/^apps\/athlete\/src\//)) notes.add('athlete.html changed without source changes: it is generated. Move the edit into apps/athlete/src/ and rebuild.');
}

/* Study Engine. */
const se = any(/^studyengine\//) || any(/^packages\/study-evidence\//) || any(/^dist\/studyengine\.html$/) || any(/^tools\/(build|verify)-study-engine\.mjs$/);
if (se) {
  add('cd studyengine && npm ci && npm run typecheck && npm test && npm run build && npm run check:build', 'Study Engine (CI: studyengine job)');
  add('node tools/verify-study-engine.mjs', 'entry points equivalent, protected data hashes, obsolete roots absent');
  if (any(/^(studyengine\/(index|studyengine)\.html|dist\/studyengine\.html)$/) && !any(/^studyengine\/app\//)) notes.add('A generated Study Engine entry changed without app/ source changes. Edit studyengine/app/ and rebuild instead.');
}

/* Worker (also consumes packages/study-evidence). */
if (any(/^worker\//) || any(/^packages\/study-evidence\//)) {
  add('cd worker && npm ci && npx tsc --noEmit && npm test -- --passWithNoTests', 'Worker typecheck and tests (CI: worker job)');
  add('cd worker && npx wrangler deploy --config wrangler.toml --dry-run --outdir "${TMPDIR:-/tmp}/nw-worker-dry"', 'bundle builds without deploying');
  notes.add('Pushing worker/** to main DEPLOYS the Worker automatically (deploy-worker.yml).');
}

/* Visual surfaces get the manual matrix. */
const visual = changed.filter(f => /\.(html|css)$/.test(f) || /^apps\/(assistant|athlete\/src|todo\/src)\//.test(f) || /^studyengine\/app\/(styles\.css|app\.ts|presentation\.ts|index\.html)$/.test(f) || f === 'core.js' || f === 'widget-icons.js');
if (visual.length) {
  manual.add('Visual matrix (render with .claude/skills/verify-change/scripts/screenshot-matrix.mjs): light + dark, reduced motion, 375px mobile, standalone, Notion-embed iframe width');
}
/* State changes are found by content, not filename. */
const stateTouched = changed.filter(f => existsSync(f) && /\.(html|js|mjs|ts)$/.test(f) && /^[+-](?![+-]).*(SyncEngine\.(set|setMany|remove|get)|localStorage)/m.test(diffText(f)));
if (stateTouched.length) manual.add(`Persistent state touched in ${stateTouched.join(', ')}: run the SyncEngine round trip and an old-shape (backward compatibility) load`);
if (changed.some(f => existsSync(f) && /\.(html|js|mjs|ts)$/.test(f) && /^\+(?!\+).*localStorage/m.test(diffText(f)))) notes.add('New localStorage use in the diff. AGENTS.md: persistent state goes through SyncEngine.get/set unless a documented compatibility boundary says otherwise.');

add('git diff --check', 'whitespace errors and conflict markers');

const unmatched = changed.filter(f =>
  !/^(docs\/|README\.md|AGENTS\.md|LICENSE|\.editorconfig|\.gitignore|apps\/.*README\.md|apps\/.*AGENTS\.md)/.test(f) &&
  !commands.some(c => c.why.includes(f)) &&
  !/^(core\.js|widget-icons\.js|widget-platform\.js|apps\/|packages\/|studyengine\/|worker\/|dist\/studyengine\.html|athlete\.html|tools\/)/.test(f) &&
  !rootWeb.includes(f));

commands.forEach(c => { if (KNOWN_FAILING[c.cmd]) c.knownFailing = KNOWN_FAILING[c.cmd]; });
const result = { changed, commands, manual: [...manual], notes: [...notes], unmatched };
if (json) { console.log(JSON.stringify(result, null, 2)); process.exit(0); }

if (!changed.length) { console.log('No changed files.'); process.exit(0); }
console.log(`Changed (${changed.length}):\n  ${changed.join('\n  ')}\n`);
console.log('Run, in order:');
commands.forEach((c, i) => console.log(`  ${i + 1}. ${c.cmd}\n     ↳ ${c.why}${KNOWN_FAILING[c.cmd] ? `\n     ⚠ known failing on main: ${KNOWN_FAILING[c.cmd]}` : ''}`));
if (result.manual.length) { console.log('\nManual / visual:'); result.manual.forEach(m => console.log(`  - ${m}`)); }
if (result.notes.length) { console.log('\nNotes:'); result.notes.forEach(n => console.log(`  ! ${n}`)); }
if (unmatched.length) { console.log('\nNo automated check covers:'); unmatched.forEach(u => console.log(`  ? ${u}`)); }

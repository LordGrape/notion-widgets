#!/usr/bin/env node
/* Render a widget across the repository's visual matrix and collect console errors.
 *
 * Usage (from the repository root):
 *   node .claude/skills/verify-change/scripts/screenshot-matrix.mjs todo.html [clock.html ...] [--out DIR] [--query "panel=todo"]
 *
 * Matrix per page: light + dark, normal + reduced motion, 375px phone, 720px desktop,
 * and a 600px Notion-style iframe embed. Screenshots land in DIR (default: $TMPDIR/nw-matrix).
 * All network except the local server is blocked. A synthetic sync key is pre-seeded so the
 * SyncEngine passphrase prompt does not cover the page, and Worker calls get empty replies
 * (state routes return {value:null}), so no real credentials or data are ever used.
 * Pass --seed-state ns=file.json to preload a namespace (SyncEngine localStorage shape)
 * for testing old or edge-case records. Exit 1 if a page throws.
 *
 * Needs the root playwright devDependency (pnpm install) and `npx playwright install chromium`.
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
/* Prefer the repo's devDependency; fall back to a global install. */
function loadPlaywright() {
  try { return createRequire(join(root, 'package.json'))('playwright'); } catch {}
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    return createRequire(join(globalRoot, 'noop.js'))('playwright');
  } catch {}
  console.error('Playwright not found. Run `pnpm install` at the repo root, then `npx playwright install chromium`.');
  process.exit(2);
}
const { chromium } = loadPlaywright();

const argv = process.argv.slice(2);
const flag = (name, fallback) => { const i = argv.indexOf(name); if (i < 0) return fallback; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const out = flag('--out', join(process.env.TMPDIR || tmpdir(), 'nw-matrix'));
const query = flag('--query', '');
const seeds = [];
for (let i = argv.indexOf('--seed-state'); i >= 0; i = argv.indexOf('--seed-state')) {
  const [ns, file] = argv[i + 1].split('=');
  seeds.push([ns, await readFile(file, 'utf8')]);
  argv.splice(i, 2);
}
const pages = argv;
if (!pages.length) { console.error('Usage: screenshot-matrix.mjs <page.html> ... [--out DIR] [--query "a=b"]'); process.exit(2); }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/__embed') {
    const src = url.searchParams.get('src');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(`<!doctype html><body style="margin:0;background:#191919"><iframe src="${src}" style="border:0;width:600px;height:640px;display:block;margin:24px auto"></iframe></body>`);
  }
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (!path || path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const variants = [
  { id: 'light-phone', scheme: 'light', motion: 'no-preference', width: 375, height: 760 },
  { id: 'dark-phone', scheme: 'dark', motion: 'no-preference', width: 375, height: 760 },
  { id: 'light-desktop-reduced', scheme: 'light', motion: 'reduce', width: 720, height: 720 },
  { id: 'dark-desktop', scheme: 'dark', motion: 'no-preference', width: 720, height: 720 },
  { id: 'dark-notion-embed', scheme: 'dark', motion: 'no-preference', width: 720, height: 700, embed: true },
];

let failed = false;
for (const page of pages) {
  const target = `${base}/${page}${query ? `?${query}` : ''}`;
  for (const v of variants) {
    const context = await browser.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: v.scheme, reducedMotion: v.motion });
    await context.route('**/*', route => {
      const u = route.request().url();
      if (u.startsWith(base)) return route.continue();
      if (/workers\.dev/.test(u)) {
        const key = (u.match(/workers\.dev\/state\/([^/?#]+)/) || [])[1];
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(key ? { key, value: null } : {}) });
      }
      return route.abort();
    });
    await context.addInitScript(({ seeds }) => {
      try {
        if (!localStorage.getItem('_sync_passphrase')) localStorage.setItem('_sync_passphrase', 'synthetic-test-key');
        for (const [ns, raw] of seeds) localStorage.setItem('_sync_' + ns, raw);
      } catch {}
    }, { seeds });
    const tab = await context.newPage();
    const problems = [];
    tab.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
    tab.on('console', m => { if (m.type() === 'error' && !/net::ERR_FAILED|Failed to load resource/.test(m.text())) problems.push(`console: ${m.text()}`); });
    await tab.goto(v.embed ? `${base}/__embed?src=${encodeURIComponent(target)}` : target, { waitUntil: 'load' });
    await tab.waitForTimeout(2500);
    const overflow = v.embed ? false : await tab.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) problems.push(`horizontal overflow at ${v.width}px`);
    const file = join(out, `${page.replace(/[^\w.-]+/g, '_')}--${v.id}.png`);
    await tab.screenshot({ path: file, fullPage: !v.embed });
    const thrown = problems.some(p => p.startsWith('pageerror'));
    failed ||= thrown;
    console.log(`${thrown ? '✗' : problems.length ? '!' : '✓'} ${page} ${v.id} → ${file}`);
    problems.forEach(p => console.log(`    ${p}`));
    await context.close();
  }
}
await browser.close();
server.close();
console.log(`\nScreenshots in ${out}. Look at them (Read the PNGs); a clean run is not a visual review.`);
process.exit(failed ? 1 : 0);

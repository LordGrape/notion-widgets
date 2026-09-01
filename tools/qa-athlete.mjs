import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const socket = net.createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address();
      socket.close(() => resolvePort(address.port));
    });
  });
}

function findChrome() {
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const result = spawnSync('which', [name], { encoding: 'utf8' });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  throw new Error('No Chrome or Chromium binary is available.');
}

const html = await readFile(join(root, 'athlete.html'));
const webPort = await freePort();
const debugPort = await freePort();
const profile = await mkdtemp(join(tmpdir(), 'athlete-qa-'));
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, `http://127.0.0.1:${webPort}`).pathname;
  if (pathname === '/' || pathname === '/athlete.html') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(html);
    return;
  }
  response.writeHead(404, { 'content-type': 'text/plain' });
  response.end('Not found');
});
await new Promise((resolveServer) => server.listen(webPort, '127.0.0.1', resolveServer));

const chrome = spawn(findChrome(), [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-extensions',
  '--disable-sync',
  '--no-first-run',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: 'ignore' });

let browserSocket;
let targetId;
try {
  let version;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) {
        version = await response.json();
        break;
      }
    } catch {}
    await sleep(100);
  }
  assert(version?.webSocketDebuggerUrl, 'Chrome DevTools Protocol did not start.');

  browserSocket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolveSocket, reject) => {
    browserSocket.addEventListener('open', resolveSocket, { once: true });
    browserSocket.addEventListener('error', reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  const waiters = [];
  const exceptions = [];

  browserSocket.addEventListener('message', (event) => {
    const message = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8'));
    if (message.id) {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      exceptions.push(message.params.exceptionDetails?.text || 'Unknown page exception');
    }
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      if (waiter.method === message.method && (!waiter.sessionId || waiter.sessionId === message.sessionId)) {
        waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message.params);
      }
    }
  });

  function send(method, params = {}, sessionId) {
    return new Promise((resolveCommand, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve: resolveCommand, reject });
      browserSocket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  function waitForEvent(method, sessionId, timeout = 10_000) {
    return new Promise((resolveEvent, reject) => {
      const waiter = { method, sessionId, resolve: resolveEvent };
      waiter.timer = setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        reject(new Error(`Timed out waiting for ${method}.`));
      }, timeout);
      waiters.push(waiter);
    });
  }

  const created = await send('Target.createTarget', { url: 'about:blank' });
  targetId = created.targetId;
  const attached = await send('Target.attachToTarget', { targetId, flatten: true });
  const sessionId = attached.sessionId;
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 820, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }, sessionId);

  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Evaluation failed.');
    return result.result.value;
  }

  async function navigate() {
    const loadedEvent = waitForEvent('Page.loadEventFired', sessionId);
    await send('Page.navigate', { url: `http://127.0.0.1:${webPort}/athlete.html` }, sessionId);
    await loadedEvent;
    await sleep(2_200);
  }

  await navigate();
  const initial = await evaluate(`(() => {
    const style = getComputedStyle(document.documentElement);
    const app = document.getElementById('app').getBoundingClientRect();
    return {
      marker: document.querySelector('meta[name="athlete-build"]')?.content,
      attrs: document.querySelectorAll('.attr').length,
      muscles: document.querySelectorAll('.muscle').length,
      ovr: document.getElementById('ovrNum').textContent.trim(),
      canvas: style.getPropertyValue('--lg-canvas').trim(),
      background: getComputedStyle(document.body).backgroundImage,
      heroDirection: getComputedStyle(document.querySelector('.hero')).flexDirection,
      appLeft: app.left,
      appRight: app.right,
      viewport: innerWidth,
    };
  })()`);
  assert(initial.marker === 'single-file-v2.2', 'The browser did not load the single-file build.');
  assert(initial.attrs === 8, `Expected eight attribute rows, found ${initial.attrs}.`);
  assert(initial.muscles > 30, 'The body map did not render.');
  assert(initial.ovr === '—', `Expected an empty-state overall score, found ${initial.ovr}.`);
  assert(initial.canvas.toLowerCase() !== '#fff' && initial.canvas.toLowerCase() !== '#ffffff', 'Light mode fell back to a white canvas.');
  assert(initial.background !== 'none', 'The violet background treatment is missing.');
  assert(initial.heroDirection === 'row', 'Desktop hero should use the side-by-side layout.');
  assert(initial.appLeft >= 0 && initial.appRight <= initial.viewport + 1, 'Desktop app overflows horizontally.');

  await evaluate(`document.getElementById('logBtn').click()`);
  await sleep(100);
  assert(await evaluate(`document.querySelectorAll('[data-test]').length`) === 12, 'The log picker is incomplete.');
  await evaluate(`document.querySelector('[data-test="run2400"]').click()`);
  await sleep(100);
  await evaluate(`(() => {
    const set = (id, value) => {
      const field = document.getElementById(id);
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles:true }));
    };
    set('fMin', '8');
    set('fSec', '20');
  })()`);
  await sleep(80);
  const preview = await evaluate(`document.getElementById('fPrev').textContent.replace(/\s+/g, ' ').trim()`);
  assert(preview.includes('Score 70') && preview.includes('Entry') && preview.includes('L1'), `Unexpected score preview: ${preview}`);
  await evaluate(`document.getElementById('fSave').click()`);
  await sleep(250);
  const saved = await evaluate(`({
    ovr: document.getElementById('ovrNum').textContent.trim(),
    sheetClosed: document.getElementById('logSheet').hidden,
    firstScore: document.querySelector('.attr-score')?.textContent.trim(),
    entryRegions: document.querySelectorAll('.muscle.m2').length,
  })`);
  assert(saved.ovr === '70' && saved.firstScore === '70', 'Saving a 2400 m result did not update the model.');
  assert(saved.sheetClosed, 'The log sheet did not close after saving.');
  assert(saved.entryRegions > 0, 'The body map did not colour the scored region.');

  await evaluate(`document.getElementById('tabRadar').click()`);
  await sleep(150);
  const radar = await evaluate(`({
    bodyHidden: document.getElementById('bodyWrap').classList.contains('view-off'),
    radarHidden: document.getElementById('radar').classList.contains('view-off'),
    width: document.getElementById('radar').width,
    height: document.getElementById('radar').height,
  })`);
  assert(radar.bodyHidden && !radar.radarHidden && radar.width > 0 && radar.height > 0, 'Radar tab did not render correctly.');

  await evaluate(`document.querySelector('.attr').click()`);
  await sleep(100);
  const detail = await evaluate(`({ hidden:document.getElementById('detail').hidden, title:document.getElementById('detailTitle').textContent })`);
  assert(!detail.hidden && detail.title.includes('Engine'), 'Attribute detail did not open.');
  await evaluate(`document.querySelector('[data-close="detail"]').click(); document.getElementById('settingsBtn').click()`);
  await sleep(100);
  assert(!(await evaluate(`document.getElementById('settings').hidden`)), 'Settings did not open.');
  assert((await evaluate(`document.getElementById('rkL1').value`)).length > 0, 'Settings did not load pace anchors.');
  await evaluate(`document.querySelector('[data-close="settings"]').click()`);

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await sleep(250);
  const mobile = await evaluate(`(() => {
    const app = document.getElementById('app').getBoundingClientRect();
    return {
      scrollWidth: document.documentElement.scrollWidth,
      viewport: innerWidth,
      heroDirection: getComputedStyle(document.querySelector('.hero')).flexDirection,
      appLeft: app.left,
      appRight: app.right,
    };
  })()`);
  assert(mobile.scrollWidth <= mobile.viewport + 1, `Mobile layout overflows by ${mobile.scrollWidth - mobile.viewport}px.`);
  assert(mobile.heroDirection === 'column', 'Mobile hero should collapse to one column.');
  assert(mobile.appLeft >= 0 && mobile.appRight <= mobile.viewport + 1, 'Mobile card leaves the viewport.');

  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }, sessionId);
  await navigate();
  const dark = await evaluate(`(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      canvas: style.getPropertyValue('--lg-canvas').trim().toLowerCase(),
      attrs: document.querySelectorAll('.attr').length,
      scrollWidth: document.documentElement.scrollWidth,
      viewport: innerWidth,
    };
  })()`);
  assert(dark.canvas === '#0f0b15', `Dark canvas token is ${dark.canvas}, expected #0f0b15.`);
  assert(dark.attrs === 8 && dark.scrollWidth <= dark.viewport + 1, 'Dark mobile mode failed its layout check.');
  assert(exceptions.length === 0, `Browser raised JavaScript exceptions: ${exceptions.join(' | ')}`);

  console.log('Browser QA passed: empty state, scoring, save, body map, radar, detail, settings, desktop, mobile, light and dark modes.');
} finally {
  if (browserSocket?.readyState === WebSocket.OPEN && targetId) {
    try {
      const id = Date.now();
      browserSocket.send(JSON.stringify({ id, method:'Target.closeTarget', params:{ targetId } }));
      await sleep(100);
    } catch {}
  }
  try { browserSocket?.close(); } catch {}
  chrome.kill('SIGTERM');
  await new Promise((resolveServer) => server.close(resolveServer));
  await rm(profile, { recursive:true, force:true });
}

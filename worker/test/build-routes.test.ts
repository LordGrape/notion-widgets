import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// L1b-β: cover deterministic Wiktionary cache preparation and LLM fallback split.
vi.mock('../src/gemini', () => ({
  callGemini: vi.fn(async () => ({
    candidates: [{ content: { parts: [{ text: '{"glosses":[{"lemma":"chat","pos":"NOM","gloss":"cat","exampleHint":"Le chat dort."}]}' }] } }],
    usageMetadata: { totalTokenCount: 123 },
  })),
  extractGeminiText: (data: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }) =>
    data.candidates?.[0]?.content?.parts?.[0]?.text || '',
}));

import app from '../src/index';
import { callGemini } from '../src/gemini';
import { validateAuth } from '../src/auth';
import { handleBuildLexique3Prepare } from '../src/routes/build/lexique3-prepare';
import { handleBuildTatoebaPrepare } from '../src/routes/build/tatoeba-prepare';
import { handleBuildWiktionaryPrepare } from '../src/routes/build/wiktionary-prepare';
import { handleBuildGlossBatch } from '../src/routes/build/gloss-batch';
import { handleBuildAssemble } from '../src/routes/build/assemble';
import { handleBuildStatus } from '../src/routes/build/status';
import { handleDeckFrenchCore2000 } from '../src/routes/build/decks-french-core-2000';
import { BUILD_KEYS } from '../src/lib/french-core';

class MockKV {
  m = new Map<string, string>();
  async get(k: string, t?: string) { const v = this.m.get(k); if (v == null) return null; return t === 'json' ? JSON.parse(v) : v; }
  async put(k: string, v: string) { this.m.set(k, String(v)); }
}

describe('build routes', () => {
  const here = resolve(fileURLToPath(import.meta.url), '..');
  const env = { WIDGET_SECRET: 'secret', GEMINI_API_KEY: 'x', GOOGLE_TTS_KEY: 'x', WIDGET_KV: new MockKV() } as any;
  const originalFetch = global.fetch;

  beforeEach(() => {
    env.WIDGET_KV = new MockKV();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('auth missing => 401 for new routes', () => {
    const req = new Request('http://localhost/studyengine/build/status');
    const res = validateAuth(req, env, '/studyengine/build/status');
    expect(res?.status).toBe(401);
  });

  it('wiktionary prepare handles auth, happy path, and cached idempotency', async () => {
    const missingAuth = await app.fetch(new Request('http://localhost/studyengine/build/wiktionary-prepare', { method: 'POST', body: '{}' }), env, {} as ExecutionContext);
    expect(missingAuth.status).toBe(401);

    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ 'bonjour::INT': { gloss: 'hello', source: 'wiktionary' } }),
    });
    const ready = await (await handleBuildWiktionaryPrepare(req, env)).json();
    expect(ready).toEqual({ status: 'ready', count: 1 });

    const cached = await (await handleBuildWiktionaryPrepare(new Request('http://x', { method: 'POST', body: '{}' }), env)).json();
    expect(cached).toEqual({ status: 'cached', count: 1 });
  });

  it('lexique and tatoeba prepare are idempotent', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => 'ortho\tphon\tlemme\tcgram\tgenre\tnombre\tfreqlemfilms2\tfreqfilms2\nle\tl@\tle\tDET\t\t\t100\t100' } as any)
      .mockResolvedValueOnce({ ok: true, text: async () => '1\tfra\tLe chat.' } as any)
      .mockResolvedValueOnce({ ok: true, text: async () => '2\teng\tThe cat.' } as any)
      .mockResolvedValueOnce({ ok: true, text: async () => '1,2' } as any);

    const req = new Request('http://x', { method: 'POST', body: '{}' });
    const a = await (await handleBuildLexique3Prepare(req, env)).json();
    expect(a.status).toBe('ok');
    const a2 = await (await handleBuildLexique3Prepare(req, env)).json();
    expect(a2.status).toBe('cached');

    const b = await (await handleBuildTatoebaPrepare(req, env)).json();
    expect(b.status).toBe('ok');
    const b2 = await (await handleBuildTatoebaPrepare(req, env)).json();
    expect(b2.status).toBe('cached');
  });

  it('gloss batch returns budget warning/exceeded', async () => {
    await env.WIDGET_KV.put(BUILD_KEYS.lexique, JSON.stringify([{ lemme: 'chat', cgram: 'NOM', phon: 'Sa' }]));
    await env.WIDGET_KV.put(BUILD_KEYS.tokenBudget, JSON.stringify({ cumulativeTokens: 50_000 }));
    const warn = await (await handleBuildGlossBatch(new Request('http://x', { method: 'POST', body: '{}' }), env)).json();
    expect(warn.status).toBe('budget-warning');

    await env.WIDGET_KV.put(BUILD_KEYS.tokenBudget, JSON.stringify({ cumulativeTokens: 200_000 }));
    const exceeded = await (await handleBuildGlossBatch(new Request('http://x', { method: 'POST', body: '{}' }), env)).json();
    expect(exceeded.status).toBe('budget-exceeded');
  });

  it('gloss batch uses Wiktionary hits without calling the LLM', async () => {
    await env.WIDGET_KV.put(BUILD_KEYS.lexique, JSON.stringify([{ lemme: 'bonjour', cgram: 'INT', phon: 'bO~ZuR' }]));
    await env.WIDGET_KV.put(BUILD_KEYS.wiktionaryGlosses, JSON.stringify({ 'bonjour::INT': { gloss: 'hello', source: 'wiktionary' } }));

    const res = await (await handleBuildGlossBatch(new Request('http://x', { method: 'POST', body: '{}' }), env)).json();
    expect(res.status).toBe('done');
    expect(res.sources.wiktionary).toBe(1);
    expect(callGemini).not.toHaveBeenCalled();
  });

  it('gloss batch sends only residual misses to the LLM', async () => {
    await env.WIDGET_KV.put(BUILD_KEYS.lexique, JSON.stringify([
      { lemme: 'bonjour', cgram: 'INT', phon: 'bO~ZuR' },
      { lemme: 'merci', cgram: 'INT', phon: 'mERsi' },
      { lemme: 'oui', cgram: 'ADV', phon: 'wi' },
      { lemme: 'non', cgram: 'ADV', phon: 'nO~' },
      { lemme: 'chat', cgram: 'NOM', phon: 'Sa' },
    ]));
    await env.WIDGET_KV.put(BUILD_KEYS.wiktionaryGlosses, JSON.stringify({
      'bonjour::INT': { gloss: 'hello', source: 'wiktionary' },
      'merci::INT': { gloss: 'thank you', source: 'wiktionary' },
      'oui::ADV': { gloss: 'yes', source: 'wiktionary' },
      'non::ADV': { gloss: 'no', source: 'wiktionary' },
    }));

    const res = await (await handleBuildGlossBatch(new Request('http://x', { method: 'POST', body: JSON.stringify({ batchSize: 5 }) }), env)).json();
    expect(callGemini).toHaveBeenCalledOnce();
    expect(callGemini).toHaveBeenCalledWith('gemini-2.5-flash', expect.any(String), expect.stringContaining('"chat"'), expect.any(Object), env);
    expect(res.sources).toEqual({ wiktionary: 4, llmFallback: 1 });
    expect(res.glosses.map((row: { source: string }) => row.source).sort()).toEqual([
      'llm-fallback',
      'wiktionary',
      'wiktionary',
      'wiktionary',
      'wiktionary',
    ]);

    const cached = await env.WIDGET_KV.get(BUILD_KEYS.glosses, 'json');
    expect(cached.byLemmaPos['bonjour::INT'].source).toBe('wiktionary');
    expect(cached.byLemmaPos['chat::NOM'].source).toBe('llm-fallback');
  });

  it('assemble returns preconditions-missing when absent', async () => {
    const res = await handleBuildAssemble(new Request('http://x', { method: 'POST', body: '{}' }), env);
    const body = await res.json();
    expect(body.status).toBe('preconditions-missing');
  });

  it('status and deck-read happy path', async () => {
    await env.WIDGET_KV.put(BUILD_KEYS.lexique, JSON.stringify([{ lemme: 'le' }]));
    await env.WIDGET_KV.put(BUILD_KEYS.deck, JSON.stringify([{ prompt: 'le' }]));
    await env.WIDGET_KV.put(BUILD_KEYS.deckMeta, JSON.stringify({ lemmaCount: 1, generatedAt: '2026-01-01T00:00:00.000Z' }));

    const s = await (await handleBuildStatus(new Request('http://x'), env)).json();
    expect(s.lexique3.ready).toBe(true);

    const d = await handleDeckFrenchCore2000(new Request('http://x'), env);
    expect(d.status).toBe(200);
    const db = await d.json();
    expect(db.cards.length).toBe(1);
  });

  it('deck-read returns 404 if missing', async () => {
    const d = await handleDeckFrenchCore2000(new Request('http://x'), env);
    expect(d.status).toBe(404);
  });

  it('build routes never write the sacred gloss sample file', async () => {
    const samplePath = resolve(here, '../../studyengine/src/decks/french-core-2000/glosses-sample.json');
    const before = readFileSync(samplePath, 'utf8');
    await handleBuildWiktionaryPrepare(new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ 'bonjour::INT': { gloss: 'hello', source: 'wiktionary' } }),
    }), env);
    await env.WIDGET_KV.put(BUILD_KEYS.lexique, JSON.stringify([{ lemme: 'bonjour', cgram: 'INT', phon: 'bO~ZuR' }]));
    await handleBuildGlossBatch(new Request('http://x', { method: 'POST', body: '{}' }), env);
    expect(readFileSync(samplePath, 'utf8')).toBe(before);
  });

  afterEach(() => { global.fetch = originalFetch; });
});

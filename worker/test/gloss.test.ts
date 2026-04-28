import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleGloss } from '../src/routes/gloss';

const env = {
  WIDGET_SECRET: 'secret',
  GEMINI_API_KEY: 'x',
  GOOGLE_TTS_KEY: 'x',
  WIDGET_KV: { get: vi.fn(), put: vi.fn() },
} as any;

describe('handleGloss', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns glosses for a valid request', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          { content: { parts: [{ text: '{"glosses":[{"lemma":"bonjour","pos":"INT","gloss":"hello, good day"}]}' }] } },
        ],
      }),
    } as any);

    const req = new Request('http://localhost/studyengine/gloss', {
      method: 'POST',
      body: JSON.stringify({ lemmas: [{ lemma: 'bonjour', pos: 'INT', ipa: 'bɔ̃ʒuʁ' }] }),
    });
    const res = await handleGloss(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.glosses[0].lemma).toBe('bonjour');
  });

  it('returns 400 for malformed batch', async () => {
    const req = new Request('http://localhost/studyengine/gloss', {
      method: 'POST',
      body: JSON.stringify({ lemmas: [] }),
    });
    const res = await handleGloss(req, env);
    expect(res.status).toBe(400);
  });

  it('returns 500 when LLM payload is malformed', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'not-json' }] } }] }),
    } as any);

    const req = new Request('http://localhost/studyengine/gloss', {
      method: 'POST',
      body: JSON.stringify({ lemmas: [{ lemma: 'bonjour', pos: 'INT', ipa: 'bɔ̃ʒuʁ' }] }),
    });
    const res = await handleGloss(req, env);
    expect(res.status).toBe(500);
  });
});

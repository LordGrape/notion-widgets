// L1b-β: prepare Wiktionary-primary glosses in KV for deterministic build lookup.
import type { Env } from '../../types';
import { BUILD_KEYS, clearWiktionaryGlossesMemo, kvGetJson } from '../../lib/french-core';

type WiktionaryGlossRecord = {
  gloss: string;
  source: 'wiktionary';
};

type WiktionaryPrepareBody = {
  force?: boolean;
  glosses?: unknown;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function isGlossRecord(value: unknown): value is WiktionaryGlossRecord {
  if (!value || typeof value !== 'object') return false;
  const row = value as { gloss?: unknown; source?: unknown };
  return typeof row.gloss === 'string' && row.gloss.trim().length > 0 && row.source === 'wiktionary';
}

function parseGlosses(input: unknown): Record<string, WiktionaryGlossRecord> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out: Record<string, WiktionaryGlossRecord> = {};
  for (const [key, value] of Object.entries(input)) {
    const separator = key.indexOf('::');
    if (separator <= 0 || separator >= key.length - 2) return null;
    if (!isGlossRecord(value)) return null;
    out[key] = { gloss: value.gloss.trim().slice(0, 120), source: 'wiktionary' };
  }
  return out;
}

export async function handleBuildWiktionaryPrepare(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as WiktionaryPrepareBody;
    const force = body.force === true;
    const existing = await kvGetJson<Record<string, WiktionaryGlossRecord>>(env.WIDGET_KV, BUILD_KEYS.wiktionaryGlosses);
    if (existing && !force) return json({ status: 'cached', count: Object.keys(existing).length });

    const glosses = parseGlosses(body.glosses ?? body);
    if (!glosses) return json({ error: 'Invalid Wiktionary gloss payload' }, 400);

    await env.WIDGET_KV.put(BUILD_KEYS.wiktionaryGlosses, JSON.stringify(glosses));
    clearWiktionaryGlossesMemo(env);
    return json({ status: 'ready', count: Object.keys(glosses).length });
  } catch (err) {
    return json({ error: 'wiktionary-prepare failed', detail: err instanceof Error ? err.message : String(err) }, 500);
  }
}

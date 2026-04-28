// L1b-alpha-hotfix: prepare Lexique 3 top-2000 in KV.
import type { Env } from '../../types';
import { BUILD_KEYS, fetchText, kvGetJson, LEXIQUE_SHA256, LEXIQUE_URL, parseLexique3, selectTopByFreqfilms2, sha256Text } from '../../lib/french-core';

function json(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }

export async function handleBuildLexique3Prepare(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as { force?: boolean };
    const force = !!body.force;
    const existing = await kvGetJson<any[]>(env.WIDGET_KV, BUILD_KEYS.lexique);
    if (existing && !force) return json({ status: 'cached', count: existing.length, sha256: (await kvGetJson<any>(env.WIDGET_KV, BUILD_KEYS.lexiqueMeta))?.sha256 || '' });
    const text = await fetchText(LEXIQUE_URL);
    const sha256 = await sha256Text(text);
    if (LEXIQUE_SHA256 && sha256 !== LEXIQUE_SHA256) return json({ error: 'Lexique SHA256 mismatch', expected: LEXIQUE_SHA256, actual: sha256 }, 502);
    const top = selectTopByFreqfilms2(parseLexique3(text), 2000);
    await env.WIDGET_KV.put(BUILD_KEYS.lexique, JSON.stringify(top));
    await env.WIDGET_KV.put(BUILD_KEYS.lexiqueMeta, JSON.stringify({ sha256, count: top.length }));
    return json({ status: 'ok', count: top.length, sha256 });
  } catch (err) {
    return json({ error: 'lexique3-prepare failed', detail: err instanceof Error ? err.message : String(err) }, 500);
  }
}

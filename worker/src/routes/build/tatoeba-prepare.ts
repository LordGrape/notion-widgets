// L1b-alpha-hotfix: prepare Tatoeba lemma index in KV.
import type { Env } from '../../types';
import { BUILD_KEYS, fetchText, indexPairsByLemma, kvGetJson, parseTatoebaPairs, sha256Text, TATOEBA_SHA256, TATOEBA_URLS } from '../../lib/french-core';

function json(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }

export async function handleBuildTatoebaPrepare(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as { force?: boolean };
    const force = !!body.force;
    const existing = await kvGetJson<Record<string, unknown[]>>(env.WIDGET_KV, BUILD_KEYS.tatoeba);
    if (existing && !force) return json({ status: 'cached', lemmasWithExamples: Object.keys(existing).length, sha256: (await kvGetJson<any>(env.WIDGET_KV, BUILD_KEYS.tatoebaMeta))?.sha256 || '' });

    const lexique = await kvGetJson<Array<{ lemme: string }>>(env.WIDGET_KV, BUILD_KEYS.lexique);
    if (!lexique) return json({ error: 'Missing precondition: lexique3-top2000' }, 400);
    const [fra, eng, links] = await Promise.all([fetchText(TATOEBA_URLS.fra), fetchText(TATOEBA_URLS.eng), fetchText(TATOEBA_URLS.links)]);
    const joined = `${fra}\n${eng}\n${links}`;
    const sha256 = await sha256Text(joined);
    if (TATOEBA_SHA256 && sha256 !== TATOEBA_SHA256) return json({ error: 'Tatoeba SHA256 mismatch', expected: TATOEBA_SHA256, actual: sha256 }, 502);
    const pairs = parseTatoebaPairs({ fraSentencesTsv: fra, engSentencesTsv: eng, linksCsv: links });
    const allIndex = indexPairsByLemma(pairs);
    const allowed = new Set(lexique.map((l) => String(l.lemme || '').toLowerCase()));
    const filtered: Record<string, unknown[]> = {};
    for (const [lemma, rows] of Object.entries(allIndex)) if (allowed.has(lemma)) filtered[lemma] = rows;
    await env.WIDGET_KV.put(BUILD_KEYS.tatoeba, JSON.stringify(filtered));
    await env.WIDGET_KV.put(BUILD_KEYS.tatoebaMeta, JSON.stringify({ sha256, lemmasWithExamples: Object.keys(filtered).length }));
    return json({ status: 'ok', lemmasWithExamples: Object.keys(filtered).length, sha256 });
  } catch (err) {
    return json({ error: 'tatoeba-prepare failed', detail: err instanceof Error ? err.message : String(err) }, 500);
  }
}

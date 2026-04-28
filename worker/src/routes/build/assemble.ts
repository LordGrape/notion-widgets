// L1b-alpha-hotfix: assemble final french-core-2000 deck from KV stages.
import type { Env } from '../../types';
import { buildCardJson, BUILD_KEYS, kvGetJson } from '../../lib/french-core';

function json(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }

export async function handleBuildAssemble(_request: Request, env: Env): Promise<Response> {
  try {
    const [lexique, lexMeta, tatoeba, tatoebaMeta, glosses] = await Promise.all([
      kvGetJson<any[]>(env.WIDGET_KV, BUILD_KEYS.lexique),
      kvGetJson<any>(env.WIDGET_KV, BUILD_KEYS.lexiqueMeta),
      kvGetJson<Record<string, any[]>>(env.WIDGET_KV, BUILD_KEYS.tatoeba),
      kvGetJson<any>(env.WIDGET_KV, BUILD_KEYS.tatoebaMeta),
      kvGetJson<any>(env.WIDGET_KV, BUILD_KEYS.glosses),
    ]);
    const missing = [!lexique && BUILD_KEYS.lexique, !tatoeba && BUILD_KEYS.tatoeba, !glosses && BUILD_KEYS.glosses].filter(Boolean);
    if (missing.length) return json({ status: 'preconditions-missing', missing }, 400);

    let withExamples = 0; let withGlosses = 0;
    const cards = (lexique || []).map((entry, idx) => {
      const key = `${entry.lemme}::${entry.cgram}`;
      const glossRow = glosses.byLemmaPos?.[key];
      const gloss = String(glossRow?.gloss || '[missing gloss]');
      if (gloss && gloss !== '[missing gloss]') withGlosses += 1;
      const pair = (tatoeba?.[String(entry.lemme || '').toLowerCase()] || [])[0];
      if (pair) withExamples += 1;
      return buildCardJson({ lemma: entry, gloss, pair, rank: idx + 1, exampleHint: glossRow?.exampleHint });
    });

    const generatedAt = new Date().toISOString();
    const meta = { generatedAt, lemmaCount: cards.length, withExamples, withGlosses, sourceHashes: { lexique3: lexMeta?.sha256 || '', tatoeba: tatoebaMeta?.sha256 || '' } };
    await env.WIDGET_KV.put(BUILD_KEYS.deck, JSON.stringify(cards));
    await env.WIDGET_KV.put(BUILD_KEYS.deckMeta, JSON.stringify(meta));
    return json({ status: 'ok', lemmaCount: cards.length, withExamples, withGlosses, generatedAt });
  } catch (err) {
    return json({ error: 'assemble failed', detail: err instanceof Error ? err.message : String(err) }, 500);
  }
}

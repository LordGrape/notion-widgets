// L1b-alpha-hotfix: status snapshot for french-core-2000 build orchestration.
import type { Env } from '../../types';
import { BUILD_KEYS, kvGetJson } from '../../lib/french-core';

function json(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }

export async function handleBuildStatus(_request: Request, env: Env): Promise<Response> {
  const [lexique, lexMeta, tatoeba, wiktionary, budget, glosses, assembled] = await Promise.all([
    kvGetJson<any[]>(env.WIDGET_KV, BUILD_KEYS.lexique),
    kvGetJson<any>(env.WIDGET_KV, BUILD_KEYS.lexiqueMeta),
    kvGetJson<Record<string, any[]>>(env.WIDGET_KV, BUILD_KEYS.tatoeba),
    // L1b-β: expose deterministic gloss cache readiness to the browser orchestrator.
    kvGetJson<Record<string, any>>(env.WIDGET_KV, BUILD_KEYS.wiktionaryGlosses),
    kvGetJson<{ cumulativeTokens: number }>(env.WIDGET_KV, BUILD_KEYS.tokenBudget),
    kvGetJson<any>(env.WIDGET_KV, BUILD_KEYS.glosses),
    kvGetJson<any>(env.WIDGET_KV, BUILD_KEYS.deckMeta),
  ]);
  const cumulativeTokens = Number(budget?.cumulativeTokens || 0);
  return json({
    lexique3: { ready: !!lexique, count: lexique?.length, sha256: lexMeta?.sha256 },
    wiktionary: { ready: !!wiktionary, count: wiktionary ? Object.keys(wiktionary).length : undefined },
    tatoeba: { ready: !!tatoeba, lemmasWithExamples: tatoeba ? Object.keys(tatoeba).length : undefined },
    glosses: {
      totalGlossed: glosses?.byLemmaPos ? Object.keys(glosses.byLemmaPos).length : 0,
      totalLemmas: lexique?.length || 0,
      cumulativeTokens,
      budgetState: cumulativeTokens >= 200_000 ? 'exceeded' : cumulativeTokens >= 50_000 ? 'warning' : 'ok',
    },
    assembled: { ready: !!assembled, lemmaCount: assembled?.lemmaCount, generatedAt: assembled?.generatedAt },
  });
}

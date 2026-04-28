// L1b-alpha-hotfix: status snapshot for french-core-2000 build orchestration.
import type { Env } from '../../types';
import { BUILD_KEYS, kvGetJson } from '../../lib/french-core';

function json(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }

export async function handleBuildStatus(_request: Request, env: Env): Promise<Response> {
  const [lexique, lexMeta, tatoeba, budget, glosses, assembled] = await Promise.all([
    kvGetJson<any[]>(env.WIDGET_KV, BUILD_KEYS.lexique),
    kvGetJson<any>(env.WIDGET_KV, BUILD_KEYS.lexiqueMeta),
    kvGetJson<Record<string, any[]>>(env.WIDGET_KV, BUILD_KEYS.tatoeba),
    kvGetJson<{ cumulativeTokens: number }>(env.WIDGET_KV, BUILD_KEYS.tokenBudget),
    kvGetJson<any>(env.WIDGET_KV, BUILD_KEYS.glosses),
    kvGetJson<any>(env.WIDGET_KV, BUILD_KEYS.deckMeta),
  ]);
  const cumulativeTokens = Number(budget?.cumulativeTokens || 0);
  return json({
    lexique3: { ready: !!lexique, count: lexique?.length, sha256: lexMeta?.sha256 },
    tatoeba: { ready: !!tatoeba, lemmasWithExamples: tatoeba ? Object.keys(tatoeba).length : undefined },
    glosses: {
      totalGlossed: glosses?.byLemmaPos ? Object.keys(glosses.byLemmaPos).length : 0,
      totalLemmas: lexique?.length || 0,
      cumulativeTokens,
      budgetState: cumulativeTokens >= 3_000_000 ? 'exceeded' : cumulativeTokens >= 1_500_000 ? 'warning' : 'ok',
    },
    assembled: { ready: !!assembled, lemmaCount: assembled?.lemmaCount, generatedAt: assembled?.generatedAt },
  });
}

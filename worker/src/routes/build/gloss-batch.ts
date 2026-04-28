// L1b-alpha-hotfix: batch gloss generation with token-budget guardrails.
import { callGemini, extractGeminiText } from '../../gemini';
import { parseLlmJson } from '../../llm/parse';
import { BUILD_KEYS, buildGlossPrompt, kvGetJson, loadWiktionaryGlosses, SAMPLE_GLOSSES, sampaToIpa } from '../../lib/french-core';
import type { Env } from '../../types';

function json(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
// L1b-β: fallback should be rare after Wiktionary hits; TUNE after first full build.
const TOKEN_MAX = 200_000;
const TOKEN_WARN = 50_000;

export async function handleBuildGlossBatch(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as { batchIndex?: number; batchSize?: number; confirm?: boolean };
    const batchSize = Math.max(1, Math.min(50, Number(body.batchSize || 30)));
    const lexique = await kvGetJson<Array<{ lemme: string; cgram: string; genre?: string; phon?: string }>>(env.WIDGET_KV, BUILD_KEYS.lexique);
    if (!lexique) return json({ error: 'Missing precondition: lexique3-top2000' }, 400);

    const cached = (await kvGetJson<any>(env.WIDGET_KV, BUILD_KEYS.glosses)) || { byLemmaPos: {} };
    for (const lemma of lexique) {
      const key = `${lemma.lemme}::${lemma.cgram}`;
      if (!cached.byLemmaPos[key] && SAMPLE_GLOSSES[lemma.lemme]) cached.byLemmaPos[key] = { lemma: lemma.lemme, pos: lemma.cgram, gloss: SAMPLE_GLOSSES[lemma.lemme], source: 'sample' };
    }
    const wiktionary = await loadWiktionaryGlosses(env);
    let wiktionarySaved = 0;
    const wiktionaryGlosses: Array<{ lemma: string; pos: string; gloss: string; source: 'wiktionary' }> = [];
    for (const lemma of lexique) {
      const key = `${lemma.lemme}::${lemma.cgram}`;
      const gloss = wiktionary.get(key);
      if (!cached.byLemmaPos[key] && gloss) {
        cached.byLemmaPos[key] = { lemma: lemma.lemme, pos: lemma.cgram, gloss, source: 'wiktionary' };
        wiktionaryGlosses.push({ lemma: lemma.lemme, pos: lemma.cgram, gloss, source: 'wiktionary' });
        wiktionarySaved++;
      }
    }

    const missing = lexique.filter((lemma) => !cached.byLemmaPos[`${lemma.lemme}::${lemma.cgram}`]);
    if (!missing.length) {
      await env.WIDGET_KV.put(BUILD_KEYS.glosses, JSON.stringify(cached));
      const budget = (await kvGetJson<{ cumulativeTokens: number }>(env.WIDGET_KV, BUILD_KEYS.tokenBudget)) || { cumulativeTokens: 0 };
      return json({ status: 'done', batchIndex: 0, lemmasGlossed: wiktionarySaved, totalGlossed: Object.keys(cached.byLemmaPos).length, totalLemmas: lexique.length, cumulativeTokens: budget.cumulativeTokens, sources: { wiktionary: wiktionarySaved, llmFallback: 0 }, glosses: wiktionaryGlosses });
    }
    if (wiktionarySaved > 0) await env.WIDGET_KV.put(BUILD_KEYS.glosses, JSON.stringify(cached));

    const budget = (await kvGetJson<{ cumulativeTokens: number }>(env.WIDGET_KV, BUILD_KEYS.tokenBudget)) || { cumulativeTokens: 0 };
    if (budget.cumulativeTokens >= TOKEN_MAX) return json({ status: 'budget-exceeded', cumulativeTokens: budget.cumulativeTokens });
    if (budget.cumulativeTokens >= TOKEN_WARN && !body.confirm) {
      return json({ status: 'budget-warning', cumulativeTokens: budget.cumulativeTokens, batchesComplete: Math.ceil((lexique.length - missing.length) / batchSize), batchesRemaining: Math.ceil(missing.length / batchSize) });
    }

    const batchIndex = Number.isFinite(Number(body.batchIndex)) ? Math.max(0, Number(body.batchIndex)) : 0;
    const batch = missing.slice(batchIndex * batchSize, batchIndex * batchSize + batchSize);
    if (!batch.length) return json({ status: 'done', batchIndex, lemmasGlossed: 0, totalGlossed: Object.keys(cached.byLemmaPos).length, totalLemmas: lexique.length, cumulativeTokens: budget.cumulativeTokens });

    const normalized = batch.map((entry) => ({ lemma: entry.lemme, pos: entry.cgram, gender: entry.genre || undefined, ipa: sampaToIpa(entry.phon || '') }));
    const systemPrompt = 'You generate concise Canadian English glosses for French lemmas. Return strict JSON only.';
    const userPrompt = buildGlossPrompt(normalized);
    const geminiData = await callGemini('gemini-2.5-flash', systemPrompt, userPrompt, { temperature: 0.2, maxOutputTokens: 2048, responseMimeType: 'application/json' }, env);
    const parsed = parseLlmJson(extractGeminiText(geminiData)) as { glosses?: Array<{ lemma?: string; pos?: string; gloss?: string; exampleHint?: string }> };
    const out = Array.isArray(parsed?.glosses) ? parsed.glosses : [];

    let saved = 0;
    const savedGlosses: Array<{ lemma: string; pos: string; gloss: string; source: 'llm-fallback' }> = [];
    for (const g of out) {
      const lemma = String(g.lemma || '').trim(); const pos = String(g.pos || '').trim(); const gloss = String(g.gloss || '').trim();
      if (!lemma || !pos || !gloss) continue;
      const key = `${lemma}::${pos}`;
      if (cached.byLemmaPos[key]?.source === 'sample') continue;
      cached.byLemmaPos[key] = { lemma, pos, gloss, exampleHint: g.exampleHint ? String(g.exampleHint).trim() : undefined, source: 'llm-fallback' };
      savedGlosses.push({ lemma, pos, gloss, source: 'llm-fallback' });
      saved++;
    }

    const usage = Number((geminiData as any)?.usageMetadata?.totalTokenCount || 0);
    const cumulativeTokens = budget.cumulativeTokens + usage;
    await env.WIDGET_KV.put(BUILD_KEYS.glosses, JSON.stringify(cached));
    await env.WIDGET_KV.put(BUILD_KEYS.tokenBudget, JSON.stringify({ cumulativeTokens }));

    return json({ status: Object.keys(cached.byLemmaPos).length >= lexique.length ? 'done' : 'ok', batchIndex, lemmasGlossed: saved + wiktionarySaved, totalGlossed: Object.keys(cached.byLemmaPos).length, totalLemmas: lexique.length, cumulativeTokens, sources: { wiktionary: wiktionarySaved, llmFallback: saved }, glosses: [...wiktionaryGlosses, ...savedGlosses] });
  } catch (err) {
    return json({ error: 'gloss-batch failed', detail: err instanceof Error ? err.message : String(err) }, 500);
  }
}

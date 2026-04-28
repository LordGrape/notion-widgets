import { callGemini, extractGeminiText } from '../gemini';
import { parseLlmJson } from '../llm/parse';
import type { Env } from '../types';

interface GlossLemmaInput {
  lemma: string;
  pos: string;
  gender?: string;
  ipa: string;
}

interface GlossResponseItem {
  lemma: string;
  pos: string;
  gloss: string;
  exampleHint?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export async function handleGloss(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = (await request.json()) as { lemmas?: GlossLemmaInput[] };
    const lemmas = Array.isArray(body.lemmas) ? body.lemmas : [];
    if (!lemmas.length || lemmas.length > 50) {
      return jsonResponse({ error: 'lemmas must be an array with 1-50 rows' }, 400);
    }

    const normalized = lemmas.map((row) => ({
      lemma: String(row.lemma || '').trim(),
      pos: String(row.pos || '').trim(),
      gender: row.gender ? String(row.gender).trim() : undefined,
      ipa: String(row.ipa || '').trim(),
    }));

    if (normalized.some((row) => !row.lemma || !row.pos)) {
      return jsonResponse({ error: 'lemma and pos are required for each row' }, 400);
    }

    const systemPrompt =
      'You generate concise Canadian English glosses for French lemmas. Return strict JSON only.';
    const userPrompt =
      `For each French lemma below, return:\n` +
      `- gloss: 3 to 8 words in plain Canadian English\n` +
      `- exampleHint: optional one-sentence usage cue in Canadian English\n\n` +
      `Input rows:\n${JSON.stringify(normalized)}\n\n` +
      `Return JSON as:\n` +
      `{"glosses":[{"lemma":"...","pos":"...","gloss":"...","exampleHint":"..."}]}`;

    const geminiData = await callGemini(
      'gemini-2.5-flash',
      systemPrompt,
      userPrompt,
      {
        temperature: 0.2,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
      env,
    );

    const raw = extractGeminiText(geminiData);
    const parsed = parseLlmJson(raw) as { glosses?: GlossResponseItem[] };
    const glosses = Array.isArray(parsed?.glosses) ? parsed.glosses : [];

    const byKey = new Map<string, GlossResponseItem>();
    for (const g of glosses) {
      const lemma = String(g.lemma || '').trim();
      const pos = String(g.pos || '').trim();
      const gloss = String(g.gloss || '').trim();
      if (!lemma || !pos || !gloss) continue;
      const exampleHint = g.exampleHint ? String(g.exampleHint).trim() : undefined;
      byKey.set(`${lemma}::${pos}`, { lemma, pos, gloss, exampleHint });
    }

    const output: GlossResponseItem[] = [];
    for (const row of normalized) {
      const key = `${row.lemma}::${row.pos}`;
      const hit = byKey.get(key);
      if (hit) output.push(hit);
    }

    if (!output.length) {
      return jsonResponse({ error: 'No valid glosses returned by model' }, 502);
    }

    return jsonResponse({ glosses: output }, 200);
  } catch (err) {
    return jsonResponse(
      { error: 'Gloss generation failed', detail: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
}

import { getCorsHeaders } from "../cors";
import { callGemini, extractGeminiText } from "../gemini";
import type { Env, VisualRequest, VisualResponse } from "../types";
import { hashString } from "../utils/helpers";

const VISUAL_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...VISUAL_CORS_HEADERS
    }
  });
}

function isIncompleteMermaidOutput(s: string | null | undefined): boolean {
  if (!s || typeof s !== "string") return true;
  let t = s.trim();
  if (!t) return true;
  t = t.replace(/^```mermaid\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  const graphIdx = t.search(/\bgraph\s+(TD|LR)\b/i);
  if (graphIdx === -1) return true;
  t = t.slice(graphIdx).trim();
  const lines = t.split(/\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length < 2) return true;
  const last = lines[lines.length - 1];
  if (/(?:-->|--o)(?:\|[^|]*\|)?\s*$/i.test(last)) return true;
  if (/--\s*$/.test(last)) return true;
  return false;
}

export async function handleVisual(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await request.json()) as VisualRequest;
    const { prompt, modelAnswer, tier, course, topic, conceptA, conceptB } = body;

    if (!prompt || !modelAnswer) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    const cacheKey = `visual:${hashString(prompt + modelAnswer + (tier || ""))}`;
    const cached = await env.WIDGET_KV.get(cacheKey);
    if (cached) {
      if (isIncompleteMermaidOutput(cached)) {
        try {
          await env.WIDGET_KV.delete(cacheKey);
        } catch (delErr) {
          console.error("KV delete stale visual failed:", delErr instanceof Error ? delErr.message : String(delErr));
        }
      } else {
        return jsonResponse({ visual: cached }, 200);
      }
    }

    const visualPrompt = `You are generating a Mermaid.js diagram for a spaced repetition study card. The diagram is a SPATIAL MEMORY CUE — it helps the student recall the concept's structure at a glance. Simpler is better. A clean 5-node diagram beats a cluttered 10-node one.

COURSE: ${course || "Unknown"}
TOPIC: ${topic || "General"}
TIER: ${tier || "explain"}

QUESTION: ${prompt}
ANSWER: ${modelAnswer}
${conceptA ? `Concept A: ${conceptA}` : ""}
${conceptB ? `Concept B: ${conceptB}` : ""}

DIAGRAM STRATEGY BY TIER:
- quickfire: Show WHERE the fact sits — one parent node branching to 2-4 children. Classification or hierarchy.
- explain: Show the causal chain — 3-5 nodes in a linear or branching cause → effect sequence.
- apply: Show rule → facts mapping — the principle on top, 2-3 scenario elements below, connected by application arrows.
- distinguish: Show TWO parallel columns — Concept A vs Concept B, with 2-3 features each and one node highlighting the key difference.
- mock: Show the argument skeleton — thesis at top, 2-3 supporting points, one counter-argument.

STRICT RULES:
1. Output ONLY valid Mermaid markup. No code fences, no prose, no explanation.
2. Use graph TD or graph LR only. No mindmap, sequenceDiagram, pie, or other types.
3. TARGET 5-7 NODES. Absolute maximum 8. If you need more than 8, you are overcomplicating it — find the higher-level grouping.
4. Node labels: 2-5 words of REAL TERMS from the material. No single-letter abbreviations, no opaque acronyms. But keep labels SHORT — "Political Freedoms" not "The Five Instrumental Political Freedoms as Described by Sen".
5. Edge labels: 1-2 word relationship verbs (e.g. "causes", "requires", "contrasts"). Use -->|"label"| syntax. Not every edge needs a label — use them only where the relationship is non-obvious.
6. Every node must map to a real concept from the question or answer. No filler nodes.
7. Prefer DEPTH over BREADTH. A 4-node causal chain (A causes B causes C causes D) teaches more than a flat list of 8 siblings.
8. The diagram renders at thumbnail size first (180px tall). Design for that. If you squint and cannot read it, you have too many nodes.

EXAMPLE (for "What are the five instrumental freedoms in Sen's framework?"):

graph TD
    A["Development as Freedom"] --> B["Instrumental Freedoms"]
    B --> C["Political"]
    B --> D["Economic"]
    B --> E["Social"]
    B --> F["Transparency"]
    B --> G["Protective Security"]

EXAMPLE (for "How does trade diversion reduce welfare?"):

graph LR
    A["Regional Trade Agreement"] -->|"diverts"| B["Trade from Efficient Producer"]
    B -->|"to"| C["Less Efficient Member"]
    C -->|"raises"| D["Consumer Prices"]
    D -->|"reduces"| E["Aggregate Welfare"]`;

    let visual = "";
    let finishReason = "";
    try {
      const data = await callGemini(
        "gemini-2.5-flash",
        "You generate minimal Mermaid.js diagrams for study cards. Output ONLY valid Mermaid markup. graph TD or graph LR only. Target 5-7 nodes max 8. Short real-term labels. No code fences, no prose, no explanation.",
        visualPrompt,
        { temperature: 0.3, maxOutputTokens: 1024 },
        env
      );
      const cand = data?.candidates?.[0];
      finishReason = String(cand?.finishReason || "");
      visual = extractGeminiText(data);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return jsonResponse({ error: "Gemini API error", detail }, 502);
    }

    visual = visual.replace(/^```mermaid\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const graphIdx = visual.search(/\bgraph\s+(TD|LR)\b/i);
    if (graphIdx > 0) visual = visual.slice(graphIdx).trim();
    else if (graphIdx === -1) visual = "";

    if (finishReason === "MAX_TOKENS" || isIncompleteMermaidOutput(visual)) {
      console.warn("[visual] incomplete or truncated Mermaid; not caching", { finishReason, tail: visual && visual.slice(-80) });
      visual = "";
    }

    if (visual) {
      try {
        await env.WIDGET_KV.put(cacheKey, visual, { expirationTtl: 30 * 24 * 60 * 60 });
      } catch (kvErr) {
        const safeErr = kvErr as { message?: string; name?: string };
        console.error("KV VISUAL CACHE WRITE ERROR:", JSON.stringify({ message: safeErr.message, name: safeErr.name, key: cacheKey }));
      }
    }

    const response: VisualResponse = { visual: visual || null };
    return jsonResponse(response, 200);
  } catch (err) {
    return jsonResponse({ error: "Visual generation failed", detail: err instanceof Error ? err.message : String(err) }, 500);
  }
}

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js

// ── Helpers (AI routes) ──
function aiCorsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigins = ["https://lordgrape.github.io", "http://localhost", "http://127.0.0.1"];
  const isAllowed = allowedOrigins.some((o) => origin.startsWith(o));
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "https://lordgrape.github.io",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key",
    "Access-Control-Max-Age": "86400"
  };
}
__name(aiCorsHeaders, "aiCorsHeaders");

function requireWidgetKey(request, env) {
  const passphrase = request.headers.get("X-Widget-Key");
  return !!passphrase && passphrase === env.WIDGET_SECRET;
}
__name(requireWidgetKey, "requireWidgetKey");

async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256, "sha256");

async function rateLimit(env, request, limit = 20) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rateKey = `rate:${ip}:${Math.floor(Date.now() / 6e4)}`;
  const count = parseInt(await env.WIDGET_KV.get(rateKey)) || 0;
  if (count >= limit) return true;
  await env.WIDGET_KV.put(rateKey, String(count + 1), { expirationTtl: 120 });
  return false;
}
__name(rateLimit, "rateLimit");

function jsonWithHeaders(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, headers || {})
  });
}
__name(jsonWithHeaders, "jsonWithHeaders");

function extractGeminiText(data) {
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
}
__name(extractGeminiText, "extractGeminiText");

function cleanJsonString(s) {
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  s = s.replace(/,\s*([\]}])/g, "$1");
  return s;
}
__name(cleanJsonString, "cleanJsonString");

function parseJsonLoose(rawText) {
  try {
    return JSON.parse(rawText);
  } catch (e) {
    try {
      return JSON.parse(cleanJsonString(rawText));
    } catch (e2) {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        return JSON.parse(cleanJsonString(match[0]));
      } catch (e3) {
        return null;
      }
    }
  }
}
__name(parseJsonLoose, "parseJsonLoose");

var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── Shared preflight for AI routes ──
    if (request.method === "OPTIONS" && url.pathname.startsWith("/studyengine/")) {
      return new Response(null, { status: 204, headers: aiCorsHeaders(request) });
    }

    // ── AI Grading Route ──
    if (url.pathname === "/studyengine/grade") {
      const cors = aiCorsHeaders(request);

      if (request.method !== "POST") {
        return jsonWithHeaders({ error: "Method not allowed" }, 405, cors);
      }

      if (!requireWidgetKey(request, env)) {
        return jsonWithHeaders({ error: "Unauthorized" }, 401, cors);
      }

      if (await rateLimit(env, request, 30)) {
        return jsonWithHeaders({ error: "Rate limited" }, 429, cors);
      }

      try {
        const body = await request.json();
        const { prompt, modelAnswer, userResponse, tier, course, topic, conceptA, conceptB } = body;

        if (!prompt || !modelAnswer || !userResponse) {
          return jsonWithHeaders({ error: "Missing required fields" }, 400, cors);
        }

        const tierInstructions = {
          quickfire: `This is a QUICK FIRE (cued recall) item. The student must retrieve specific facts from memory.
Grading priorities:
- Accuracy is paramount. The response must contain the correct key facts, terms, definitions, or claims.
- Depth is lightly weighted. Brief but correct answers are perfectly acceptable. Do not penalise conciseness.
- Clarity matters only if ambiguity makes correctness unclear.
A factually correct one-sentence answer can score 2/2/2.`,

          explain: `This is an EXPLAIN IT (conceptual understanding) item. The student must demonstrate WHY something is true, not just WHAT is true.
Grading priorities:
- Accuracy: Are the core claims factually correct? Are mechanisms, causes, or theoretical foundations correctly identified?
- Depth: Does the response go beyond surface description? Does it explain underlying logic, causal chains, conditions, or implications? A response that merely restates the model answer in simpler terms without explaining the reasoning scores low on depth.
- Clarity: Is the explanation structured logically? Could a peer follow the reasoning without additional context?`,

          apply: `This is an APPLY IT (application to scenario) item. The student must apply a concept, rule, or framework to a specific factual scenario.
Grading priorities:
- Accuracy: Is the correct principle identified? Are the facts of the scenario correctly mapped to the rule or framework?
- Depth: Does the response demonstrate genuine transfer? Not just restating the rule, but showing HOW it operates on THESE specific facts. Look for: rule identification, fact extraction, application reasoning, conclusion.
- Clarity: Is the application structured? An unstructured stream-of-consciousness response that reaches the right answer still loses clarity points.`,

          distinguish: `This is a DISTINGUISH (discrimination) item. Two similar concepts are presented. The student must identify which applies to a given scenario and justify why the other does not.
The two concepts are:
- Concept A: ${conceptA || "Not specified"}
- Concept B: ${conceptB || "Not specified"}
Grading priorities:
- Accuracy: Is the correct concept identified as applying to the scenario?
- Depth: Does the response articulate the SPECIFIC distinguishing criteria between the two concepts? Does it explain why the chosen concept fits AND why the alternative does not? Both directions matter.
- Clarity: Is the comparative reasoning structured? The best responses explicitly state the distinguishing feature, then apply it to the scenario facts.
- Discrimination: Does the student demonstrate they understand the boundary between these two concepts, not just one of them in isolation?`,

          mock: `This is a MOCK EXAM item. The student wrote under time pressure. Grade as a real exam response, but acknowledge the time constraint.
Grading priorities:
- Accuracy: Are the main issues, rules, theories, or frameworks correctly identified and stated? Minor omissions are acceptable under time pressure; fundamental errors are not.
- Depth: Is the analysis thorough GIVEN the time constraint? Are multiple angles, counter-arguments, or competing considerations addressed? A response that identifies the right issues but only analyses one superficially scores low on depth.
- Clarity: Is the response organised with clear structure? Under time pressure, structure matters MORE because the grader (in a real exam) needs to find your points quickly.`
        };

        const isDistinguish = tier === "distinguish";

        const gradingPrompt = `You are an expert academic grader embedded in a spaced repetition study engine. Your role is to provide precise, calibrated, evidence-based feedback that helps the student close the gap between their current understanding and the target knowledge.

COURSE: ${course || "General"}
TOPIC: ${topic || "General"}
TIER: ${tier || "explain"}

${tierInstructions[tier] || tierInstructions.explain}

QUESTION/PROMPT:
${prompt}

MODEL ANSWER (the reference standard — grade against this, not your own knowledge):
${modelAnswer}

STUDENT RESPONSE:
${userResponse}

GRADING PROTOCOL:
Before scoring, you MUST perform this analysis:
1. Identify what the student got RIGHT — cite specific phrases or claims from their response.
2. Identify what the student MISSED or got WRONG — compare against the model answer point by point.
3. Only THEN assign scores based on your analysis.

SCORING RULES:
- Score each dimension 0, 1, or 2:
  - 0 = Missing, incorrect, or fundamentally flawed. The student either did not address this dimension or made critical errors.
  - 1 = Partially correct or incomplete. The student demonstrated some understanding but missed important elements, lacked specificity, or made non-critical errors.
  - 2 = Complete, accurate, and well-articulated. The response fully addresses this dimension relative to the model answer.
- Be CALIBRATED, not generous. A score of 2 means the student's response is genuinely strong on that dimension, not merely "acceptable." Most partial responses should score 1.
- If the student's response is correct but uses a different framework or terminology than the model answer, give credit for accuracy but note the divergence.
- Do NOT penalise spelling, grammar, or formatting unless it creates genuine ambiguity.
- Each feedback sentence MUST reference something the student actually wrote (or failed to write). No generic praise or criticism.

IMPROVEMENT SUGGESTION RULES:
- Give ONE specific, actionable suggestion. Not "study more" or "add more detail" — tell them exactly WHAT to add, fix, or restructure.
- Frame it as what would move them from their current score to the next level.

Respond in this EXACT JSON format and nothing else:
{
  "accuracy": { "score": 0, "feedback": "One specific sentence referencing the student's response." },
  "depth": { "score": 0, "feedback": "One specific sentence referencing the student's response." },
  "clarity": { "score": 0, "feedback": "One specific sentence referencing the student's response." },${isDistinguish ? '\n  "discrimination": { "score": 0, "feedback": "One specific sentence about whether the student correctly distinguished between the two concepts." },' : ''}
  "improvement": "One specific, actionable sentence.",
  "summary": "One sentence overall assessment that tells the student where they stand."
}`;

        const geminiRes = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + env.GEMINI_API_KEY,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: gradingPrompt }] }],
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 2048,
                responseMimeType: "application/json",
                responseSchema: {
                  type: "object",
                  properties: {
                    accuracy: {
                      type: "object",
                      properties: {
                        score: { type: "integer" },
                        feedback: { type: "string" }
                      },
                      required: ["score", "feedback"]
                    },
                    depth: {
                      type: "object",
                      properties: {
                        score: { type: "integer" },
                        feedback: { type: "string" }
                      },
                      required: ["score", "feedback"]
                    },
                    clarity: {
                      type: "object",
                      properties: {
                        score: { type: "integer" },
                        feedback: { type: "string" }
                      },
                      required: ["score", "feedback"]
                    },
                    discrimination: {
                      type: "object",
                      properties: {
                        score: { type: "integer" },
                        feedback: { type: "string" }
                      },
                      required: ["score", "feedback"]
                    },
                    improvement: { type: "string" },
                    summary: { type: "string" }
                  },
                  required: ["accuracy", "depth", "clarity", "improvement", "summary"]
                }
              }
            })
          }
        );

        if (!geminiRes.ok) {
          const errText = await geminiRes.text();
          return jsonWithHeaders({ error: "Gemini API error", detail: errText }, 502, cors);
        }

        const geminiData = await geminiRes.json();
        const rawText = extractGeminiText(geminiData);
        let grading = parseJsonLoose(rawText);

        if (!grading || grading.accuracy === undefined) {
          return jsonWithHeaders({ error: "Failed to parse grading response", raw: rawText }, 500, cors);
        }

        // Calculate FSRS rating from scores
        const accScore = grading.accuracy?.score || 0;
        const depScore = grading.depth?.score || 0;
        const claScore = grading.clarity?.score || 0;
        const disScore = grading.discrimination?.score || 0;

        let total, maxTotal;
        if (isDistinguish) {
          total = accScore + depScore + claScore + disScore;
          maxTotal = 8;
        } else {
          total = accScore + depScore + claScore;
          maxTotal = 6;
        }

        // Normalised ratio for consistent FSRS mapping across 3 or 4 dimensions
        const ratio = total / maxTotal;
        let fsrsRating;
        if (ratio <= 0.17) fsrsRating = 1;       // Again (0-1 out of 6, or 0-1 out of 8)
        else if (ratio <= 0.5) fsrsRating = 2;    // Hard
        else if (ratio <= 0.83) fsrsRating = 3;   // Good
        else fsrsRating = 4;                       // Easy

        grading.totalScore = total;
        grading.maxScore = maxTotal;
        grading.fsrsRating = fsrsRating;

        return jsonWithHeaders(grading, 200, cors);

      } catch (err) {
        return jsonWithHeaders({ error: "Internal error", detail: err.message }, 500, cors);
      }
    }

    // ── Dual Coding Visual Generation Route ──
    if (url.pathname === "/studyengine/visual") {
      const cors = aiCorsHeaders(request);

      if (request.method !== "POST") {
        return jsonWithHeaders({ error: "Method not allowed" }, 405, cors);
      }

      if (!requireWidgetKey(request, env)) {
        return jsonWithHeaders({ error: "Unauthorized" }, 401, cors);
      }

      if (await rateLimit(env, request, 30)) {
        return jsonWithHeaders({ error: "Rate limited" }, 429, cors);
      }

      try {
        const body = await request.json();
        const { prompt, modelAnswer, tier, course, topic, conceptA, conceptB } = body;

        if (!prompt || !modelAnswer) {
          return jsonWithHeaders({ error: "Missing prompt or modelAnswer" }, 400, cors);
        }

        const cacheKey = "visual:" + await sha256(prompt + modelAnswer + (tier || ""));
        const cached = await env.WIDGET_KV.get(cacheKey, "json");
        if (cached) {
          return new Response(JSON.stringify(cached), {
            status: 200,
            headers: Object.assign({ "Content-Type": "application/json", "X-Cache": "HIT" }, cors)
          });
        }

        const tierContext = {
          quickfire: "Cued recall of facts/definitions. Visuals should show spatial layout of enumerated elements, labelled structures, or simple concept groupings.",
          explain: "Conceptual understanding. Visuals should show causal chains, mechanism flows, or hierarchical relationships that the verbal answer describes sequentially.",
          apply: "Application to a scenario. Visuals should show decision trees, rule-application flowcharts, or step-by-step analysis paths.",
          distinguish: `Discrimination between two similar concepts: "${conceptA || "Concept A"}" vs "${conceptB || "Concept B"}". Visuals should show parallel branches from a common root, highlighting where the concepts diverge.`,
          mock: "Full synthesis under time pressure. Visuals should show issue maps or multi-branch analysis frameworks connecting sub-topics."
        };

        const visualPrompt = `You are a visual learning specialist in a spaced repetition study engine. Your task: decide whether this study card benefits from a Mermaid diagram, and if so, generate one.

COURSE: ${course || "General"}
TOPIC: ${topic || "General"}
TIER: ${tier || "explain"}
TIER CONTEXT: ${tierContext[tier] || tierContext.explain}

QUESTION/PROMPT:
${prompt}

MODEL ANSWER:
${modelAnswer}

DECISION CRITERIA — return null for visual when:
- Pure definitions with no relational structure (e.g., "What is stare decisis?")
- Abstract philosophical concepts with no procedural or structural component
- Single-fact answers (a date, a name, a number)
- The model answer is too short (under 20 words) to have meaningful structure

DECISION CRITERIA — generate a diagram when:
- Processes with sequential steps → flowchart TD
- Causal chains (A causes B causes C) → flowchart TD
- Hierarchies or taxonomies → flowchart TD with subgraphs
- Comparisons of 2+ concepts → flowchart LR with parallel branches
- Timelines or chronological sequences → flowchart LR
- Decision trees or legal tests with branching → flowchart TD with diamond decisions
- Enumerated elements that have spatial relationships → flowchart TD

MERMAID SYNTAX RULES:
- Use flowchart TD or flowchart LR ONLY
- Wrap ALL node text in double quotes: A["Node text"]
- Keep node text under 8 words — the diagram shows STRUCTURE, not full content
- Use meaningful node IDs: R1, STEP2, ISSUE1 — not A, B, C
- Maximum 12 nodes — more becomes unreadable at embed size
- Use subgraph for grouping related concepts: subgraph TITLE ... end
- Use <br> for line breaks inside node labels
- Do NOT use parentheses, colons, semicolons, or special chars inside node labels
- No styling/classDef — keep it clean for the widget CSS to style

COMPLEMENTARITY RULE:
The diagram MUST encode spatial relationships (sequence, hierarchy, branching, comparison) that the text describes verbally. If the diagram would just be labelled boxes restating the model answer text, return null. The visual must add a STRUCTURAL dimension the text alone does not convey.`;

        const geminiRes = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + env.GEMINI_API_KEY,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: visualPrompt }] }],
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 1024,
                responseMimeType: "application/json",
                responseSchema: {
                  type: "object",
                  properties: {
                    shouldGenerate: { type: "boolean" },
                    reason: { type: "string" },
                    diagramType: { type: ["string", "null"] },
                    mermaid: { type: ["string", "null"] }
                  },
                  required: ["shouldGenerate", "reason"]
                }
              }
            })
          }
        );

        if (!geminiRes.ok) {
          const errText = await geminiRes.text();
          return jsonWithHeaders({ error: "Gemini API error", detail: errText }, 502, cors);
        }

        const geminiData = await geminiRes.json();
        const rawText = extractGeminiText(geminiData);
        const result = parseJsonLoose(rawText) || { shouldGenerate: false, reason: "Failed to parse AI response", mermaid: null, diagramType: null };

        const output = {
          visual: result.shouldGenerate ? result.mermaid || null : null,
          diagramType: result.shouldGenerate ? result.diagramType || null : null,
          reason: result.reason || "No reason provided"
        };

        await env.WIDGET_KV.put(cacheKey, JSON.stringify(output), { expirationTtl: 2592e3 });

        return new Response(JSON.stringify(output), {
          status: 200,
          headers: Object.assign({ "Content-Type": "application/json", "X-Cache": "MISS" }, cors)
        });
      } catch (err) {
        return jsonWithHeaders({ error: "Internal error", detail: err.message }, 500, cors);
      }
    }

    // ── Existing routes below (unchanged) ──

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const passphrase = request.headers.get("X-Widget-Key");
    if (!passphrase || passphrase !== env.WIDGET_SECRET) {
      return json({ error: "Unauthorized" }, 401);
    }

    const segments = url.pathname.replace(/^\/+/, "").split("/");
    const route = segments[0];
    const key = segments.slice(1).join("/");

    if (route === "state" && key) {
      if (request.method === "GET") {
        const value = await env.WIDGET_KV.get(key, "json");
        return json({ key, value: value ?? null });
      }
      if (request.method === "PUT") {
        const body = await request.json();
        const newState = body.value || {};
        if (key === "dragon") {
          const existing = await env.WIDGET_KV.get(key, "json");
          if (existing) {
            const getVal = (obj, k) => {
              if (!obj || !obj[k]) return 0;
              const entry = obj[k];
              if (typeof entry === "object" && entry.hasOwnProperty("value")) return Number(entry.value) || 0;
              return Number(entry) || 0;
            };
            const oldXP = getVal(existing, "xp");
            const newXP = getVal(newState, "xp");
            const delta = newXP - oldXP;
            if (delta < 0 && newXP !== 0) {
              if (newState.xp && typeof newState.xp === "object") {
                newState.xp.value = oldXP;
              } else {
                newState.xp = oldXP;
              }
            }
            if (delta > 2000) {
              const capped = oldXP + 2000;
              if (newState.xp && typeof newState.xp === "object") {
                newState.xp.value = capped;
              } else {
                newState.xp = capped;
              }
            }
          }
        }
        await env.WIDGET_KV.put(key, JSON.stringify(newState));
        return json({ key, ok: true });
      }
      return json({ error: "Method not allowed" }, 405);
    }

    if (route === "notion") {
      return handleNotion(key, request, env);
    }

    return json({ error: "Not found" }, 404);
  }
};

async function handleNotion(resource, request, env) {
  if (!env.NOTION_TOKEN) {
    return json({ error: "Notion integration not configured" }, 501);
  }
  if (resource === "milestones" && request.method === "GET") {
    const url = new URL(request.url);
    const dbId = url.searchParams.get("db") || env.NOTION_DB_ID || "";
    if (!dbId) return json({ error: "Missing db \u2014 set NOTION_DB_ID secret or pass ?db=" }, 400);
    const today = new Date().toISOString().split("T")[0];
    const res = await fetch("https://api.notion.com/v1/databases/" + dbId + "/query", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.NOTION_TOKEN,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        filter: {
          and: [
            { property: "date", date: { on_or_after: today } },
            { property: "assignment", select: { is_not_empty: true } }
          ]
        },
        sorts: [{ property: "date", direction: "ascending" }],
        page_size: 30
      })
    });
    if (!res.ok) {
      const err = await res.text();
      return json({ error: "Notion API error", detail: err }, res.status);
    }
    const data = await res.json();
    const items = data.results.map(function(page) {
      const props = page.properties;
      const titleProp = props["lecture/assignment"];
      const title = titleProp && titleProp.title && titleProp.title.length ? titleProp.title.map(function(t) {
        return t.plain_text;
      }).join("") : "";
      const dateProp = props["date"];
      const date = dateProp && dateProp.date ? dateProp.date.start : null;
      const dateEnd = dateProp && dateProp.date ? dateProp.date.end : null;
      const catProp = props["assignment"];
      const category = catProp && catProp.select ? catProp.select.name : "";
      const progProp = props["progress"];
      const progress = progProp && progProp.status ? progProp.status.name : "";
      const worthProp = props["worth"];
      const worth = worthProp && worthProp.number !== null ? worthProp.number : null;
      const notesProp = props["notes"];
      const notes = notesProp && notesProp.rich_text && notesProp.rich_text.length ? notesProp.rich_text.map(function(t) {
        return t.plain_text;
      }).join("").slice(0, 120) : "";
      return {
        id: page.id,
        title,
        date,
        dateEnd,
        category,
        progress,
        worth,
        notes
      };
    });
    return json({ items });
  }
  return json({ error: "Unknown Notion resource" }, 404);
}
__name(handleNotion, "handleNotion");

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key",
    "Access-Control-Max-Age": "86400"
  };
}
__name(corsHeaders, "corsHeaders");

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders())
  });
}
__name(json, "json");

export {
  worker_default as default
};
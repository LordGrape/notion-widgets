// worker.js — Cloudflare Worker for widget state sync + AI grading
// Bindings: WIDGET_KV (KV namespace)
// Secrets: WIDGET_SECRET, GEMINI_API_KEY, GOOGLE_TTS_KEY, NOTION_TOKEN (optional), NOTION_DB_ID (optional)

export default {
  async fetch(request, env) {
    // ── Global CORS preflight — must run before auth or any route branch ──
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    const url = new URL(request.url);

    // ── Socratic Tutor Route ──
    if (url.pathname === "/studyengine/tutor") {
      const tutorCorsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key",
        "Access-Control-Max-Age": "86400"
      };

      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405, headers: { ...tutorCorsHeaders, "Content-Type": "application/json" }
        });
      }

      function cleanJsonString(s) {
        s = s.replace(/^[\s\S]*?(?=\{)/m, "");
        s = s.replace(/\}[\s\S]*$/, "}");
        s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
        s = s.replace(/,\s*([\]}])/g, "$1");
        s = s.replace(/[\x00-\x1f]/g, " ");
        return s;
      }
      function tryParse(s) {
        try { return JSON.parse(s); } catch (e) { return null; }
      }

      const TUTOR_MODES = ["socratic", "quick", "teach", "insight", "acknowledge"];

      try {
        const body = await request.json();
        const mode = body.mode;
        const item = body.item || {};
        const userName = String(body.userName || "there").trim() || "there";
        const userResponse = body.userResponse != null ? String(body.userResponse) : "";
        const conversation = Array.isArray(body.conversation) ? body.conversation : [];
        const context = body.context && typeof body.context === "object" ? body.context : {};

        if (!mode || !item.prompt || !item.modelAnswer) {
          return new Response(JSON.stringify({ error: "Missing required fields" }), {
            status: 400, headers: { ...tutorCorsHeaders, "Content-Type": "application/json" }
          });
        }

        if (!TUTOR_MODES.includes(mode)) {
          return new Response(JSON.stringify({ error: "Invalid mode" }), {
            status: 400, headers: { ...tutorCorsHeaders, "Content-Type": "application/json" }
          });
        }

        const needsUserResponse = mode === "socratic" || mode === "quick" || mode === "acknowledge";
        if (needsUserResponse && !userResponse.trim()) {
          return new Response(JSON.stringify({ error: "userResponse required for this mode" }), {
            status: 400, headers: { ...tutorCorsHeaders, "Content-Type": "application/json" }
          });
        }

        const modelMap = {
          flash: "gemini-2.5-flash",
          pro: "gemini-2.5-pro"
        };
        const selectedModel = modelMap[body.model] || "gemini-2.5-flash";
        const geminiUrl =
          "https://generativelanguage.googleapis.com/v1beta/models/" +
          selectedModel +
          ":generateContent?key=" +
          env.GEMINI_API_KEY;

        const coursePhrase = item.course || "university-level courses";
        const systemPrompt =
          `You are an expert tutor embedded in ${userName}'s personal study engine.\n\n` +
          "You are warm but rigorous. You use their name occasionally (not every message — roughly every other turn).\n\n" +
          "You never give empty praise — when you acknowledge something correct, you cite the specific claim from their response.\n\n" +
          "You believe struggling to retrieve is where learning happens, so you ASK QUESTIONS rather than explain whenever possible. " +
          "You only explain directly when the student has no foothold to build from (e.g., \"Don't Know\" path).\n\n" +
          `This student studies ${coursePhrase} at the university level. Their material involves open-ended reasoning, not binary answers. ` +
          "You evaluate reasoning quality, analytical structure, and evidence usage — not just factual accuracy. Multiple valid analytical approaches can exist.\n\n" +
          "When the student gets something wrong, you don't say \"incorrect.\" You ask a question that leads them to see the error themselves.\n\n" +
          "You keep turns concise: 3-5 sentences max. Never lecture. The student should be writing more than you.\n\n" +
          "Tone: like a sharp TA who genuinely wants the student to succeed. Respect their intelligence. Challenge them.";

        const modeInstructions = {
          socratic:
            `MODE: Socratic dialogue.\n\n` +
            "The student has submitted a response to a study question. Your job is to identify the SINGLE most important gap between their answer and the model answer, " +
            "then ask ONE targeted follow-up question that forces the student to bridge that gap. Do NOT reveal the correct answer. Do NOT explain. Ask a question.\n\n" +
            "If this is a follow-up turn (conversation history exists), evaluate whether the student's latest response closes the gap. " +
            "If yes: confirm with a specific tie-back to their words, mark isComplete true, provide suggestedRating (1-4 based on overall quality across turns), " +
            "and optionally provide a reconstructionPrompt if the student struggled (e.g., \"Now put the full answer together in your own words\"). " +
            "If partially: narrow the scaffold with a more specific hint question, keep isComplete false. " +
            "If this is the 3rd turn (conversation has 4+ entries): always mark isComplete true and provide a synthesis that ties together what the student got right and wrong across all turns.\n\n" +
            "If the student used a different but valid analytical framework than the model answer, acknowledge it: " +
            "\"Your response uses a different analytical lens than the model answer, but the reasoning is internally coherent. Here's what the model answer emphasises...\"\n\n" +
            "Provide 2-5 inline annotations on the student's original response (from their first submission, not follow-up turns). " +
            'Tags: "accurate", "partial", "inaccurate", "missing", "insight".',

          quick:
            `MODE: Quick feedback (single turn).\n\n` +
            "Provide four components: (1) What they got right — one sentence citing their specific words. " +
            "(2) What's missing — the single most important gap. " +
            "(3) The bridge — one sentence connecting what they knew to what they missed. " +
            "(4) A quick-check question with its answer for self-testing. " +
            "Also provide a suggested FSRS rating (1-4) and annotations.",

          teach:
            `MODE: Teach (Don't Know path).\n\n` +
            "The student doesn't know the answer. Your job is to TEACH, not grade. Start from whatever they might know and build up. " +
            "Ask a simple entry question that finds their foothold. " +
            "If conversation history exists: they've responded to your previous question — anchor on what they offered and extend to the next piece. " +
            "On the final turn (3rd, or conversation has 4+ entries): ask them to reconstruct the full answer from memory (\"Now put it together for me — ...\"). " +
            "Mark isComplete true. Provide suggestedRating based on reconstruction quality (1 if they still can't, 2 if partial, 3 if good).",

          insight:
            `MODE: Insight (Quick Fire tier).\n\n` +
            "The student has already seen the model answer. Provide ONE targeted insight line (max 2 sentences) that gives the student a mental anchor — " +
            "the key distinguishing feature, a vivid analogy, or the \"why\" behind the fact. This is not grading. This is encoding assistance.",

          acknowledge:
            `MODE: Acknowledge strong answer.\n\n` +
            "The student's answer is strong — it hits all key points from the model answer. " +
            "Acknowledge what was specifically good (cite their exact phrases), then ask ONE extension question that pushes BEYOND the model answer — " +
            "deeper analysis, a counter-argument, a specific mechanism, a real-world application. " +
            "This extends encoding without wasting time on material they already know."
        };

        const responseSchemas = {
          socratic: `{
  "tutorMessage": "3-5 sentences. Acknowledge what's right, identify the gap.",
  "followUpQuestion": "One targeted question. Null if isComplete.",
  "isComplete": false,
  "suggestedRating": null,
  "annotations": [{ "text": "exact phrase from student", "tag": "accurate|partial|inaccurate|missing|insight", "note": "brief explanation" }],
  "reconstructionPrompt": null
}`,
          quick: `{
  "correct": "One sentence citing student's words.",
  "missing": "One sentence — the key gap.",
  "bridge": "One sentence connecting known to unknown.",
  "quickCheck": { "question": "...", "answer": "..." },
  "suggestedRating": 3,
  "annotations": [{ "text": "...", "tag": "...", "note": "..." }]
}`,
          teach: `{
  "tutorMessage": "3-5 sentences. Acknowledge what's right, identify the gap.",
  "followUpQuestion": "One targeted question. Null if isComplete.",
  "isComplete": false,
  "suggestedRating": null,
  "annotations": [{ "text": "exact phrase from student", "tag": "accurate|partial|inaccurate|missing|insight", "note": "brief explanation" }],
  "reconstructionPrompt": null
}`,
          insight: `{
  "insight": "One or two sentences — the key anchor for this fact.",
  "followUpQuestion": "Optional. A quick self-test question if the item is important. Null otherwise.",
  "followUpAnswer": "The answer to the follow-up. Null if no question."
}`,
          acknowledge: `{
  "acknowledgment": "2-3 sentences citing specific strengths.",
  "extensionQuestion": "One question pushing beyond the model answer.",
  "isComplete": false,
  "suggestedRating": null
}`
        };

        const tier = item.tier || "explain";
        let itemBlock =
          `QUESTION: ${item.prompt}\n` +
          `MODEL ANSWER: ${item.modelAnswer}\n` +
          `TIER: ${tier}\n` +
          `TOPIC: ${item.topic || ""}\n`;

        if (tier === "distinguish") {
          itemBlock += `CONCEPT A: ${item.conceptA || ""}\nCONCEPT B: ${item.conceptB || ""}\n`;
        }
        if (tier === "apply" && item.task) {
          itemBlock += `TASK: ${item.task}\n`;
        }

        let userBlock = `STUDENT'S RESPONSE: ${userResponse}\n`;

        if (conversation.length > 0) {
          userBlock += "CONVERSATION SO FAR:\n";
          for (const turn of conversation) {
            const role = turn.role === "tutor" ? "Tutor" : "Student";
            const text = turn.text != null ? String(turn.text) : "";
            userBlock += `${role}: ${text}\n`;
          }
        }

        const lapses = context.lapses != null ? context.lapses : 0;
        const sessionRetryCount = context.sessionRetryCount != null ? context.sessionRetryCount : 0;
        const recentAvgRating = context.recentAvgRating != null ? context.recentAvgRating : 2.5;

        userBlock +=
          `Context: This card has been forgotten ${lapses} times. Session retry: ${sessionRetryCount}. ` +
          `Student's recent avg rating: ${recentAvgRating}.\n\n` +
          "Respond in EXACT JSON format and nothing else:\n" +
          responseSchemas[mode];

        const fullPrompt =
          systemPrompt +
          "\n\n---\n\n" +
          modeInstructions[mode] +
          "\n\n---\n\n" +
          itemBlock +
          "\n" +
          userBlock;

        const geminiRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
            generationConfig: {
              temperature: 0.35,
              maxOutputTokens: 2048,
              responseMimeType: "application/json"
            }
          })
        });

        if (!geminiRes.ok) {
          const errText = await geminiRes.text();
          return new Response(JSON.stringify({ error: "Gemini API error", detail: errText }), {
            status: 502, headers: { ...tutorCorsHeaders, "Content-Type": "application/json" }
          });
        }

        const geminiData = await geminiRes.json();
        const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

        const parsed =
          tryParse(rawText) ||
          tryParse(cleanJsonString(rawText)) ||
          (() => {
            const m = rawText.match(/\{[\s\S]*\}/);
            return m ? tryParse(cleanJsonString(m[0])) : null;
          })();

        if (!parsed || typeof parsed !== "object") {
          return new Response(
            JSON.stringify({ error: "Failed to parse tutor response", raw: rawText }),
            { status: 500, headers: { ...tutorCorsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(JSON.stringify(parsed), {
          status: 200, headers: { ...tutorCorsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Internal error", detail: err.message }), {
          status: 500, headers: { ...tutorCorsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ── AI Grading Route ──
    if (url.pathname === "/studyengine/grade") {
      const gradeCorsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key",
        "Access-Control-Max-Age": "86400"
      };

      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405, headers: { ...gradeCorsHeaders, "Content-Type": "application/json" }
        });
      }

      try {
        const body = await request.json();
        const { prompt, modelAnswer, userResponse, tier, course, topic, conceptA, conceptB, mode } = body;
        const essayOutline = body.essayOutline || "";
        const isEssayMode = essayOutline.length > 0;

        function cleanJsonString(s) {
          s = s.replace(/^[\s\S]*?(?=\{)/m, "");
          s = s.replace(/\}[\s\S]*$/, "}");
          s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
          s = s.replace(/,\s*([\]}])/g, "$1");
          s = s.replace(/[\x00-\x1f]/g, " ");
          return s;
        }
        function tryParse(s) {
          try { return JSON.parse(s); } catch (e) { return null; }
        }

        if (!prompt || !modelAnswer) {
          return new Response(JSON.stringify({ error: "Missing required fields" }), {
            status: 400, headers: { ...gradeCorsHeaders, "Content-Type": "application/json" }
          });
        }

        if (mode === "explain") {
          const explainPrompt = `You are a patient, expert tutor embedded in a spaced repetition study engine. The student just admitted they don't know the answer to this question. Your job is NOT to grade — it is to TEACH. Help them understand WHY the answer is what it is so they encode it deeply for next time.

COURSE: ${course || "General"}
TOPIC: ${topic || "General"}
TIER: ${tier || "explain"}

QUESTION/PROMPT:
${prompt}

MODEL ANSWER (the correct answer):
${modelAnswer}
${conceptA ? `\nConcept A: ${conceptA}` : ""}${conceptB ? `\nConcept B: ${conceptB}` : ""}

INSTRUCTIONS:
1. Explain the answer in a way that builds understanding, not just states facts. Focus on the WHY and HOW.
2. Break the model answer into 3-5 key points the student should remember.
3. Provide a memory hook — a vivid analogy, mnemonic, or mental image that makes the answer stick.
4. Keep it concise. The student will see this alongside the model answer.

Respond in this EXACT JSON format and nothing else:
{
  "explanation": "2-4 sentences explaining WHY this is the answer. Focus on causal logic, not just restating facts.",
  "keyPoints": ["Key point 1", "Key point 2", "Key point 3"],
  "memoryHook": "A vivid analogy, mnemonic, or mental image to aid recall."
}`;

          const explainRes = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + env.GEMINI_API_KEY,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: explainPrompt }] }],
                generationConfig: { temperature: 0.4, maxOutputTokens: 1024, responseMimeType: "application/json" }
              })
            }
          );

          if (!explainRes.ok) {
            const errText = await explainRes.text();
            return new Response(JSON.stringify({ error: "Gemini API error", detail: errText }), {
              status: 502, headers: { ...gradeCorsHeaders, "Content-Type": "application/json" }
            });
          }

          const explainData = await explainRes.json();
          const explainRaw = explainData?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
          let explainResult = tryParse(explainRaw)
            || tryParse(cleanJsonString(explainRaw))
            || (() => { const m = explainRaw.match(/\{[\s\S]*\}/); return m ? tryParse(cleanJsonString(m[0])) : null; })();

          if (!explainResult || typeof explainResult !== "object") {
            explainResult = { explanation: "Could not generate explanation.", keyPoints: [], memoryHook: "" };
          }

          return new Response(JSON.stringify(explainResult), {
            status: 200, headers: { ...gradeCorsHeaders, "Content-Type": "application/json" }
          });
        }

        if (!userResponse) {
          return new Response(JSON.stringify({ error: "Missing required fields" }), {
            status: 400, headers: { ...gradeCorsHeaders, "Content-Type": "application/json" }
          });
        }

        // ── Tier-specific grading instructions (standard mode) ──
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
        let gradingPrompt;

        if (isEssayMode) {
          // ── Essay Mode: 5-dimension rubric ──
          gradingPrompt = `You are an expert academic essay grader for a university-level political science / law course, embedded in a spaced repetition study engine. The student was given a prompt, wrote an outline, then wrote a full essay response under time pressure.

COURSE: ${course || "General"}
TOPIC: ${topic || "General"}

Grade the essay on FIVE dimensions, each scored 0 (weak), 1 (adequate), or 2 (strong):

1. **Thesis Clarity** — Does the essay open with a clear, arguable thesis that directly answers the prompt? Score 0 if no thesis or thesis is vague. Score 1 if thesis exists but could be sharper. Score 2 if thesis is specific, arguable, and clearly stated.

2. **Evidence Density** — Does the essay use specific evidence (dates, statistics, case names, theorist names, institutional details)? Score 0 if mostly vague assertions. Score 1 if some specific evidence but gaps. Score 2 if consistently grounded in specific data points.

3. **Argument Structure** — Does the essay follow a logical progression (intro → body paragraphs with topic sentences → conclusion that synthesizes)? Does it follow the outline the student wrote beforehand? Score 0 if disorganized or no clear structure. Score 1 if structure exists but transitions are weak or outline was abandoned. Score 2 if well-organized with clear paragraph logic that follows the outline.

4. **Analytical Depth** — Does the essay go beyond description to explain WHY and HOW? Does it connect evidence to the thesis? Score 0 if purely descriptive. Score 1 if some analysis but surface-level. Score 2 if consistently analytical with causal reasoning.

5. **Conclusion Quality** — Does the conclusion synthesize (not just summarize) the argument? Does it answer the original question directly? Score 0 if missing or just repeats the intro. Score 1 if present but thin. Score 2 if synthesizes the argument and adds insight.

GRADING PROTOCOL:
Before scoring, you MUST:
1. Identify what the student got RIGHT — cite specific phrases or claims from their response.
2. Identify what the student MISSED or got WRONG — compare against the model answer point by point.
3. Check whether the essay followed the outline — note divergences.
4. Only THEN assign scores based on your analysis.

SCORING RULES:
- Be CALIBRATED, not generous. A score of 2 means genuinely strong, not merely "acceptable."
- Each feedback sentence MUST reference something the student actually wrote (or failed to write).
- Do NOT penalise spelling, grammar, or formatting unless it creates genuine ambiguity.

IMPROVEMENT SUGGESTION:
- Give ONE specific, actionable suggestion. Tell them exactly WHAT to add, fix, or restructure.

QUESTION/PROMPT:
${prompt}

MODEL ANSWER:
${modelAnswer}

STUDENT'S OUTLINE (written before the essay):
${essayOutline}

STUDENT'S ESSAY RESPONSE:
${userResponse}

Respond in this EXACT JSON format and nothing else:
{
  "thesisClarity": { "score": 0, "feedback": "One specific sentence." },
  "evidenceDensity": { "score": 0, "feedback": "One specific sentence." },
  "argumentStructure": { "score": 0, "feedback": "One specific sentence." },
  "analyticalDepth": { "score": 0, "feedback": "One specific sentence." },
  "conclusionQuality": { "score": 0, "feedback": "One specific sentence." },
  "improvement": "One specific, actionable sentence.",
  "summary": "One sentence overall assessment."
}`;
        } else {
          // ── Standard Mode: 3-dimension rubric (existing behaviour) ──
          gradingPrompt = `You are an expert academic grader embedded in a spaced repetition study engine. Your role is to provide precise, calibrated, evidence-based feedback that helps the student close the gap between their current understanding and the target knowledge.

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
  - 0 = Missing, incorrect, or fundamentally flawed.
  - 1 = Partially correct or incomplete.
  - 2 = Complete, accurate, and well-articulated.
- Be CALIBRATED, not generous. A score of 2 means genuinely strong, not merely "acceptable." Most partial responses should score 1.
- If the student's response is correct but uses different terminology, give credit but note the divergence.
- Do NOT penalise spelling, grammar, or formatting unless it creates genuine ambiguity.
- Each feedback sentence MUST reference something the student actually wrote (or failed to write).

IMPROVEMENT SUGGESTION RULES:
- Give ONE specific, actionable suggestion. Not "study more" — tell them exactly WHAT to add, fix, or restructure.
- Provide 2-5 inline annotations on specific phrases from the STUDENT'S RESPONSE. Each annotation highlights a span of their text and tags it. Tags: "accurate" (correct claim), "partial" (right direction but vague/incomplete), "inaccurate" (factual error), "missing" (key omission area — annotate the phrase where it should have been elaborated), "insight" (goes beyond model answer). Keep annotated text spans short (5-20 words from the student's actual text).

Respond in this EXACT JSON format and nothing else:
{
  "accuracy": { "score": 0, "feedback": "One specific sentence referencing the student's response." },
  "depth": { "score": 0, "feedback": "One specific sentence referencing the student's response." },
  "clarity": { "score": 0, "feedback": "One specific sentence referencing the student's response." },${isDistinguish ? '\n  "discrimination": { "score": 0, "feedback": "One specific sentence about whether the student correctly distinguished between the two concepts." },' : ''}
  "improvement": "One specific, actionable sentence.",
  "summary": "One sentence overall assessment that tells the student where they stand.",
  "annotations": [
    { "text": "exact short phrase from student response", "tag": "accurate|partial|inaccurate|missing|insight", "note": "Brief explanation of why this phrase is tagged this way." }
  ]
}`;
        }

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
                responseMimeType: "application/json"
              }
            })
          }
        );

        if (!geminiRes.ok) {
          const errText = await geminiRes.text();
          return new Response(JSON.stringify({ error: "Gemini API error", detail: errText }), {
            status: 502, headers: { ...gradeCorsHeaders, "Content-Type": "application/json" }
          });
        }

        const geminiData = await geminiRes.json();
        const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

        let grading;
        grading = tryParse(rawText)
          || tryParse(cleanJsonString(rawText))
          || (() => { const m = rawText.match(/\{[\s\S]*\}/); return m ? tryParse(cleanJsonString(m[0])) : null; })();

        // ── Calculate scores and FSRS rating ──
        if (isEssayMode) {
          // Essay mode: 5 dimensions
          if (!grading || grading.thesisClarity === undefined) {
            return new Response(JSON.stringify({ error: "Failed to parse essay grading response", raw: rawText }), {
              status: 500, headers: { ...gradeCorsHeaders, "Content-Type": "application/json" }
            });
          }

          const total = (grading.thesisClarity?.score || 0) +
            (grading.evidenceDensity?.score || 0) +
            (grading.argumentStructure?.score || 0) +
            (grading.analyticalDepth?.score || 0) +
            (grading.conclusionQuality?.score || 0);
          const maxTotal = 10;
          const ratio = total / maxTotal;

          let fsrsRating;
          if (ratio <= 0.2) fsrsRating = 1;
          else if (ratio <= 0.5) fsrsRating = 2;
          else if (ratio <= 0.8) fsrsRating = 3;
          else fsrsRating = 4;

          grading.essayMode = true;
          grading.totalScore = total;
          grading.maxScore = maxTotal;
          grading.fsrsRating = fsrsRating;

        } else {
          // Standard mode: 3 (or 4) dimensions
          if (!grading || grading.accuracy === undefined) {
            return new Response(JSON.stringify({ error: "Failed to parse grading response", raw: rawText }), {
              status: 500, headers: { ...gradeCorsHeaders, "Content-Type": "application/json" }
            });
          }

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

          const ratio = total / maxTotal;
          let fsrsRating;
          if (ratio <= 0.17) fsrsRating = 1;
          else if (ratio <= 0.5) fsrsRating = 2;
          else if (ratio <= 0.83) fsrsRating = 3;
          else fsrsRating = 4;

          grading.essayMode = false;
          grading.totalScore = total;
          grading.maxScore = maxTotal;
          grading.fsrsRating = fsrsRating;
        }

        return new Response(JSON.stringify(grading), {
          status: 200, headers: { ...gradeCorsHeaders, "Content-Type": "application/json" }
        });

      } catch (err) {
        return new Response(JSON.stringify({ error: "Internal error", detail: err.message }), {
          status: 500, headers: { ...gradeCorsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ── Visual Generation Route ──
    if (url.pathname === "/studyengine/visual") {
      const visCorsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key",
        "Access-Control-Max-Age": "86400"
      };

      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405, headers: { ...visCorsHeaders, "Content-Type": "application/json" }
        });
      }

      try {
        const body = await request.json();
        const { prompt, modelAnswer, tier, course, topic, conceptA, conceptB } = body;

        if (!prompt || !modelAnswer) {
          return new Response(JSON.stringify({ error: "Missing required fields" }), {
            status: 400, headers: { ...visCorsHeaders, "Content-Type": "application/json" }
          });
        }

        // Check KV cache (drop truncated / invalid entries so they regenerate)
        const cacheKey = `visual:${hashString(prompt + modelAnswer + (tier || ""))}`;
        const cached = await env.WIDGET_KV.get(cacheKey);
        if (cached) {
          if (isIncompleteMermaidOutput(cached)) {
            try {
              await env.WIDGET_KV.delete(cacheKey);
            } catch (delErr) {
              console.error("KV delete stale visual failed:", delErr.message);
            }
          } else {
            return new Response(JSON.stringify({ visual: cached }), {
              status: 200, headers: { ...visCorsHeaders, "Content-Type": "application/json" }
            });
          }
        }

        const visualPrompt = `You are generating a Mermaid.js diagram for a spaced repetition study card. The diagram must be EDUCATIONALLY MEANINGFUL — it should help the student recall the concept's internal structure, not just decorate the card.

COURSE: ${course || "Unknown"}
TOPIC: ${topic || "General"}
TIER: ${tier || "explain"}

QUESTION: ${prompt}
ANSWER: ${modelAnswer}
${conceptA ? `Concept A: ${conceptA}` : ""}
${conceptB ? `Concept B: ${conceptB}` : ""}

DIAGRAM STRATEGY BY TIER:
- quickfire: Show the key fact's context — where it fits in a classification, timeline, or hierarchy.
- explain: Show the causal chain or mechanism — WHY something works, with cause → effect arrows.
- apply: Show rule → fact mapping — how the principle connects to the scenario's specific elements.
- distinguish: Show a COMPARISON — two parallel branches with the distinguishing criteria highlighted.
- mock: Show the argument structure — thesis, supporting points, counter-arguments.

STRICT RULES:
1. Output ONLY valid Mermaid markup. No code fences, no prose, no explanation before or after.
2. Use graph TD or graph LR. Do NOT use mindmap (rendering issues), sequenceDiagram, pie, or other diagram types.
3. Node labels must use FULL WORDS drawn from the question or answer. NEVER abbreviate concepts into opaque acronyms (no "DSU", "Comp", "Dev" alone). Use recognizable names from the material (e.g. "Development as Freedom", "Capabilities Approach").
4. Edge labels should describe the RELATIONSHIP (e.g. "expands", "requires", "distinguishes", "causes"). Use -->|"label"| syntax.
5. Use 5-12 nodes. Fewer than 5 is too vague; more than 12 is cluttered for a small display.
6. Every node must map to a real idea from the question or answer. Do not invent unrelated concepts.
7. The diagram must be self-contained — a student should grasp the structure from the diagram alone.
8. The diagram is shown at thumbnail size; keep labels concise in length but never at the cost of meaning — prefer short phrases of real terms, not acronyms.

EXAMPLE (for "What are the five instrumental freedoms in Sen's framework?"):

graph TD
    A["Development as Freedom"] -->|"requires"| B["Instrumental Freedoms"]
    B --> C["Political Freedoms"]
    B --> D["Economic Facilities"]
    B --> E["Social Opportunities"]
    B --> F["Transparency Guarantees"]
    B --> G["Protective Security"]
    C & D & E & F & G -->|"expand"| H["Individual Agency"]`;

        const geminiRes = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + env.GEMINI_API_KEY,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: visualPrompt }] }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
            })
          }
        );

        if (!geminiRes.ok) {
          return new Response(JSON.stringify({ error: "Gemini API error" }), {
            status: geminiRes.status, headers: { ...visCorsHeaders, "Content-Type": "application/json" }
          });
        }

        const data = await geminiRes.json();
        const cand = data?.candidates?.[0];
        const finishReason = cand?.finishReason || "";
        let visual = cand?.content?.parts?.[0]?.text || "";
        visual = visual.replace(/^```mermaid\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
        /* Drop preamble ("Here is…") so Mermaid sees graph TD/LR first */
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
            console.error("KV VISUAL CACHE WRITE ERROR:", JSON.stringify({ message: kvErr.message, name: kvErr.name, key: cacheKey }));
          }
        }

        return new Response(JSON.stringify({ visual: visual || null }), {
          status: 200, headers: { ...visCorsHeaders, "Content-Type": "application/json" }
        });

      } catch (err) {
        return new Response(JSON.stringify({ error: "Visual generation failed", detail: err.message }), {
          status: 500, headers: { ...visCorsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ── TTS Audio Route ──
    if (url.pathname === "/studyengine/tts") {
      const ttsCorsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key",
        "Access-Control-Max-Age": "86400"
      };

      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405, headers: { ...ttsCorsHeaders, "Content-Type": "application/json" }
        });
      }

      try {
        const body = await request.json();
        const text = String(body.text || "").trim();
        const voiceName = body.voiceName || "en-US-Studio-O";
        const languageCode = body.languageCode || "en-US";

        if (!text) {
          return new Response(JSON.stringify({ error: "Missing text" }), {
            status: 400, headers: { ...ttsCorsHeaders, "Content-Type": "application/json" }
          });
        }

        const cacheKey = `tts:${hashString(text + voiceName + languageCode)}`;
        const cached = await env.WIDGET_KV.get(cacheKey);
        if (cached) {
          return new Response(JSON.stringify({ audioContent: cached }), {
            status: 200, headers: { ...ttsCorsHeaders, "Content-Type": "application/json" }
          });
        }

        const ttsRes = await fetch(
          "https://texttospeech.googleapis.com/v1/text:synthesize?key=" + env.GOOGLE_TTS_KEY,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              input: { text },
              voice: { languageCode, name: voiceName },
              audioConfig: { audioEncoding: "MP3", speakingRate: 0.95, pitch: 0 }
            })
          }
        );

        if (!ttsRes.ok) {
          const errText = await ttsRes.text();
          return new Response(JSON.stringify({ error: "Google TTS error", detail: errText }), {
            status: 502, headers: { ...ttsCorsHeaders, "Content-Type": "application/json" }
          });
        }

        const ttsData = await ttsRes.json();
        const audioContent = ttsData.audioContent || "";
        if (audioContent) {
          try {
            await env.WIDGET_KV.put(cacheKey, audioContent, { expirationTtl: 30 * 24 * 60 * 60 });
          } catch (kvErr) {
            console.error("KV TTS CACHE WRITE ERROR:", JSON.stringify({ message: kvErr.message, name: kvErr.name, key: cacheKey }));
          }
        }

        return new Response(JSON.stringify({ audioContent }), {
          status: 200, headers: { ...ttsCorsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "TTS failed", detail: err.message }), {
          status: 500, headers: { ...ttsCorsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ── Existing routes below (state sync, notion bridge) ──
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

        try {
          await env.WIDGET_KV.put(key, JSON.stringify(newState));
        } catch (kvErr) {
          console.error(
            "KV WRITE ERROR:",
            JSON.stringify({
              message: kvErr.message,
              name: kvErr.name,
              stack: kvErr.stack,
              key
            })
          );
          return json({ error: "KV write failed", detail: kvErr.message, key, ok: false }, 503);
        }
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

// ── Notion Bridge ──
async function handleNotion(resource, request, env) {
  if (!env.NOTION_TOKEN) {
    return json({ error: "Notion integration not configured" }, 501);
  }

  if (resource === "milestones" && request.method === "GET") {
    const url = new URL(request.url);
    const dbId = url.searchParams.get("db") || env.NOTION_DB_ID || "";
    if (!dbId) return json({ error: "Missing db — set NOTION_DB_ID secret or pass ?db=" }, 400);

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
      const title = titleProp && titleProp.title && titleProp.title.length
        ? titleProp.title.map(t => t.plain_text).join("") : "";
      const dateProp = props["date"];
      const date = dateProp && dateProp.date ? dateProp.date.start : null;
      const dateEnd = dateProp && dateProp.date ? dateProp.date.end : null;
      const category = props["assignment"]?.select?.name || "";
      const progress = props["progress"]?.status?.name || "";
      const worth = props["worth"]?.number ?? null;
      const notes = props["notes"]?.rich_text?.map(t => t.plain_text).join("").slice(0, 120) || "";
      return { id: page.id, title, date, dateEnd, category, progress, worth, notes };
    });

    return json({ items });
  }

  return json({ error: "Unknown Notion resource" }, 404);
}

// ── Helpers ──
/** True if string is missing graph, too short, or last line ends mid-edge (truncated output). */
function isIncompleteMermaidOutput(s) {
  if (!s || typeof s !== "string") return true;
  let t = s.trim();
  if (!t) return true;
  t = t.replace(/^```mermaid\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  const graphIdx = t.search(/\bgraph\s+(TD|LR)\b/i);
  if (graphIdx === -1) return true;
  t = t.slice(graphIdx).trim();
  const lines = t.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return true;
  const last = lines[lines.length - 1];
  /* Ends with arrow (optional |label|) but no target node */
  if (/(?:-->|--o)(?:\|[^|]*\|)?\s*$/i.test(last)) return true;
  if (/--\s*$/.test(last)) return true;
  return false;
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key",
    "Access-Control-Max-Age": "86400"
  };
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders())
  });
}

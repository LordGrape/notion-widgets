// worker.js — Cloudflare Worker for widget state sync + AI grading
// Bindings: WIDGET_KV (KV namespace)
// Secrets: WIDGET_SECRET, GEMINI_API_KEY, GOOGLE_TTS_KEY, NOTION_TOKEN (optional), NOTION_DB_ID (optional)

// ── Shared Helpers (used by multiple routes) ──
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
function parseJsonResponse(rawText) {
  return (
    tryParse(rawText) ||
    tryParse(cleanJsonString(rawText)) ||
    (() => {
      const m = rawText.match(/\{[\s\S]*\}/);
      return m ? tryParse(cleanJsonString(m[0])) : null;
    })()
  );
}

function buildFallbackLearnPlan(body) {
  const cards = Array.isArray(body?.cards) ? body.cards.slice(0, 6) : [];
  const topics = Array.isArray(body?.topics) ? body.topics : [];
  const segments = cards.map((card, idx) => {
    const prompt = String(card?.prompt || "").trim();
    const answer = String(card?.modelAnswer || "").trim();
    const concept = prompt.split("?")[0].trim() || ("Concept " + (idx + 1));
    return {
      id: "seg-fallback-" + (idx + 1),
      concept: concept.slice(0, 100),
      explanation: answer || "Use your course materials to define this concept clearly.",
      elaboration: "Connect this idea to " + (topics[0] || "the current topic") + " and explain why it matters.",
      checkType: idx % 2 === 0 ? "elaborative" : "predict",
      checkQuestion: prompt || ("Explain " + concept + " in your own words."),
      checkAnswer: answer || "A clear, accurate explanation that uses key terms from your class.",
      linkedCardIds: card?.id ? [String(card.id)] : []
    };
  });

  const consolidationQuestions = [
    {
      question: "What are the most important connections across the concepts you just studied?",
      answer: "A good answer names each concept and explains how they build on each other.",
      linkedCardIds: segments.flatMap((seg) => seg.linkedCardIds).slice(0, 5)
    }
  ];

  return { segments, consolidationQuestions };
}

// Gemini 2.5 models may include "thought" parts before the actual response.
// This helper extracts the last non-thought text part from the candidates.
function extractGeminiText(geminiData) {
  const parts = geminiData?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return "{}";
  const textParts = parts.filter((p) => !p.thought && typeof p.text === "string");
  if (textParts.length === 0) {
    const last = parts[parts.length - 1];
    return (last && typeof last.text === "string") ? last.text : "{}";
  }
  return textParts[textParts.length - 1].text;
}

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

    try {
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

      const TUTOR_MODES = ["socratic", "quick", "teach", "insight", "acknowledge", "freeform"];

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

        const needsUserResponse = mode === "socratic" || mode === "quick" || mode === "acknowledge" || mode === "freeform";
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

        const isRelearningPass = !!context.isRelearning;

        const relearningModePrefix =
          "RELEARNING PASS: The student already attempted this card, saw the model answer, and rated Again. This is a re-encounter within the same session. Do NOT ask broad diagnostic questions — target the specific point they missed. Ask them to reconstruct the key claim. Keep it to 1-2 turns. They have already seen the answer — the goal is active re-encoding, not discovery.\n\n";

        function daysUntilExam(dateStr) {
          if (!dateStr) return null;
          const s = String(dateStr).trim();
          const d = new Date(s.length <= 10 ? `${s}T12:00:00` : s);
          if (Number.isNaN(d.getTime())) return null;
          const now = new Date();
          return Math.max(0, Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        }

        function formatLearnerProfileBlock(learner, itemRef) {
          if (!learner || typeof learner !== "object") return "";
          const cs = learner.courseStats || {};
          const card = learner.cardHistory || {};
          const strong = Array.isArray(learner.strongTopics) ? learner.strongTopics : [];
          const weak = Array.isArray(learner.weakTopics) ? learner.weakTopics : [];
          const mems = Array.isArray(learner.relevantMemories) ? learner.relevantMemories : [];
          const cal = learner.calibrationAccuracy;
          const streak = learner.overallStreak != null ? learner.overallStreak : 0;
          const cardLine = card.isNew
            ? "First time"
            : `${card.reps ?? 0} reviews, ${card.lapses ?? 0} lapses, stability ${Math.round(Number(card.stability) || 0)} days`;
          const lines = [
            "\n\n---\n\nLEARNER PROFILE (BACKGROUND CONTEXT FROM PRIOR SESSIONS — these are AI-observed patterns, NOT things the student said in this conversation. Never attribute these as direct quotes or statements by the student. Do not say 'you mentioned' or 'you said' — say 'I've noticed' or 'from prior sessions' instead):\n",
            `- Course: ${itemRef.course || ""} (${Number(cs.totalCards) || 0} cards, ${Number(cs.reviewedCards) || 0} reviewed)`,
            `- Strong topics: ${strong.length ? strong.join(", ") : "None identified yet"}`,
            `- Weak topics: ${weak.length ? weak.join(", ") : "None identified yet"}`,
            `- This card: ${cardLine}`,
            `- Calibration accuracy: ${cal != null && !Number.isNaN(Number(cal)) ? Math.round(Number(cal) * 100) + "%" : "Not enough data"}`,
            `- Study streak: ${streak} days`
          ];
          const nudgeTopics = learner.calibrationNudgeTopics;
          if (Array.isArray(nudgeTopics) && nudgeTopics.length > 0) {
            lines.push(
              `- ⚠ Overconfident topics (low retention despite reviews): ${nudgeTopics.join(", ")}`,
              "- When reviewing cards from these topics, gently challenge the student's confidence: \"Your self-ratings on this topic have been optimistic — let's verify what you actually remember.\""
            );
          }
          if (learner.primaryErrorPattern) {
            const patternLabels = {
              factual_miss: "factual recall gaps",
              reasoning_gap: "incomplete reasoning chains",
              under_elaboration: "naming concepts without explaining them",
              misconception: "actively wrong mental models",
              prerequisite_gap: "missing foundational concepts",
              framework_mismatch: "using different analytical frameworks than expected"
            };
            const label = patternLabels[learner.primaryErrorPattern] || learner.primaryErrorPattern;
            lines.push(
              `- ⚠ Primary error pattern: ${label} (${learner.primaryErrorPct || "?"}% of recent errors)`,
              `- When this student makes an error, it is most likely ${label}. Tailor your diagnostic questions accordingly.`
            );
          }
          if (mems.length > 0) {
            lines.push("- AI-observed patterns from prior sessions (do NOT present these as things the student said):");
            for (const mline of mems) lines.push(`  * ${String(mline)}`);
          }
          lines.push(
            "",
            "Use this profile to personalise your tutoring:",
            "- Reference their known strengths to build bridges to weak areas",
            "- If their error matches a known pattern, address the pattern directly",
            "- If calibration is low (below 70%), gently challenge their self-assessment",
            "- If this card has high lapses, acknowledge the difficulty and try a different angle than previous attempts"
          );
          return lines.join("\n");
        }

        function formatExamContextBlock(cc) {
          if (!cc || typeof cc !== "object") return "";
          const fmt = cc.examType || "Unknown";
          const fmtExtra = cc.examFormat ? ` — ${cc.examFormat}` : "";
          const days = cc.examDate ? daysUntilExam(cc.examDate) : null;
          const dateLine =
            cc.examDate && days != null
              ? `${cc.examDate} (${days} days away)`
              : cc.examDate
                ? String(cc.examDate)
                : "Not set";
          const weightLine =
            cc.examWeight != null && !Number.isNaN(Number(cc.examWeight))
              ? `${cc.examWeight}% of final grade`
              : "Unknown";
          const mats = cc.allowedMaterials || "Unknown";
          const lines = [
            "\n\n---\n\nEXAM CONTEXT:\n",
            `- Format: ${fmt}${fmtExtra}`,
            `- Date: ${dateLine}`,
            `- Weight: ${weightLine}`,
            `- Allowed materials: ${mats}`
          ];
          if (cc.professorValues) lines.push(`- Professor values: ${cc.professorValues}`);
          if (cc.syllabusContext) lines.push(`- Course scope: ${cc.syllabusContext}`);
          lines.push(
            "",
            "Tailor your feedback to this exam context:",
            "- If the professor values specific things (case citations, counter-arguments, etc.), check for them",
            "- If the exam is essay format, evaluate argument structure; if MC, focus on precision of key distinctions",
            "- As the exam date approaches, increase urgency and focus on high-yield review"
          );
          return lines.join("\n");
        }

        const tutorVoice = body.tutorVoice === "supportive" ? "supportive" : "rigorous";
        const supportiveVoiceBlock =
          tutorVoice === "supportive"
            ? `\n\nVOICE MODIFIER — SUPPORTIVE MODE:\n\n` +
              "Adjust your tone to be warmer and more encouraging. Still be substantive — never give empty praise.\n\n" +
              "But lead with what the student got right before addressing gaps. Use phrases like \"You're on the right track\" " +
              'and "Let\'s build on that." When asking follow-up questions, frame them as collaborative ("Let\'s think about...") ' +
              'rather than challenging ("Why didn\'t you consider..."). The student still needs to do the thinking — you\'re ' +
              "just creating a warmer environment for it.\n"
            : "";

        const learnerProfileBlock = formatLearnerProfileBlock(context.learner, item);
        const examContextBlock = formatExamContextBlock(context.courseContext);
        const fewShotExemplars = `
---

GRADING CALIBRATION EXEMPLARS (reference these for rating consistency — they are examples, NOT the current card):

EXEMPLAR 1 (Explain tier, rating 2):

Prompt: "Explain the infant industry argument for protection."

Model answer: "Nascent domestic industries cannot compete with established foreign firms due to lack of economies of scale, learning-by-doing, and capital access. Temporary protection allows growth to competitive scale. Requires: (1) industry will eventually compete without protection, (2) long-term gains exceed short-term consumer welfare loss."

Student response: "It's when a country protects new industries with tariffs so they can grow."

Rating: 2 (Hard). Student identified the core concept but omitted all three mechanisms, both validity conditions, and the welfare trade-off. Naming without explaining = Hard.

EXEMPLAR 2 (Apply tier, rating 1):

Prompt: "Apply the collective action problem to explain why consumers rarely lobby against tariffs."

Model answer: "Per Olson's logic, each consumer loses a small amount from a tariff, so the individual incentive to organize is low. Costs of lobbying exceed individual benefit. Meanwhile, a small number of producers each gain substantially, making collective action rational for them."

Student response: "Because consumers don't care about tariffs as much as producers do."

Rating: 1 (Again). Correct intuition but zero analytical structure — no mention of Olson, no mechanism (diffuse costs vs. concentrated benefits), no explanation of WHY consumers don't organize. Apply tier demands analytical depth.

EXEMPLAR 3 (Explain tier, rating 3):

Prompt: "Why does the WTO allow regional trade agreements despite the MFN principle?"

Model answer: "MFN (Article I) requires equal treatment. Article XXIV creates an exception for RTAs that eliminate substantially all internal trade barriers. The logic: deeper regional integration can be net trade-creating if the RTA goes further than MFN requires."

Student response: "The MFN principle under Article I says you can't discriminate, but Article XXIV lets countries form RTAs as long as they remove basically all tariffs between members. The WTO allows it because these agreements go beyond MFN by liberalizing more deeply within the bloc."

Rating: 3 (Good). Correct identification of both articles, the tension between them, and the resolution mechanism. Reasoning is complete. Not Easy because no discussion of trade creation vs. diversion or limitations.

`;
        const systemPromptAugmented =
          systemPrompt + fewShotExemplars + supportiveVoiceBlock + learnerProfileBlock + examContextBlock;

        const modeInstructionsBase = {
          socratic:
            `MODE: Socratic dialogue.\n\n` +
            "The student has submitted a response to a study question. Your job is to identify the SINGLE most important gap between their answer and the model answer, " +
            "then ask ONE targeted follow-up question that forces the student to bridge that gap. Do NOT reveal the correct answer. Do NOT explain. Ask a question.\n\n" +
            "If this is a follow-up turn (conversation history exists), evaluate whether the student's latest response closes the gap. " +
            "If yes: confirm with a specific tie-back to their words, mark isComplete true, then provide suggestedRating (1-4) using STRICT, calibrated criteria across turns: " +
            "1=Still missed the core concept even after scaffolding, 2=Got the gist but still has major gaps / needed substantial help, 3=Reached a solid understanding with only minor scaffolding, 4=Demonstrated full mastery and could reconstruct cleanly. " +
            "Be CALIBRATED, not generous. Default borderline cases to 2.\n\n" +
            "Also: if their first answer stated the thesis/conclusion but omitted the reasoning chain, mechanisms, evidence, or causal steps from the model answer, that is 2 (Hard), not 3.\n\n" +
            "and optionally provide a reconstructionPrompt if the student struggled (e.g., \"Now put the full answer together in your own words\"). " +
            "If partially: narrow the scaffold with a more specific hint question, keep isComplete false. " +
            "If this is the 3rd turn (conversation has 4+ entries): always mark isComplete true and provide a synthesis that ties together what the student got right and wrong across all turns.\n\n" +
            "If the student used a different but valid analytical framework than the model answer, acknowledge it: " +
            "\"Your response uses a different analytical lens than the model answer, but the reasoning is internally coherent. Here's what the model answer emphasises...\"\n\n" +
            "Provide 2-5 inline annotations on the student's original response (from their first submission, not follow-up turns). " +
            'Tags: "accurate", "partial", "inaccurate", "missing", "insight".\n\n' +
            'DIAGNOSIS: Also return a "diagnosisType" field classifying the student\'s primary error:\n\n' +
            '- "factual_miss": Wrong or missing facts\n' +
            '- "reasoning_gap": Right facts but flawed logic or incomplete causal chain\n' +
            '- "under_elaboration": Correct direction but too brief — names concept without explaining\n' +
            '- "misconception": Actively wrong mental model (not just missing info)\n' +
            '- "prerequisite_gap": Error suggests they lack a foundational concept this card builds on\n' +
            '- "framework_mismatch": Used a valid but different analytical framework than the model answer\n\n' +
            "Set to null if the student's answer was strong (suggestedRating >= 3).",

          quick:
            `MODE: Quick feedback (single turn).\n\n` +
            "Provide four components: (1) What they got right — one sentence citing their specific words. " +
            "(2) What's missing — the single most important gap. " +
            "(3) The bridge — one sentence connecting what they knew to what they missed. " +
            "(4) A quick-check question with its answer for self-testing.\n\n" +
            "If the student embeds a question in their response (e.g., \"is it because of X?\" / \"why did Y happen?\"), address it briefly in the \"bridge\" field. " +
            "A question indicates active engagement — reinforce it. Keep it to 1-2 sentences and connect it back to the model answer.\n\n" +
            "RATING CRITERIA — suggest an FSRS rating using STRICT thresholds:\n" +
            "- 1 (Again): Response is wrong, blank, or misses the core concept entirely.\n" +
            "- 2 (Hard): Response identifies the right conclusion or concept but is missing significant reasoning, mechanisms, evidence, or causal steps from the model answer. " +
            "A short answer that states WHAT is true without explaining WHY/HOW is Hard, not Good.\n" +
            "- 3 (Good): Response covers most key claims from the model answer with adequate reasoning. Minor gaps only.\n" +
            "- 4 (Easy): Response is comprehensive — hits all major points, well-structured, and demonstrates full understanding.\n" +
            "Be CALIBRATED, not generous. Most partial responses should be rated 2. A thesis-only answer that omits the supporting chain is a 2, not a 3.\n\n" +
            "Also provide a suggested FSRS rating (1-4) and annotations.\n\n" +
            'DIAGNOSIS: Also return a "diagnosisType" field classifying the student\'s primary error:\n\n' +
            '- "factual_miss": Wrong or missing facts\n' +
            '- "reasoning_gap": Right facts but flawed logic or incomplete causal chain\n' +
            '- "under_elaboration": Correct direction but too brief — names concept without explaining\n' +
            '- "misconception": Actively wrong mental model (not just missing info)\n' +
            '- "prerequisite_gap": Error suggests they lack a foundational concept this card builds on\n' +
            '- "framework_mismatch": Used a valid but different analytical framework than the model answer\n\n' +
            "Set to null if the student's answer was strong (suggestedRating >= 3).",

          teach:
            `MODE: Teach (Don't Know path).\n\n` +
            "The student doesn't know the answer. Your job is to TEACH, not grade. Start from whatever they might know and build up. " +
            "Ask a simple entry question that finds their foothold. " +
            "If conversation history exists: they've responded to your previous question — anchor on what they offered and extend to the next piece. " +
            "On the final turn (3rd, or conversation has 4+ entries): ask them to reconstruct the full answer from memory (\"Now put it together for me — ...\"). " +
            "Mark isComplete true. Provide suggestedRating based on reconstruction quality (1 if they still can't, 2 if partial, 3 if good).\n\n" +
            'DIAGNOSIS: Also return a "diagnosisType" field classifying the student\'s primary error:\n\n' +
            '- "factual_miss": Wrong or missing facts\n' +
            '- "reasoning_gap": Right facts but flawed logic or incomplete causal chain\n' +
            '- "under_elaboration": Correct direction but too brief — names concept without explaining\n' +
            '- "misconception": Actively wrong mental model (not just missing info)\n' +
            '- "prerequisite_gap": Error suggests they lack a foundational concept this card builds on\n' +
            '- "framework_mismatch": Used a valid but different analytical framework than the model answer\n\n' +
            "Set to null if the student's answer was strong (suggestedRating >= 3).",

          insight:
            `MODE: Insight (Quick Fire tier).\n\n` +
            "The student has already seen the model answer and rated themselves. Provide ONE targeted insight line (max 2 sentences) that gives the student a mental anchor — " +
            "the key distinguishing feature, a vivid analogy, or the \"why\" behind the fact. This is not grading. This is encoding assistance.\n\n" +
            "If the student's response contains a question rather than a statement, treat it as genuine curiosity. Answer the question briefly within your insight, then provide the follow-up question as normal.\n\n" +
            "CRITICAL — SCALE YOUR FOLLOW-UP QUESTION TO THE STUDENT'S RATING:\n" +
            "- If recentAvgRating <= 1.5 or the student rated Again/Hard: ask a SIMPLE factual recall question. " +
            "Pull ONE specific fact from the model answer and ask the student to recall it. Example: \"What percentage did individual shareholders drop to by 2016?\" " +
            "Do NOT ask analytical, inferential, or implication questions. The student is still encoding basic facts.\n" +
            "- If recentAvgRating 2.0-3.0 or rated Good: ask a connecting question that links the fact to a related concept. " +
            "Example: \"How does this shift relate to the rise of institutional investors?\"\n" +
            "- If recentAvgRating > 3.0 or rated Easy: ask a deeper analytical question — implications, counter-arguments, or application. " +
            "Example: \"What does this shift imply about who holds corporations accountable today?\"\n\n" +
            "Match the student's level. Start where they are, not where you think they should be. " +
            "Use plain, direct language. If the student is struggling, use shorter sentences and simpler vocabulary.",

          acknowledge:
            `MODE: Acknowledge strong answer.\n\n` +
            "The student's answer is strong — it hits all key points from the model answer. " +
            "Acknowledge what was specifically good (cite their exact phrases), then ask ONE extension question that pushes BEYOND the model answer — " +
            "deeper analysis, a counter-argument, a specific mechanism, a real-world application. " +
            "This extends encoding without wasting time on material they already know.",
          freeform:
            `MODE: Freeform student question.\n\n` +
            "The student has just reviewed a study card and is asking their own follow-up question. " +
            "Your job is to answer their question accurately, grounded in the card's content and model answer. " +
            "Do NOT just give a flat answer. After answering the core question (2-3 sentences max), do ONE of:\n" +
            "- Ask a short follow-up that extends their thinking (\"Now consider: ...\")\n" +
            "- Connect their question to a related concept they should know (\"This links to ...\")\n" +
            "- Point out an implication they might not have considered\n\n" +
            "Keep your total response under 5 sentences. The student initiated this — respect their curiosity but keep the session moving.\n\n" +
            "If their question is off-topic or unanswerable from the card context, say so briefly and redirect: " +
            "\"That's outside this card's scope — but good instinct. For now, the key takeaway is...\"\n\n" +
            "If conversation history exists, this is a follow-up exchange. Keep it to max 1 additional turn after your first response. " +
            "On the second turn, always mark isComplete: true.\n\n" +
            "Provide annotations only if the student's question reveals a misconception worth flagging."
        };

        const tier = item.tier || "explain";

        const tierRatingAnchors = {
          quickfire:
            "\n\nRATING CALIBRATION FOR QUICK FIRE (cued recall):\n" +
            "- 1 (Again): Key facts wrong or missing entirely. Cannot retrieve the core answer.\n" +
            "- 2 (Hard): Partially correct — some key facts present but important ones missing or confused.\n" +
            "- 3 (Good): All key facts correct. Brief answers are fine — conciseness is expected for this tier.\n" +
            "- 4 (Easy): All key facts correct, recalled fluently, possibly with additional context unprompted.\n",
          explain:
            "\n\nRATING CALIBRATION FOR EXPLAIN (conceptual understanding):\n" +
            "- 1 (Again): Explanation is wrong, incoherent, or too superficial to demonstrate understanding. A single vague sentence with no reasoning = Again.\n" +
            "- 2 (Hard): Core concept identified but explanation is incomplete — missing key mechanisms, causal links, or important qualifications.\n" +
            "- 3 (Good): Clear, structured explanation covering the main mechanisms and reasoning. Demonstrates genuine understanding, not just naming the concept.\n" +
            "- 4 (Easy): All of Good plus nuanced analysis — addresses limitations, connects to broader themes, or anticipates counter-arguments.\n" +
            "A response must EXPLAIN (show reasoning and mechanism), not just NAME the concept. Naming without explaining = Hard at best.\n",
          apply:
            "\n\nRATING CALIBRATION FOR APPLY (application to scenario):\n" +
            "- 1 (Again): Wrong principle applied, OR correct principle named but no mapping to the scenario facts. A single sentence that just names the concept without applying it to the specific scenario = Again.\n" +
            "- 2 (Hard): Correct principle identified and some mapping attempted, but the analysis is thin — missing key scenario facts, incomplete reasoning chain, or superficial application.\n" +
            "- 3 (Good): Correct principle clearly mapped to specific scenario facts with a complete reasoning chain. The response demonstrates transfer, not just recognition.\n" +
            "- 4 (Easy): All of Good plus sophisticated analysis — considers edge cases, alternative frameworks, or implications beyond what was asked.\n" +
            "CRITICAL: Apply cards require ANALYTICAL DEPTH. The student must show they can USE the concept, not just IDENTIFY it. " +
            "One sentence naming the right concept without working through the scenario = Again (1) or Hard (2) at absolute best. " +
            "Be strict — this tier exists to test transfer, and lenient ratings here create dangerous overconfidence on exams.\n",
          distinguish:
            "\n\nRATING CALIBRATION FOR DISTINGUISH (discrimination between concepts):\n" +
            "- 1 (Again): Wrong concept chosen, OR cannot articulate any meaningful distinction between the two concepts.\n" +
            "- 2 (Hard): Correct concept identified but the distinction is vague or the reasoning for why one applies over the other is weak.\n" +
            "- 3 (Good): Correct concept identified with clear articulation of WHY it applies and why the other does not, grounded in the scenario specifics.\n" +
            "- 4 (Easy): All of Good plus demonstrates deep understanding of the boundary conditions between the concepts.\n" +
            "The student must articulate the DISTINCTION, not just pick the right label.\n",
          mock:
            "\n\nRATING CALIBRATION FOR MOCK (full synthesis under pressure):\n" +
            "- 1 (Again): Response is fundamentally incomplete or misses the core of the question.\n" +
            "- 2 (Hard): Addresses the question but with significant gaps in argument structure, evidence, or analysis.\n" +
            "- 3 (Good): Well-structured response covering the main arguments with supporting evidence. Exam-ready.\n" +
            "- 4 (Easy): All of Good plus exceptional depth, counter-arguments addressed, and synthesis that goes beyond the model answer.\n",
          worked:
            "\n\nRATING CALIBRATION FOR WORKED EXAMPLE (guided reasoning completion):\n" +
            "- 1 (Again): The completed section is wrong or incoherent.\n" +
            "- 2 (Hard): Partially correct completion but missing key reasoning steps or evidence.\n" +
            "- 3 (Good): Correct completion that follows the analytical pattern of the worked sections. Reasoning is sound.\n" +
            "- 4 (Easy): All of Good plus demonstrates independent analytical thinking beyond pattern-matching.\n"
        };

        const tierAnchor = tierRatingAnchors[tier] || tierRatingAnchors.explain;
        let modeInstructionsForMode =
          (isRelearningPass ? relearningModePrefix : "") +
          modeInstructionsBase[mode] +
          tierAnchor;

        if (mode === "quick" && context.quickFireReRetrieval) {
          modeInstructionsForMode +=
            "\n\nQUICK FIRE RE-RETRIEVAL: The student cannot see the model answer yet. They just typed a short answer to a retrieval question after rating Again. " +
            "Compare their attempt to the model answer. Keep each JSON field (correct, missing, bridge) to 1–2 sentences max. " +
            "Do not paste the full model answer in your response — they will see it in a consolidation step next.\n\n" +
            "IMPORTANT — STUDENT QUESTIONS: If the student asks a question within their response (e.g., \"is that because of X?\" / \"why did Y happen?\"), " +
            "address it briefly in the \"bridge\" field. Acknowledge their thinking, answer the question in 1-2 sentences, then connect it back to the model answer. " +
            "Do NOT ignore student questions.\n";
        }

        const jsonFieldSeparationHint = {
          tutorAndFollowUp:
            "\n\nIMPORTANT: Do NOT include the follow-up question inside \"tutorMessage\". " +
            'The "tutorMessage" field must contain ONLY your diagnostic response, acknowledgment, or scaffold — it must END before any question. ' +
            'Put your follow-up question EXCLUSIVELY in \"followUpQuestion\". If you have no follow-up question, set \"followUpQuestion\" to null. ' +
            "Never duplicate content across the two fields.",
          acknowledgmentAndExtension:
            "\n\nIMPORTANT: Do NOT include the extension question inside \"acknowledgment\". " +
            'Put your extension question EXCLUSIVELY in \"extensionQuestion\". If you have none, set \"extensionQuestion\" to null. ' +
            "Never duplicate content across the two fields.",
          insightAndFollowUp:
            "\n\nIMPORTANT: Do NOT include the self-test question inside \"insight\". " +
            'Put the follow-up EXCLUSIVELY in \"followUpQuestion\". If you have no question, set \"followUpQuestion\" to null. ' +
            "Never duplicate content across those fields."
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
  "followUpQuestion": "A self-test question scaled to the student's rating level. Simple recall for struggling students, analytical for strong ones. Null only if trivial.",
  "followUpAnswer": "The answer to the follow-up question. Keep it concise. Null if no question."
}`,
          acknowledge: `{
  "acknowledgment": "2-3 sentences citing specific strengths.",
  "extensionQuestion": "One question pushing beyond the model answer.",
  "isComplete": false,
  "suggestedRating": null
}`,
          freeform: `{
  "tutorMessage": "2-5 sentences answering the question + one extension.",
  "followUpQuestion": "Optional short follow-up to deepen thinking. Null if isComplete.",
  "isComplete": false,
  "suggestedRating": null,
  "annotations": []
}`
        };
        const responseSchemaObjects = {
          socratic: {
            type: "object",
            properties: {
              tutorMessage: { type: "string" },
              followUpQuestion: { type: "string", nullable: true },
              isComplete: { type: "boolean" },
              suggestedRating: { type: "integer", nullable: true },
              diagnosisType: {
                type: "string",
                enum: ["factual_miss", "reasoning_gap", "under_elaboration", "misconception", "prerequisite_gap", "framework_mismatch"],
                nullable: true
              },
              annotations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    tag: { type: "string" },
                    note: { type: "string" }
                  }
                }
              },
              reconstructionPrompt: { type: "string", nullable: true }
            },
            required: ["tutorMessage", "isComplete"]
          },
          quick: {
            type: "object",
            properties: {
              correct: { type: "string" },
              missing: { type: "string" },
              bridge: { type: "string" },
              quickCheck: {
                type: "object",
                nullable: true,
                properties: {
                  question: { type: "string" },
                  answer: { type: "string" }
                }
              },
              tutorMessage: { type: "string", nullable: true },
              suggestedRating: { type: "integer", nullable: true },
              diagnosisType: {
                type: "string",
                enum: ["factual_miss", "reasoning_gap", "under_elaboration", "misconception", "prerequisite_gap", "framework_mismatch"],
                nullable: true
              },
              annotations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    tag: { type: "string" },
                    note: { type: "string" }
                  }
                }
              }
            },
            required: ["correct", "missing", "bridge"]
          },
          teach: {
            type: "object",
            properties: {
              tutorMessage: { type: "string" },
              followUpQuestion: { type: "string", nullable: true },
              isComplete: { type: "boolean" },
              suggestedRating: { type: "integer", nullable: true },
              diagnosisType: {
                type: "string",
                enum: ["factual_miss", "reasoning_gap", "under_elaboration", "misconception", "prerequisite_gap", "framework_mismatch"],
                nullable: true
              },
              annotations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    tag: { type: "string" },
                    note: { type: "string" }
                  }
                }
              },
              reconstructionPrompt: { type: "string", nullable: true }
            },
            required: ["tutorMessage", "isComplete"]
          },
          insight: {
            type: "object",
            properties: {
              insight: { type: "string" },
              followUpQuestion: { type: "string", nullable: true },
              followUpAnswer: { type: "string", nullable: true }
            },
            required: ["insight"]
          },
          acknowledge: {
            type: "object",
            properties: {
              acknowledgment: { type: "string" },
              extensionQuestion: { type: "string", nullable: true },
              isComplete: { type: "boolean" },
              suggestedRating: { type: "integer", nullable: true }
            },
            required: ["acknowledgment", "isComplete"]
          },
          freeform: {
            type: "object",
            properties: {
              tutorMessage: { type: "string" },
              followUpQuestion: { type: "string", nullable: true },
              isComplete: { type: "boolean" },
              suggestedRating: { type: "integer", nullable: true },
              annotations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    tag: { type: "string" },
                    note: { type: "string" }
                  }
                }
              }
            },
            required: ["tutorMessage", "isComplete"]
          }
        };

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

        if (mode === "insight" && context.quickFireFollowUp && context.userRating != null) {
          userBlock += `Quick Fire follow-up path — student's self-rating on this card: ${context.userRating} (1=Again, 2=Hard, 3=Good, 4=Easy). Scale followUpQuestion difficulty accordingly.\n`;
        }

        if (mode === "quick" && context.quickFireReRetrieval && context.quickFireFollowUpQuestion) {
          userBlock +=
            `RETRIEVAL QUESTION THEY ANSWERED: ${String(context.quickFireFollowUpQuestion).slice(0, 800)}\n`;
        }

        const schemaForMode = responseSchemas[mode];
        const fieldSepForMode =
          mode === "socratic" || mode === "teach" || mode === "freeform"
            ? jsonFieldSeparationHint.tutorAndFollowUp
            : mode === "acknowledge"
              ? jsonFieldSeparationHint.acknowledgmentAndExtension
              : mode === "insight"
                ? jsonFieldSeparationHint.insightAndFollowUp
                : "";

        userBlock +=
          `Context: This card has been forgotten ${lapses} times. Session retry: ${sessionRetryCount}. ` +
          `Student's recent avg rating: ${recentAvgRating}.` +
          (isRelearningPass ? " Relearning pass: yes (same session, after Again — prioritize targeted re-encoding)." : "") +
          `\n\n` +
          "Respond in EXACT JSON format and nothing else:\n" +
          schemaForMode +
          fieldSepForMode;

        const modeTokenLimits = {
          insight: 256,
          quick: 512,
          acknowledge: 512,
          socratic: 1024,
          teach: 1024,
          freeform: 512
        };
        const maxOut = modeTokenLimits[mode] || 1024;
        const lectureCtxBlock = body.lectureContext
          ? `\nLECTURE CONTEXT (source material the student studied):\n${body.lectureContext.courseDigest || ""}` +
            `${body.lectureContext.topicChunk ? "\n\nRELEVANT SECTION:\n" + body.lectureContext.topicChunk : ""}\n\n---\n\n`
          : "";
        let sessionSummaryBlock = "";
        const sessionSummary = Array.isArray(context.sessionSummary) ? context.sessionSummary : [];
        if (sessionSummary.length > 0) {
          sessionSummaryBlock = "\nSESSION CONTEXT (prior cards this session):\n" +
            sessionSummary.map((s, i) => `${i + 1}. ${String(s).substring(0, 200)}`).join("\n") +
            "\n\nUse this context to build bridges: reference topics the student got right earlier, " +
            "connect related concepts across cards, and avoid re-explaining things they already demonstrated understanding of.\n\n---\n\n";
        }
        const isFollowUpTurn = conversation.length >= 2;
        const systemPromptFinal = isFollowUpTurn
          ? systemPrompt + supportiveVoiceBlock + "\n\n" + modeInstructionsBase[mode]
          : systemPromptAugmented;

        const dynamicPrompt =
          modeInstructionsForMode +
          "\n\n---\n\n" +
          sessionSummaryBlock +
          lectureCtxBlock +
          itemBlock +
          "\n" +
          userBlock;
                const geminiRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemPromptFinal }]
            },
            contents: [{ parts: [{ text: dynamicPrompt }] }],
            generationConfig: {
              temperature: 0.35,
              maxOutputTokens: maxOut,
              responseMimeType: "application/json",
              responseSchema: responseSchemaObjects[mode] || responseSchemaObjects.socratic
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
        const rawText = extractGeminiText(geminiData);

        const parsed = parseJsonResponse(rawText);

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

    // ── Syllabus / course context distillation (Flash) ──
    if (url.pathname === "/studyengine/syllabus") {
      const sylCorsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key",
        "Access-Control-Max-Age": "86400"
      };

      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405, headers: { ...sylCorsHeaders, "Content-Type": "application/json" }
        });
      }

      try {
        const body = await request.json();
        const rawTextIn = body.rawText != null ? String(body.rawText).trim() : "";
        const courseName = body.courseName != null ? String(body.courseName).trim() : "";
        const existingExamType = body.existingExamType != null ? String(body.existingExamType) : "";

        if (!rawTextIn || !courseName) {
          return new Response(JSON.stringify({ error: "rawText and courseName required" }), {
            status: 400, headers: { ...sylCorsHeaders, "Content-Type": "application/json" }
          });
        }

        const rawText = rawTextIn.length > 15000 ? rawTextIn.slice(0, 15000) : rawTextIn;

        const sylSystemInstruction = "You are analysing a university course syllabus or exam document. Extract structured information that will help an AI study tutor personalise its feedback for this course.";
        const sylDynamicContent =
          `COURSE: ${courseName}\n` +
          `KNOWN EXAM TYPE: ${existingExamType || "Unknown"}\n\n` +
          `RAW DOCUMENT TEXT:\n${rawText}\n\n` +
          `Extract the following. If information is not available, use null.\n\n` +
          `Respond in EXACT JSON:\n` +
          `{\n` +
          `  "syllabusContext": "2-4 sentence summary of the course scope, key themes, and learning objectives. Max 500 chars.",\n` +
          `  "examFormat": "Specific exam format details beyond just the type. e.g., '3 essay questions, choose 2, 3 hours, worth 40%'. Max 200 chars. Null if not found.",\n` +
          `  "professorValues": "What the instructor explicitly values in student work. Look for grading criteria, rubric descriptions, or stated expectations. Max 300 chars. Null if not found.",\n` +
          `  "allowedMaterials": "What materials are allowed in the exam. Null if not found.",\n` +
          `  "keyTopics": ["List of 5-15 key topics or themes mentioned in the syllabus"],\n` +
          `  "examWeight": null\n` +
          `}\n\n` +
          `examWeight should be a number 0-100 if the document states a final exam or midterm percentage, else null.`;

        const sylUrl =
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
          env.GEMINI_API_KEY;

        const sylRes = await fetch(sylUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: sylSystemInstruction }]
            },
            contents: [{ parts: [{ text: sylDynamicContent }] }],
            generationConfig: {
              temperature: 0.35,
              maxOutputTokens: 1024,
              responseMimeType: "application/json"
            }
          })
        });

        if (!sylRes.ok) {
          const errText = await sylRes.text();
          return new Response(JSON.stringify({ error: "Gemini API error", detail: errText }), {
            status: 502, headers: { ...sylCorsHeaders, "Content-Type": "application/json" }
          });
        }

        const sylData = await sylRes.json();
        const sylRaw = extractGeminiText(sylData);
        let parsedSyl = parseJsonResponse(sylRaw);

        if (!parsedSyl || typeof parsedSyl !== "object") {
          return new Response(JSON.stringify({ error: "Failed to parse syllabus response" }), {
            status: 500, headers: { ...sylCorsHeaders, "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify(parsedSyl), {
          status: 200, headers: { ...sylCorsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Syllabus processing failed", detail: e.message }), {
          status: 500, headers: { ...sylCorsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ── Tutor memory extraction (background / Flash) ──
    if (url.pathname === "/studyengine/memory") {
      const memCorsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key",
        "Access-Control-Max-Age": "86400"
      };

      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405, headers: { ...memCorsHeaders, "Content-Type": "application/json" }
        });
      }

      try {
        const body = await request.json();
        const item = body.item || {};
        const userName = String(body.userName || "there").trim() || "there";
        const dialogue = Array.isArray(body.dialogue) ? body.dialogue : [];
        const suggestedRating =
          body.suggestedRating != null ? Number(body.suggestedRating) : 2;
        const existingMemories = Array.isArray(body.existingMemories) ? body.existingMemories : [];

        if (!item.prompt || !item.modelAnswer || dialogue.length < 1) {
          return new Response(JSON.stringify({ action: null }), {
            status: 200, headers: { ...memCorsHeaders, "Content-Type": "application/json" }
          });
        }

        let dialogueText = "";
        for (const turn of dialogue) {
          const role = turn.role === "tutor" ? "Tutor" : "Student";
          const text = turn.text != null ? String(turn.text) : "";
          dialogueText += `${role}: ${text}\n`;
        }

        let existingBlock = "None yet";
        if (existingMemories.length > 0) {
          existingBlock = existingMemories
            .map(
              (m) =>
                `- [${m.id || "?"}] (${m.type || "?"}, confidence ${m.confidence ?? "?"}) ${m.content || ""}`
            )
            .join("\n");
        }

        const memoryPrompt =
          `You are a learning analytics engine. You just observed a tutoring dialogue between a student and an AI tutor. Your job is to extract durable observations about the student's learning patterns.\n\n` +
          `STUDENT: ${userName}\n` +
          `COURSE: ${item.course || ""}\n` +
          `TOPIC: ${item.topic || ""}\n` +
          `QUESTION: ${item.prompt}\n` +
          `SUGGESTED RATING: ${suggestedRating} (1=Again, 2=Hard, 3=Good, 4=Easy)\n\n` +
          `DIALOGUE:\n${dialogueText}\n` +
          `EXISTING MEMORIES ABOUT THIS STUDENT (course-specific and global):\n${existingBlock}\n\n` +
          `INSTRUCTIONS:\n` +
          `Analyse the dialogue and decide ONE of:\n` +
          `1. CREATE a new memory if you observe a pattern, misconception, strength, or cross-topic connection that is NOT already captured in existing memories.\n` +
          `2. UPDATE an existing memory if this dialogue reinforces, contradicts, or refines a prior observation. Reference the memory ID.\n` +
          `3. Return null if the dialogue was unremarkable or the existing memories already cover this pattern.\n\n` +
          `- scope: "course" if the observation is specific to this course's content, "global" if it's about the student's general learning behaviour (e.g., "Tends to write conclusions before fully developing evidence" is global; "Confuses trade creation with trade diversion" is course-specific).\n\n` +
          `Memory types:\n` +
          `- "pattern": A recurring error or behaviour (e.g., "Consistently misses application step — identifies rules but cannot map them to facts")\n` +
          `- "misconception": A specific wrong mental model (e.g., "Conflates trade creation with trade diversion — treats them as the same concept")\n` +
          `- "strength": Reliable knowledge the student consistently demonstrates (e.g., "Strong recall of GATT article numbers and their functions")\n` +
          `- "connection": A cross-topic or cross-course link (e.g., "Weakness on collective action in International Trade mirrors weakness on interest group theory in Canadian Politics")\n\n` +
          `Rules:\n` +
          `- Be specific. "Struggles with trade" is useless. "Misses the political economy dimension of trade agreements — understands welfare effects but not lobbying mechanisms" is useful.\n` +
          `- Confidence (0.0-1.0): How sure are you this is a real pattern vs a one-off? Single occurrence = 0.3-0.5. Reinforced by existing memory = 0.7-0.9.\n` +
          `- Keep content under 200 characters.\n` +
          `- If updating, increase confidence if reinforced, decrease if contradicted.\n` +
          `- relatedTopics: list 0-3 topic names this memory connects to.\n\n` +
          `Respond in EXACT JSON:\n` +
          `{\n` +
          `  "action": "create" | "update" | null,\n` +
          `  "memory": {\n` +
          `    "id": "mem_<random8chars>" (for create) or existing ID (for update),\n` +
          `    "type": "pattern" | "misconception" | "strength" | "connection",\n` +
          `    "content": "Specific observation under 200 chars",\n` +
          `    "course": "course name (use empty string for global-only observations)",\n` +
          `    "scope": "course" | "global",\n` +
          `    "relatedTopics": ["topic1", "topic2"],\n` +
          `    "confidence": 0.6\n` +
          `  }\n` +
          `}\n\n` +
          `If no action needed, respond: { "action": null }`;

        const flashUrl =
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
          env.GEMINI_API_KEY;

        const memRes = await fetch(flashUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: "You are a learning analytics engine. You observe tutoring dialogues and extract durable observations about a student's learning patterns. You output JSON." }]
            },
            contents: [{ parts: [{ text: memoryPrompt }] }],
            generationConfig: {
              temperature: 0.35,
              maxOutputTokens: 256,
              responseMimeType: "application/json"
            }
          })
        });

        if (!memRes.ok) {
          return new Response(JSON.stringify({ action: null }), {
            status: 200, headers: { ...memCorsHeaders, "Content-Type": "application/json" }
          });
        }

        const memData = await memRes.json();
        const memRaw = extractGeminiText(memData);
        let parsedMem = parseJsonResponse(memRaw);

        if (!parsedMem || typeof parsedMem !== "object") {
          return new Response(JSON.stringify({ action: null }), {
            status: 200, headers: { ...memCorsHeaders, "Content-Type": "application/json" }
          });
        }

        if (parsedMem.action !== "create" && parsedMem.action !== "update") {
          return new Response(JSON.stringify({ action: null }), {
            status: 200, headers: { ...memCorsHeaders, "Content-Type": "application/json" }
          });
        }

        const mem = parsedMem.memory;
        if (!mem || typeof mem !== "object" || !mem.content) {
          return new Response(JSON.stringify({ action: null }), {
            status: 200, headers: { ...memCorsHeaders, "Content-Type": "application/json" }
          });
        }

        if (parsedMem.action === "create" && !String(mem.id || "").startsWith("mem_")) {
          const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
          let suf = "";
          const arr = new Uint8Array(8);
          crypto.getRandomValues(arr);
          for (let i = 0; i < 8; i++) suf += chars[arr[i] % chars.length];
          mem.id = "mem_" + suf;
        }

        mem.course = mem.course || item.course || "";
        if (mem.scope !== "global" && mem.scope !== "course") mem.scope = "course";
        if (mem.scope === "global" && !mem.course) mem.course = "";
        if (!Array.isArray(mem.relatedTopics)) mem.relatedTopics = [];

        return new Response(JSON.stringify({ action: parsedMem.action, memory: mem }), {
          status: 200, headers: { ...memCorsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ action: null }), {
          status: 200, headers: { ...memCorsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ── Leech Card Reformulation (Flash) ──
    if (url.pathname === "/studyengine/reformulate") {
      const refCorsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key",
        "Access-Control-Max-Age": "86400"
      };

      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405, headers: { ...refCorsHeaders, "Content-Type": "application/json" }
        });
      }

      try {
        const body = await request.json();
        const originalPrompt = String(body.originalPrompt || "").trim();
        const modelAnswer = String(body.modelAnswer || "").trim();
        const tier = String(body.tier || "explain");
        const course = String(body.course || "");
        const topic = String(body.topic || "");
        const lapses = Number(body.lapses) || 3;
        const diagnosisHistory = Array.isArray(body.diagnosisHistory)
          ? body.diagnosisHistory.slice(-5) : [];

        if (!originalPrompt || !modelAnswer) {
          return new Response(JSON.stringify({ error: "originalPrompt and modelAnswer required" }), {
            status: 400, headers: { ...refCorsHeaders, "Content-Type": "application/json" }
          });
        }

        let diagnosisBlock = "";
        if (diagnosisHistory.length > 0) {
          const typeCounts = {};
          for (const d of diagnosisHistory) {
            if (d && d.type) typeCounts[d.type] = (typeCounts[d.type] || 0) + 1;
          }
          const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];
          if (topType) {
            diagnosisBlock = `\nThe student's most common error type on this card is "${topType[0]}" (${topType[1]} of ${diagnosisHistory.length} attempts).` +
              `Design the reformulated prompt to specifically target this error pattern.\n`;
          }
        }

        const reformulatePrompt =
          `A student has failed this study card ${lapses} times. The same prompt keeps triggering the same failed retrieval.` +
          `Your job is to create an ALTERNATIVE prompt that tests the SAME knowledge from a DIFFERENT angle.\n\n` +
          `ORIGINAL PROMPT: ${originalPrompt}\n` +
          `MODEL ANSWER: ${modelAnswer}\n` +
          `CURRENT TIER: ${tier}\n` +
          `COURSE: ${course}\n` +
          `TOPIC: ${topic}\n` +
          diagnosisBlock +
          `\nRULES:\n` +
          `1. The reformulated prompt MUST test the same core knowledge as the original.\n` +
          `2. The model answer should remain substantially the same (the student needs to recall the same information).\n` +
          `3. Change the ANGLE of approach. Examples:\n` +
          `- If original asks "What is X?", reformulate as "Why does X matter for Y?" or "Compare X to Z"\n` +
          `- If original asks for a definition, reformulate as an application scenario\n` +
          `- If original asks "Explain X", reformulate as "A student says [common misconception]. What's wrong with this?"\n` +
          `- If original is a comparison, reformulate as "Given [scenario], which concept applies and why?"\n` +
          `4. The reformulated prompt should be approximately the same length as the original.\n` +
          `5. Do NOT make it easier. The goal is a different retrieval pathway, not a lower bar.\n` +
          `6. If the original has a task or scenario field, generate a new scenario that tests the same principle.\n\n` +
          `Respond in EXACT JSON:\n` +
          `{\n` +
          `  "reformulatedPrompt": "The new prompt text",\n` +
          `  "reformulatedTier": "The suggested tier for this reformulation (quickfire|explain|apply|distinguish)",\n` +
          `  "rationale": "One sentence explaining what angle you changed and why"\n` +
          `}`;

        const flashUrl =
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
          env.GEMINI_API_KEY;

        const refRes = await fetch(flashUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: "You are a study card designer. You reformulate failed flashcard prompts to create alternative retrieval pathways while testing the same knowledge. Output JSON." }]
            },
            contents: [{ parts: [{ text: reformulatePrompt }] }],
            generationConfig: {
              temperature: 0.6,
              maxOutputTokens: 512,
              responseMimeType: "application/json",
              responseSchema: {
                type: "object",
                properties: {
                  reformulatedPrompt: { type: "string" },
                  reformulatedTier: {
                    type: "string",
                    enum: ["quickfire", "explain", "apply", "distinguish"]
                  },
                  rationale: { type: "string" }
                },
                required: ["reformulatedPrompt", "reformulatedTier", "rationale"]
              }
            }
          })
        });

        if (!refRes.ok) {
          const errText = await refRes.text();
          return new Response(JSON.stringify({ error: "Gemini API error", detail: errText }), {
            status: 502, headers: { ...refCorsHeaders, "Content-Type": "application/json" }
          });
        }

        const refData = await refRes.json();
        const refRaw = extractGeminiText(refData);
        const parsedRef = parseJsonResponse(refRaw);

        if (!parsedRef || !parsedRef.reformulatedPrompt) {
          return new Response(JSON.stringify({ error: "Failed to parse reformulation" }), {
            status: 500, headers: { ...refCorsHeaders, "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify(parsedRef), {
          status: 200, headers: { ...refCorsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Reformulate failed", detail: e.message }), {
          status: 500, headers: { ...refCorsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ── Session summary (Flash, plain text) ──
    if (url.pathname === "/studyengine/summary") {
      const sumCorsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key",
        "Access-Control-Max-Age": "86400"
      };

      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405, headers: { ...sumCorsHeaders, "Content-Type": "application/json" }
        });
      }

      try {
        const body = await request.json();
        const userName = String(body.userName || "there").trim() || "there";
        const sessionStats = body.sessionStats && typeof body.sessionStats === "object" ? body.sessionStats : {};
        const weakCards = Array.isArray(body.weakCards) ? body.weakCards : [];
        const strongCards = Array.isArray(body.strongCards) ? body.strongCards : [];
        const calibrationBefore =
          body.calibrationBefore != null && !Number.isNaN(Number(body.calibrationBefore))
            ? Number(body.calibrationBefore)
            : null;
        const calibrationAfter =
          body.calibrationAfter != null && !Number.isNaN(Number(body.calibrationAfter))
            ? Number(body.calibrationAfter)
            : null;

        const totalCards = Number(sessionStats.totalCards) || 0;
        const avgRating = Number(sessionStats.avgRating) || 0;
        const dist = sessionStats.ratingDistribution || {};
        const courses = sessionStats.courseBreakdown || {};
        const dontKnows = Number(sessionStats.dontKnows) || 0;
        const skips = Number(sessionStats.skips) || 0;
        const tutorModes = sessionStats.tutorModes || {};

        const weakLine =
          weakCards.length > 0
            ? `- Struggled with: ${weakCards
                .map((c) => `${c.topic || "General"} (${String(c.prompt || "").substring(0, 60)})`)
                .join("; ")}`
            : "";
        const strongLine =
          strongCards.length > 0
            ? `- Strong on: ${strongCards.map((c) => c.topic || "General").join(", ")}`
            : "";

        const calLine =
          calibrationBefore != null && calibrationAfter != null
            ? `- Calibration: was ${Math.round(calibrationBefore * 100)}%, now ${Math.round(calibrationAfter * 100)}%`
            : "- Calibration: Not enough data";

        const summaryPrompt =
          `You are generating a brief session summary for a study engine. Be specific and actionable.\n\n` +
          `STUDENT: ${userName}\n\n` +
          `SESSION DATA:\n` +
          `- ${totalCards} cards reviewed\n` +
          `- Average rating: ${avgRating.toFixed(1)} (1=Again, 4=Easy)\n` +
          `- Rating distribution: ${JSON.stringify(dist)}\n` +
          `- Courses: ${JSON.stringify(courses)}\n` +
          `- Don't Knows: ${dontKnows}\n` +
          `- Skipped dialogues: ${skips}\n` +
          `- Tutor modes used: ${JSON.stringify(tutorModes)}\n` +
          `${weakLine ? weakLine + "\n" : ""}` +
          `${strongLine ? strongLine + "\n" : ""}` +
          `${calLine}\n\n` +
          "Write a 3-4 sentence summary that:\n" +
          "1. Highlights what went well (cite specific topics)\n" +
          "2. Identifies the key weakness or pattern (cite specific topics or card types)\n" +
          "3. Gives one specific, actionable suggestion for the next session\n" +
          "4. Notes calibration change if meaningful\n\n" +
          "Keep it concise and direct. No fluff. Address the student by name once.\n\n" +
          "Respond as plain text (NOT JSON). Just the summary paragraph.";

        const sumUrl =
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
          env.GEMINI_API_KEY;

        const sumRes = await fetch(sumUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: "You are generating a brief session summary for a study engine. Be specific and actionable. Respond as plain text, not JSON. 3-4 sentences." }]
            },
            contents: [{ parts: [{ text: summaryPrompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 256 }
          })
        });

        if (!sumRes.ok) {
          const errText = await sumRes.text();
          return new Response(JSON.stringify({ error: "Gemini API error", detail: errText }), {
            status: 502, headers: { ...sumCorsHeaders, "Content-Type": "application/json" }
          });
        }

        const sumData = await sumRes.json();
        const summaryText = String(extractGeminiText(sumData) || "").trim();
        if (!summaryText) {
          return new Response(JSON.stringify({ error: "Empty summary" }), {
            status: 500, headers: { ...sumCorsHeaders, "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify({ summary: summaryText }), {
          status: 200, headers: { ...sumCorsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Summary failed", detail: e.message }), {
          status: 500, headers: { ...sumCorsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ── Auto-prepare course context from imported cards (Flash) ──
    if (url.pathname === "/studyengine/prepare") {
      const prepCorsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key",
        "Access-Control-Max-Age": "86400"
      };

      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405, headers: { ...prepCorsHeaders, "Content-Type": "application/json" }
        });
      }

      try {
        const body = await request.json();
        const courseName = body.courseName != null ? String(body.courseName).trim() : "";
        let cards = Array.isArray(body.cards) ? body.cards : [];
        const existingCourseContext =
          body.existingCourseContext && typeof body.existingCourseContext === "object"
            ? body.existingCourseContext
            : {};

        if (!courseName || cards.length < 1) {
          return new Response(JSON.stringify({ error: "courseName and cards (min 1) required" }), {
            status: 400, headers: { ...prepCorsHeaders, "Content-Type": "application/json" }
          });
        }

        cards = cards.slice(0, 50);
        const sampleBlock = cards
          .map((c, i) => {
            const p = String(c.prompt != null ? c.prompt : "").substring(0, 200);
            const top = c.topic != null ? String(c.topic) : "General";
            return `${i + 1}. [${top}] ${p}`;
          })
          .join("\n");

        const prepPrompt =
          `You are analysing a batch of study cards just imported into a spaced repetition study engine.\n\n` +
          `COURSE: ${courseName}\n` +
          `NUMBER OF CARDS: ${cards.length}\n` +
          `EXISTING COURSE CONTEXT: ${existingCourseContext.syllabusContext || "None yet"}\n\n` +
          `SAMPLE CARDS (up to 50):\n${sampleBlock}\n\n` +
          `Analyse this batch and produce:\n` +
          `1. If no existing syllabusContext: infer a 2-3 sentence course scope summary from the card topics and prompts.\n` +
          `2. Identify the key topics/themes present in this batch.\n` +
          `3. Generate 1-2 initial learner observations useful for an AI tutor (e.g., "This batch is heavily weighted toward application questions" or "Cards span 6 topics — initial sessions should reveal weak areas").\n` +
          `4. A one-line summary for the user.\n\n` +
          `Respond in EXACT JSON:\n` +
          `{\n` +
          `  "syllabusContext": "2-3 sentence inferred scope, or null if existing is adequate",\n` +
          `  "keyTopics": ["topic1", "topic2"],\n` +
          `  "initialMemories": [\n` +
          `    { "type": "pattern", "content": "under 200 chars", "scope": "course", "confidence": 0.3 }\n` +
          `  ],\n` +
          `  "userSummary": "Imported X cards across Y topics. Key themes: ..."\n` +
          `}\n`;

        const prepUrl =
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
          env.GEMINI_API_KEY;

        const prepRes = await fetch(prepUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: "You are analysing a batch of study cards imported into a spaced repetition study engine. Infer course scope, key topics, and initial learner observations. Respond in JSON." }]
            },
            contents: [{ parts: [{ text: prepPrompt }] }],
            generationConfig: {
              temperature: 0.35,
              maxOutputTokens: 1024,
              responseMimeType: "application/json"
            }
          })
        });

        if (!prepRes.ok) {
          const errText = await prepRes.text();
          return new Response(JSON.stringify({ error: "Gemini API error", detail: errText }), {
            status: 502, headers: { ...prepCorsHeaders, "Content-Type": "application/json" }
          });
        }

        const prepData = await prepRes.json();
        const prepRaw = extractGeminiText(prepData);
        let parsedPrep = parseJsonResponse(prepRaw);

        if (!parsedPrep || typeof parsedPrep !== "object") {
          return new Response(JSON.stringify({ error: "Failed to parse prepare response" }), {
            status: 500, headers: { ...prepCorsHeaders, "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify(parsedPrep), {
          status: 200, headers: { ...prepCorsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Prepare failed", detail: e.message }), {
          status: 500, headers: { ...prepCorsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ── Prequestion Generation Route ──
    if (url.pathname === "/studyengine/prime") {
      const primeCorsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key",
        "Access-Control-Max-Age": "86400"
      };

      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405,
          headers: { ...primeCorsHeaders, "Content-Type": "application/json" }
        });
      }

      try {
        const body = await request.json();
        const courseName = body.courseName || "";
        const topicName = body.topicName || "";
        const syllabusContext = body.syllabusContext || "";
        const existingCards = Array.isArray(body.existingCards) ? body.existingCards.slice(0, 20) : [];

        if (!courseName && !topicName) {
          return new Response(JSON.stringify({ error: "courseName or topicName required" }), {
            status: 400,
            headers: { ...primeCorsHeaders, "Content-Type": "application/json" }
          });
        }

        const cardContext = existingCards
          .map((c, i) => `${i + 1}. ${String(c.prompt || "").substring(0, 100)}`)
          .join("\n");

        const primePrompt =
          `Generate 2-3 prequestions for a student about to study ${topicName || courseName}.\n\n` +
          `COURSE: ${courseName}\n` +
          `TOPIC: ${topicName}\n` +
          `COURSE SCOPE: ${syllabusContext || "Not specified"}\n\n` +
          (cardContext ? `EXISTING CARDS ON THIS TOPIC (for context, not repetition):\n${cardContext}\n\n` : "") +
          `PREQUESTION RULES:\n` +
          `- Questions should be answerable from the upcoming material but the student likely cannot answer them yet\n` +
          `- They should prime the student's attention toward KEY concepts, not trivia\n` +
          `- Mix difficulty: one factual recall, one conceptual "why" question\n` +
          `- Keep questions concise (1-2 sentences each)\n\n` +
          `Respond in EXACT JSON:\n` +
          `{\n` +
          `  "prequestions": [\n` +
          `    { "question": "...", "type": "factual" | "conceptual" | "application" }\n` +
          `  ]\n` +
          `}`;

        const primeUrl =
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
          env.GEMINI_API_KEY;

        const primeRes = await fetch(primeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text:
                    "Generate prequestions to prime a student's encoding before they study new material. Output JSON."
                }
              ]
            },
            contents: [{ parts: [{ text: primePrompt }] }],
            generationConfig: {
              temperature: 0.5,
              maxOutputTokens: 512,
              responseMimeType: "application/json"
            }
          })
        });

        if (!primeRes.ok) {
          const errText = await primeRes.text();
          return new Response(JSON.stringify({ error: "Gemini API error", detail: errText }), {
            status: 502,
            headers: { ...primeCorsHeaders, "Content-Type": "application/json" }
          });
        }

        const primeData = await primeRes.json();
        const primeRaw = extractGeminiText(primeData);
        const parsed = parseJsonResponse(primeRaw);

        if (!parsed || !Array.isArray(parsed.prequestions)) {
          return new Response(JSON.stringify({ prequestions: [] }), {
            status: 200,
            headers: { ...primeCorsHeaders, "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify(parsed), {
          status: 200,
          headers: { ...primeCorsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Prime failed", detail: e.message }), {
          status: 500,
          headers: { ...primeCorsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ── Lecture Context Fetch Route (fetch a URL and return extracted text) ──
    if (url.pathname === "/studyengine/fetch-lecture") {
      const fetchCorsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key",
        "Access-Control-Max-Age": "86400"
      };

      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405, headers: { ...fetchCorsHeaders, "Content-Type": "application/json" }
        });
      }

      try {
        const body = await request.json();
        const targetUrl = String(body.url || "").trim();

        if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
          return new Response(JSON.stringify({ error: "Valid URL required" }), {
            status: 400, headers: { ...fetchCorsHeaders, "Content-Type": "application/json" }
          });
        }

        const pageRes = await fetch(targetUrl, {
          headers: {
            "User-Agent": "StudyEngine-LectureImport/1.0",
            "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8"
          }
        });

        if (!pageRes.ok) {
          return new Response(JSON.stringify({ error: "Failed to fetch URL", status: pageRes.status }), {
            status: 502, headers: { ...fetchCorsHeaders, "Content-Type": "application/json" }
          });
        }

        const contentType = pageRes.headers.get("content-type") || "";
        let html = "";
        let rawText = "";

        if (contentType.includes("text/plain")) {
          rawText = await pageRes.text();
        } else {
          html = await pageRes.text();

          // Use HTMLRewriter to stream-extract text content.
          const textChunks = [];
          const rewriter = new HTMLRewriter()
            .on("script", { element(el) { el.remove(); } })
            .on("style", { element(el) { el.remove(); } })
            .on("noscript", { element(el) { el.remove(); } })
            .on("svg", { element(el) { el.remove(); } })
            .on("nav", { element(el) { el.remove(); } })
            .on("header", { element(el) { el.remove(); } })
            .on("footer", { element(el) { el.remove(); } })
            .on("body", {
              text(t) {
                const s = t.text;
                if (s && s.trim()) textChunks.push(s);
              }
            });

          // Consume transformed output to execute handlers.
          await rewriter.transform(new Response(html)).text();

          rawText = textChunks
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
        }

        // Truncate to 60K chars (distill truncates further)
        if (rawText.length > 60000) rawText = rawText.slice(0, 60000);

        const titleMatch = typeof html === "string" ? html.match(/<title[^>]*>([^<]*)<\/title>/i) : null;
        const pageTitle = titleMatch ? String(titleMatch[1] || "").trim() : "";

        return new Response(JSON.stringify({
          text: rawText,
          title: pageTitle,
          charCount: rawText.length,
          source: targetUrl
        }), {
          status: 200, headers: { ...fetchCorsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Fetch failed", detail: e.message }), {
          status: 500, headers: { ...fetchCorsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ── Lecture Distillation Route ──
    if (url.pathname === "/studyengine/distill") {
      const distillCorsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key",
        "Access-Control-Max-Age": "86400"
      };

      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405, headers: { ...distillCorsHeaders, "Content-Type": "application/json" }
        });
      }

      try {
        const body = await request.json();
        const courseName = String(body.courseName || "").trim();
        const lectureTitle = String(body.lectureTitle || "").trim();
        let rawText = String(body.rawText || "").trim();
        const existingContext = String(body.existingSyllabusContext || "").trim();

        if (!courseName || !rawText) {
          return new Response(JSON.stringify({ error: "courseName and rawText required" }), {
            status: 400, headers: { ...distillCorsHeaders, "Content-Type": "application/json" }
          });
        }

        // Truncate to keep token usage sane.
        if (rawText.length > 30000) rawText = rawText.slice(0, 30000);

        const distillPrompt =
          `You are processing a university lecture for a spaced repetition study engine.\n\n` +
          `COURSE: ${courseName}\n` +
          `LECTURE: ${lectureTitle || "Untitled"}\n` +
          `EXISTING COURSE CONTEXT: ${existingContext || "None yet"}\n\n` +
          `RAW LECTURE TEXT:\n${rawText}\n\n` +
          `Produce THREE outputs:\n\n` +
          `1. courseDigestUpdate: Merge this lecture's key concepts into the existing course digest. ` +
          `Max ~800 tokens. Include: theoretical frameworks, key definitions, important arguments, professor emphasis areas, and how this lecture connects to broader course themes. ` +
          `If existing context is "None yet", create a fresh digest.\n\n` +
          `2. topicChunks: Split the lecture into 3-8 topic sections. Each chunk should be self-contained and roughly 200-500 tokens. ` +
          `Include a topic label, keyTerms array, and the essential content. Topic labels should match the granularity a flashcard's "topic" field would use.\n\n` +
          `3. suggestedCards: Generate 3-5 high-quality flashcard candidates from the lecture. ` +
          `Each with: prompt (a question), modelAnswer (comprehensive answer), topic (matching a topicChunks label), and tier ("quickfire", "explain", or "apply").\n\n` +
          `Respond in EXACT JSON:\n` +
          `{\n` +
          `  "courseDigestUpdate": "Updated course digest text...",\n` +
          `  "topicChunks": [\n` +
          `    { "topic": "Topic Label", "keyTerms": ["term1", "term2"], "content": "Chunk content..." }\n` +
          `  ],\n` +
          `  "suggestedCards": [\n` +
          `    { "prompt": "Question?", "modelAnswer": "Answer...", "topic": "Topic Label", "tier": "explain" }\n` +
          `  ]\n` +
          `}`;

        const distillUrl =
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
          env.GEMINI_API_KEY;

        const distillRes = await fetch(distillUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: "You process university lectures into structured context for a spaced repetition study engine. Output JSON." }]
            },
            contents: [{ parts: [{ text: distillPrompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 4096,
              responseMimeType: "application/json"
            }
          })
        });

        if (!distillRes.ok) {
          const errText = await distillRes.text();
          return new Response(JSON.stringify({ error: "Gemini API error", detail: errText }), {
            status: 502, headers: { ...distillCorsHeaders, "Content-Type": "application/json" }
          });
        }

        const distillData = await distillRes.json();
        const distillRaw = extractGeminiText(distillData);
        const parsed = parseJsonResponse(distillRaw);

        if (!parsed || typeof parsed !== "object") {
          return new Response(JSON.stringify({ error: "Failed to parse distill response", raw: distillRaw }), {
            status: 500, headers: { ...distillCorsHeaders, "Content-Type": "application/json" }
          });
        }

        const courseKey = courseName.replace(/[^a-zA-Z0-9_-]/g, "_");
        const chunks = Array.isArray(parsed.topicChunks) ? parsed.topicChunks : [];
        const storedChunkKeys = [];

        for (const chunk of chunks) {
          if (!chunk || !chunk.topic || !chunk.content) continue;
          const topic = String(chunk.topic);
          const topicHash = hashString(topic.toLowerCase().trim());
          const kvKey = `lectureCtx:${courseKey}:${topicHash}`;
          try {
            await env.WIDGET_KV.put(kvKey, JSON.stringify({
              topic: topic,
              keyTerms: Array.isArray(chunk.keyTerms) ? chunk.keyTerms.slice(0, 24) : [],
              content: String(chunk.content).slice(0, 12000)
            }), { expirationTtl: 180 * 24 * 60 * 60 });
            storedChunkKeys.push({ topic, kvKey });
          } catch (kvErr) {
            console.error("KV lecture chunk write error:", kvErr.message);
          }
        }

        // Store a manifest of all chunk keys for this course
        const manifestKey = `lectureManifest:${courseKey}`;
        let manifest = [];
        try {
          const existing = await env.WIDGET_KV.get(manifestKey, "json");
          if (Array.isArray(existing)) manifest = existing;
        } catch (e) { }
        for (const sk of storedChunkKeys) {
          if (!manifest.some((m) => m && m.kvKey === sk.kvKey)) manifest.push(sk);
        }
        try {
          await env.WIDGET_KV.put(manifestKey, JSON.stringify(manifest), { expirationTtl: 180 * 24 * 60 * 60 });
        } catch (e) { }

        return new Response(JSON.stringify({
          courseDigestUpdate: parsed.courseDigestUpdate || "",
          topicChunks: storedChunkKeys,
          suggestedCards: Array.isArray(parsed.suggestedCards) ? parsed.suggestedCards : [],
          totalChunksStored: storedChunkKeys.length
        }), {
          status: 200, headers: { ...distillCorsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Distill failed", detail: e.message }), {
          status: 500, headers: { ...distillCorsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ── Fetch lecture context for a specific topic (used by client before grading) ──
    if (url.pathname === "/studyengine/lecture-context") {
      const lcCorsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key",
        "Access-Control-Max-Age": "86400"
      };

      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405, headers: { ...lcCorsHeaders, "Content-Type": "application/json" }
        });
      }

      try {
        const body = await request.json();
        const courseName = String(body.courseName || "").trim();
        const topic = String(body.topic || "").trim();

        if (!courseName) {
          return new Response(JSON.stringify({ topicChunk: null }), {
            status: 200, headers: { ...lcCorsHeaders, "Content-Type": "application/json" }
          });
        }

        const courseKey = courseName.replace(/[^a-zA-Z0-9_-]/g, "_");
        let chunk = null;

        if (topic) {
          const topicHash = hashString(topic.toLowerCase().trim());
          const kvKey = `lectureCtx:${courseKey}:${topicHash}`;
          const stored = await env.WIDGET_KV.get(kvKey, "json");
          if (stored && stored.content) chunk = stored;
        }

        // If no exact match, try a simple overlap match against manifest topics
        if (!chunk && topic) {
          const manifestKey = `lectureManifest:${courseKey}`;
          const manifest = await env.WIDGET_KV.get(manifestKey, "json");
          if (Array.isArray(manifest) && manifest.length > 0) {
            const topicWords = topic.toLowerCase().split(/\s+/).filter(Boolean);
            let bestMatch = null;
            let bestScore = 0;
            for (const entry of manifest) {
              if (!entry || !entry.topic || !entry.kvKey) continue;
              const entryWords = String(entry.topic).toLowerCase().split(/\s+/).filter(Boolean);
              const overlap = topicWords.filter((w) =>
                entryWords.some((ew) => ew.includes(w) || w.includes(ew))
              ).length;
              if (overlap > bestScore) {
                bestScore = overlap;
                bestMatch = entry;
              }
            }
            if (bestMatch && bestScore > 0) {
              const stored = await env.WIDGET_KV.get(bestMatch.kvKey, "json");
              if (stored && stored.content) chunk = stored;
            }
          }
        }

        return new Response(JSON.stringify({ topicChunk: chunk }), {
          status: 200, headers: { ...lcCorsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ topicChunk: null }), {
          status: 200, headers: { ...lcCorsHeaders, "Content-Type": "application/json" }
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
                systemInstruction: {
                  parts: [{ text: "You are a patient, expert tutor embedded in a spaced repetition study engine. When a student doesn't know the answer, you TEACH — explain WHY the answer is what it is for deep encoding. Respond in JSON." }]
                },
                contents: [{ parts: [{ text: explainPrompt }] }],
                generationConfig: { temperature: 0.4, maxOutputTokens: 512, responseMimeType: "application/json" }
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
          const explainRaw = extractGeminiText(explainData);
          let explainResult = parseJsonResponse(explainRaw);

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
          const lectureContextBlock = body.lectureContext
            ? `\nLECTURE CONTEXT (source material the student studied — use for calibration):\n${body.lectureContext.courseDigest || ""}\n` +
              `${body.lectureContext.topicChunk ? "\nRELEVANT LECTURE SECTION:\n" + body.lectureContext.topicChunk : ""}\n\n` +
              "Use this context to:\n" +
              "- Verify claims against the actual source material, not just the model answer\n" +
              "- Identify which specific lecture concepts the student failed to retrieve\n" +
              "- Calibrate depth expectations based on how thoroughly the topic was covered in lectures\n" +
              "- Reference specific terms or examples from the lecture in your feedback\n"
            : "";

          gradingPrompt = `You are an expert academic grader embedded in a spaced repetition study engine. Your role is to provide precise, calibrated, evidence-based feedback that helps the student close the gap between their current understanding and the target knowledge.
${lectureContextBlock}

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
              systemInstruction: {
                parts: [{ text: "You are an expert academic grader embedded in a spaced repetition study engine. Provide precise, calibrated, evidence-based feedback. Grade against the model answer as the reference standard. Respond in JSON." }]
              },
              contents: [{ parts: [{ text: gradingPrompt }] }],
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 1024,
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
        const rawText = extractGeminiText(geminiData);

        let grading;
        grading = parseJsonResponse(rawText);

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

        const geminiRes = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + env.GEMINI_API_KEY,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: "You generate minimal Mermaid.js diagrams for study cards. Output ONLY valid Mermaid markup. graph TD or graph LR only. Target 5-7 nodes max 8. Short real-term labels. No code fences, no prose, no explanation." }]
              },
              contents: [{ parts: [{ text: visualPrompt }] }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
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
        const visParts = cand?.content?.parts;
        let visual = "";
        if (Array.isArray(visParts)) {
          const vTextParts = visParts.filter((p) => !p.thought && typeof p.text === "string");
          visual = vTextParts.length > 0 ? vTextParts[vTextParts.length - 1].text : (visParts[visParts.length - 1]?.text || "");
        }
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

    // ── Learn Plan Route ──
    if (url.pathname === "/studyengine/learn-plan") {
      const lpCorsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key",
        "Access-Control-Max-Age": "86400"
      };
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405, headers: { ...lpCorsHeaders, "Content-Type": "application/json" }
        });
      }

      try {
      const body = await request.json();
      if (!body.course || !body.topics || !body.topics.length || !body.cards || !body.cards.length) {
        return new Response(JSON.stringify({ error: "Missing required fields: course, topics, cards" }), {
          status: 400, headers: { ...lpCorsHeaders, "Content-Type": "application/json" }
        });
      }

      const cardSummaries = body.cards.slice(0, 20).map(c => `PROMPT: ${c.prompt}\nANSWER: ${c.modelAnswer}`).join("\n---\n");
      const syllabusCtx = body.courseContext && body.courseContext.syllabusContext ? body.courseContext.syllabusContext : "";
      const profValues = body.courseContext && body.courseContext.professorValues ? body.courseContext.professorValues : "";

      const systemPrompt = `You are designing a teaching sequence for a university student who has NOT yet learned this material. Build understanding from the ground up, one concept at a time.

COURSE: ${body.course}
TOPICS: ${body.topics.join(", ")}
${syllabusCtx ? "SYLLABUS CONTEXT: " + syllabusCtx : ""}
${profValues ? "PROFESSOR VALUES: " + profValues : ""}

CARDS TO TEACH FROM:
${cardSummaries}

RULES:
- Order concepts from foundational to complex (prerequisite logic)
- Each segment teaches ONE concept — never more
- Explanations: 2-4 sentences, precise academic language, no filler
- Elaborations: concrete example, analogy, or connection to prior knowledge
- Check questions must force the student to PRODUCE, never just recognise
- Two check types: "elaborative" (explain in own words) or "predict" (predict what happens next)
- Consolidation questions should span all segments and test recall + connections
- Use the card model answers as content backbone — do not contradict them
- If cards are insufficient, supplement from your knowledge grounded in the course context
- Never reuse phrasing from card prompts in check questions (avoid pattern matching)
- linkedCardIds should reference the "id" field of relevant input cards

Return JSON with this exact structure:
{
  "segments": [
    {
      "id": "seg-1",
      "concept": "Concept Title",
      "explanation": "2-4 sentence explanation",
      "elaboration": "Concrete example or analogy",
      "checkType": "elaborative" or "predict",
      "checkQuestion": "Question forcing student to produce",
      "checkAnswer": "Expected answer",
      "linkedCardIds": ["card-id-1"]
    }
  ],
  "consolidationQuestions": [
    {
      "question": "Retrieval question spanning segments",
      "answer": "Expected answer",
      "linkedCardIds": ["card-id-1"]
    }
  ]
}`;

      const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + env.GEMINI_API_KEY;

      const geminiRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            responseMimeType: "application/json"
          }
        })
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        return new Response(JSON.stringify({ error: "Gemini API error", detail: errText }), {
          status: 502, headers: { ...lpCorsHeaders, "Content-Type": "application/json" }
        });
      }

      const geminiData = await geminiRes.json();

      // Log the structure of what Gemini returned
      const parts = geminiData?.candidates?.[0]?.content?.parts || [];
      console.log("[learn-plan] Part count:", parts.length, "types:", JSON.stringify(parts.map(p => ({ thought: !!p.thought, len: (p.text || "").length }))));

      const rawText = extractGeminiText(geminiData);
      console.log("[learn-plan] extractGeminiText len:", rawText.length, "preview:", rawText.slice(0, 300));

      let parsed = parseJsonResponse(rawText);

      // Fallback 1: brute-force concatenate all non-thought text parts
      if (!parsed || !Array.isArray(parsed.segments) || parsed.segments.length === 0) {
        console.log("[learn-plan] First parse failed, trying brute-force concatenation");
        const allText = parts
          .filter(p => !p.thought && typeof p.text === "string")
          .map(p => p.text)
          .join("");
        console.log("[learn-plan] Brute-force text len:", allText.length, "preview:", allText.slice(0, 300));
        parsed = parseJsonResponse(allText);
      }

      // Fallback 2: scan all parts including thought parts for JSON containing "segments"
      if (!parsed || !Array.isArray(parsed.segments) || parsed.segments.length === 0) {
        console.log("[learn-plan] Brute-force failed, trying all parts including thought");
        for (const part of parts) {
          if (typeof part.text === "string" && part.text.includes('"segments"')) {
            const attempt = parseJsonResponse(part.text);
            if (attempt && Array.isArray(attempt.segments) && attempt.segments.length > 0) {
              parsed = attempt;
              console.log("[learn-plan] Found segments in part with thought=" + !!part.thought);
              break;
            }
          }
        }
      }

      // Fallback 3: use fallback plan if AI response is unusable
      if (!parsed || !Array.isArray(parsed.segments) || parsed.segments.length === 0) {
        parsed = buildFallbackLearnPlan(body);
      }

      if (!parsed || !Array.isArray(parsed.segments) || parsed.segments.length === 0) {
        parsed = buildFallbackLearnPlan(body);
      }
      console.log("[learn-plan] Final result: segments=", parsed.segments.length);

      return new Response(JSON.stringify(parsed), {
        status: 200,
        headers: { ...lpCorsHeaders, "Content-Type": "application/json" }
      });
      } catch (e) {
        console.error("[learn-plan] Error:", e.message);
        // Return fallback plan so client still gets usable segments
        const fallback = buildFallbackLearnPlan(body);
        return new Response(JSON.stringify(fallback), {
          status: 200,
          headers: { ...lpCorsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ── Learn Check Route ──
    if (url.pathname === "/studyengine/learn-check") {
      const lcCorsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key",
        "Access-Control-Max-Age": "86400"
      };
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405, headers: { ...lcCorsHeaders, "Content-Type": "application/json" }
        });
      }

      const body = await request.json();
      if (!body.checkQuestion || !body.userResponse) {
        return new Response(JSON.stringify({ error: "Missing checkQuestion or userResponse" }), {
          status: 400, headers: { ...lcCorsHeaders, "Content-Type": "application/json" }
        });
      }

      const systemPrompt = `You are evaluating a student's response to a comprehension check during an initial learning session. The student is learning this material for the first time.

CONCEPT: ${body.concept || ""}
CHECK QUESTION: ${body.checkQuestion}
EXPECTED ANSWER: ${body.checkAnswer || ""}
STUDENT RESPONSE: ${body.userResponse}

Evaluate the response and return JSON:
{
  "verdict": "strong" | "partial" | "weak",
  "feedback": "1-2 sentences: what they got right, what's missing",
  "followUp": "If partial/weak: one Socratic question to close the gap. If strong: null",
  "isComplete": true if verdict is "strong" or no follow-up needed, false if follow-up provided
}

Rules:
- "strong": student hit the key points, even if wording differs
- "partial": core idea present but missing an important element
- "weak": fundamental misunderstanding or mostly wrong
- Feedback must cite specific claims from the student's response
- Never reveal the full answer directly — guide via questioning
- Be concise: max 3 sentences for feedback`;

      const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + env.GEMINI_API_KEY;

      const geminiRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1024,
            responseMimeType: "application/json"
          }
        })
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        return new Response(JSON.stringify({ error: "Gemini API error", detail: errText }), {
          status: 502, headers: { ...lcCorsHeaders, "Content-Type": "application/json" }
        });
      }

      const geminiData = await geminiRes.json();

      // Log the structure of what Gemini returned
      const parts = geminiData?.candidates?.[0]?.content?.parts || [];
      console.log("[learn-check] Part count:", parts.length, "types:", JSON.stringify(parts.map(p => ({ thought: !!p.thought, len: (p.text || "").length }))));

      let rawText = extractGeminiText(geminiData);
      console.log("[learn-check] extractGeminiText len:", rawText.length, "preview:", rawText.slice(0, 300));

      let parsed = parseJsonResponse(rawText);

      // If extractGeminiText failed, try brute-force: concatenate ALL non-thought text parts and parse
      if (!parsed || !parsed.verdict) {
        console.log("[learn-check] First parse failed, trying brute-force concatenation");
        const allText = parts
          .filter(p => !p.thought && typeof p.text === "string")
          .map(p => p.text)
          .join("");
        console.log("[learn-check] Brute-force text len:", allText.length, "preview:", allText.slice(0, 300));
        parsed = parseJsonResponse(allText);
      }

      // If still failed, try extracting JSON from ANY part (including thought parts as last resort)
      if (!parsed || !parsed.verdict) {
        console.log("[learn-check] Brute-force failed, trying all parts including thought");
        for (const part of parts) {
          if (typeof part.text === "string" && part.text.includes('"verdict"')) {
            parsed = parseJsonResponse(part.text);
            if (parsed && parsed.verdict) {
              console.log("[learn-check] Found verdict in part with thought=" + !!part.thought);
              break;
            }
          }
        }
      }

      console.log("[learn-check] Final result:", parsed ? "verdict=" + (parsed.verdict || "none") : "NULL");

      return new Response(JSON.stringify(parsed || { verdict: "partial", feedback: "Could not evaluate.", isComplete: true }), {
        status: 200,
        headers: { ...lcCorsHeaders, "Content-Type": "application/json" }
      });
    }


    // ── Exam Triage Route ──
    if (url.pathname === "/studyengine/exam-triage") {
      const triageCorsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key",
        "Access-Control-Max-Age": "86400"
      };
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405, headers: { ...triageCorsHeaders, "Content-Type": "application/json" }
        });
      }

      const body = await request.json();
      const topics = body.topics || [];
      const topicCardCounts = body.topicCardCounts || {};
      const topicRetention = body.topicRetention || {};
      const topicLearnStatus = body.topicLearnStatus || {};
      const chooseN = body.chooseN || null;
      const outOfM = body.outOfM || null;
      const syllabusCtx = body.syllabusContext || "";

      let systemPrompt = "";

      if (body.rawQuestions) {
        systemPrompt = `You are an exam strategy AI. Parse the following exam questions and map them to the student's existing study topics.

EXISTING CARD TOPICS (with card counts):
${topics.map(t => t + " (" + (topicCardCounts[t] || 0) + " cards)").join("\n")}

${syllabusCtx ? "SYLLABUS CONTEXT: " + syllabusCtx : ""}
${chooseN && outOfM ? "EXAM FORMAT: Student answers " + chooseN + " out of " + outOfM + " questions presented (from the pool below)" : ""}

RAW EXAM QUESTIONS:
${body.rawQuestions}

INSTRUCTIONS:
1. Parse each numbered question into a separate object
2. Extract key themes and author names from each question
3. Map each question to the most relevant existing card topics (mappedTopics)
4. Score each question 0-1 based on: how many card topics cover it (coverage), how many themes overlap with other questions (overlap value)
5. Identify which questions share the most themes with other questions (overlapWith)
${chooseN ? "6. Recommend a priority set of " + (chooseN + 2) + " questions (the " + chooseN + " to answer + 2 safety margin) that maximises topic overlap and coverage. Recommend sacrifice set for the rest." : "6. Recommend priority set (top 60% by score) and sacrifice set (bottom 20%)."}

Return JSON:
{
  "questions": [
    {
      "id": "q1",
      "text": "First 120 chars of question...",
      "themes": ["theme1", "theme2"],
      "authors": ["Author1", "Author2"],
      "mappedTopics": ["Matching Topic 1", "Matching Topic 2"],
      "score": 0.85,
      "overlapWith": ["q2", "q3"]
    }
  ],
  "recommendedPriority": ["q1", "q2", "q3"],
  "recommendedSacrifice": ["q7", "q9"],
  "rationale": "Brief explanation of the strategy"
}`;
      } else if (body.mode === "triage" && body.questions) {
        const qSummaries = body.questions.map((q, i) =>
          "Q" + (i + 1) + " [" + q.id + "]: " + (q.text || "").substring(0, 100) +
          " | Topics: " + (q.mappedTopics || []).join(", ") +
          " | Themes: " + (q.themes || []).join(", ")
        ).join("\n");

        systemPrompt = `You are an exam strategy AI performing triage optimisation. The student has existing cards with known retention rates and learn status.

QUESTIONS:
${qSummaries}

TOPIC DATA:
${topics.map(t =>
  t + ": " + (topicCardCounts[t] || 0) + " cards, " +
  (topicRetention[t] || 0) + "% retention, " +
  (topicLearnStatus[t] || "unknown")
).join("\n")}

${chooseN && outOfM ? "EXAM FORMAT: Student answers " + chooseN + " out of " + outOfM + " presented" : ""}

SCORING CRITERIA (weight each):
1. Coverage (30%): How many cards cover this question's required topics? Higher = less new learning needed
2. Retention (25%): Average FSRS retention of relevant cards. Higher = more exam-ready
3. Overlap (25%): How many themes does this question share with other questions? Higher = more efficient preparation
4. Ease (20%): Simpler questions (fewer required authors, less cross-topic synthesis) yield more marks per hour studied

INSTRUCTIONS:
- Re-score each question 0-1 using the criteria above with the actual retention/learn data
- Recommend priority set that maximises expected exam marks given limited study time
- Recommend sacrifice set for lowest-value questions
- The student should prepare priority questions deeply, not all questions shallowly

Return JSON:
{
  "questions": [updated questions with new scores],
  "recommendedPriority": ["q1", "q2"],
  "recommendedSacrifice": ["q7"],
  "rationale": "Brief strategy explanation"
}`;
      } else {
        return new Response(JSON.stringify({ error: "Provide rawQuestions or mode:'triage' with questions" }), {
          status: 400, headers: { ...triageCorsHeaders, "Content-Type": "application/json" }
        });
      }

      const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + env.GEMINI_API_KEY;

      const geminiRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4096,
            responseMimeType: "application/json"
          }
        })
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        return new Response(JSON.stringify({ error: "Gemini API error", detail: errText }), {
          status: 502, headers: { ...triageCorsHeaders, "Content-Type": "application/json" }
        });
      }

      const geminiData = await geminiRes.json();
      const rawText = extractGeminiText(geminiData);
      const parsed = parseJsonResponse(rawText);

      return new Response(JSON.stringify(parsed || { questions: [], recommendedPriority: [], recommendedSacrifice: [] }), {
        status: 200,
        headers: { ...triageCorsHeaders, "Content-Type": "application/json" }
      });
    }

    // ── Existing routes below (state sync, notion bridge) ──
    // Keep this allowlist as an explicit guard so these routes remain public
    // even if route blocks move during refactors.
    const PUBLIC_STUDYENGINE_ROUTES = new Set([
      "/studyengine/learn-plan",
      "/studyengine/learn-check"
    ]);
    const requiresWidgetKey = !PUBLIC_STUDYENGINE_ROUTES.has(url.pathname);
    if (requiresWidgetKey) {
      const passphrase = request.headers.get("X-Widget-Key");
      if (!passphrase || passphrase !== env.WIDGET_SECRET) {
        return json({ error: "Unauthorized" }, 401);
      }
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
    } catch (fatalErr) {
      return new Response(JSON.stringify({ error: "Internal server error", detail: fatalErr.message }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key"
        }
      });
    }
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

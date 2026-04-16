import { getCorsHeaders } from "../cors";
import { callGemini, extractGeminiText } from "../gemini";
import type { Env, TutorMode, TutorRequest } from "../types";
import { parseJsonResponse } from "../utils/json";
import { daysUntilExam } from "../utils/helpers";

const TUTOR_MODES: TutorMode[] = ["socratic", "quick", "teach", "insight", "acknowledge", "freeform"];
const TUTOR_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...TUTOR_CORS_HEADERS
    }
  });
}

function formatLearnerProfileBlock(learner: Record<string, unknown> | undefined, itemRef: TutorRequest["item"]): string {
  if (!learner || typeof learner !== "object") return "";
  const cs = (learner.courseStats as Record<string, unknown> | undefined) || {};
  const card = (learner.cardHistory as Record<string, unknown> | undefined) || {};
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
    `- Calibration accuracy: ${cal != null && !Number.isNaN(Number(cal)) ? `${Math.round(Number(cal) * 100)}%` : "Not enough data"}`,
    `- Study streak: ${String(streak)} days`
  ];

  const nudgeTopics = learner.calibrationNudgeTopics;
  if (Array.isArray(nudgeTopics) && nudgeTopics.length > 0) {
    lines.push(
      `- ⚠ Overconfident topics (low retention despite reviews): ${nudgeTopics.join(", ")}`,
      "- When reviewing cards from these topics, gently challenge the student's confidence: \"Your self-ratings on this topic have been optimistic — let's verify what you actually remember.\""
    );
  }

  if (learner.primaryErrorPattern) {
    const patternLabels: Record<string, string> = {
      factual_miss: "factual recall gaps",
      reasoning_gap: "incomplete reasoning chains",
      under_elaboration: "naming concepts without explaining them",
      misconception: "actively wrong mental models",
      prerequisite_gap: "missing foundational concepts",
      framework_mismatch: "using different analytical frameworks than expected"
    };
    const key = String(learner.primaryErrorPattern);
    const label = patternLabels[key] || key;
    lines.push(
      `- ⚠ Primary error pattern: ${label} (${String(learner.primaryErrorPct || "?")}% of recent errors)`,
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

function formatExamContextBlock(cc: NonNullable<TutorRequest["context"]>["courseContext"]): string {
  if (!cc || typeof cc !== "object") return "";
  const fmt = cc.examType || "Unknown";
  const fmtExtra = cc.examFormat ? ` — ${cc.examFormat}` : "";
  const days = cc.examDate ? daysUntilExam(cc.examDate) : null;
  const dateLine = cc.examDate && days != null ? `${cc.examDate} (${days} days away)` : cc.examDate ? String(cc.examDate) : "Not set";
  const weightLine =
    cc.examWeight != null && !Number.isNaN(Number(cc.examWeight)) ? `${cc.examWeight}% of final grade` : "Unknown";
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

export async function handleTutor(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await request.json()) as TutorRequest;
    const mode = body.mode;
    const item = body.item || { prompt: "", modelAnswer: "" };
    const userName = String(body.userName || "there").trim() || "there";
    const userResponse = body.userResponse != null ? String(body.userResponse) : "";
    const conversation = Array.isArray(body.conversation) ? body.conversation : [];
    const context = body.context && typeof body.context === "object" ? body.context : {};

    if (!mode || !item.prompt || !item.modelAnswer) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    if (!TUTOR_MODES.includes(mode)) {
      return jsonResponse({ error: "Invalid mode" }, 400);
    }

    const needsUserResponse = mode === "socratic" || mode === "quick" || mode === "acknowledge" || mode === "freeform";
    if (needsUserResponse && !userResponse.trim()) {
      return jsonResponse({ error: "userResponse required for this mode" }, 400);
    }

    const modelMap: Record<string, string> = {
      flash: "gemini-2.5-flash",
      pro: "gemini-2.5-pro"
    };
    const selectedModel = modelMap[String(body.model)] || "gemini-2.5-flash";

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
      "Tone: like a sharp TA who genuinely wants the student to succeed. Respect their intelligence. Challenge them.\n\n" +
      "CRITICAL: Return ONLY valid JSON. No markdown. No code fences. No preamble. Start with '{' and end with '}'.";

    const isRelearningPass = !!context.isRelearning;

    const relearningModePrefix =
      "RELEARNING PASS: The student already attempted this card, saw the model answer, and rated Again. This is a re-encounter within the same session. Do NOT ask broad diagnostic questions — target the specific point they missed. Ask them to reconstruct the key claim. Keep it to 1-2 turns. They have already seen the answer — the goal is active re-encoding, not discovery.\n\n";

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
    const systemPromptAugmented = systemPrompt + fewShotExemplars + supportiveVoiceBlock + learnerProfileBlock + examContextBlock;

    const modeInstructionsBase: Record<TutorMode, string> = {
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
        '"Your response uses a different analytical lens than the model answer, but the reasoning is internally coherent. Here\'s what the model answer emphasises..."\n\n' +
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
        'the key distinguishing feature, a vivid analogy, or the "why" behind the fact. This is not grading. This is encoding assistance.\n\n' +
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
        '\"That\'s outside this card\'s scope — but good instinct. For now, the key takeaway is...\"\n\n' +
        "If conversation history exists, this is a follow-up exchange. Keep it to max 1 additional turn after your first response. " +
        "On the second turn, always mark isComplete: true.\n\n" +
        "Provide annotations only if the student's question reveals a misconception worth flagging."
    };

    const tier = item.tier || "explain";

    const tierRatingAnchors: Record<string, string> = {
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
    let modeInstructionsForMode = (isRelearningPass ? relearningModePrefix : "") + modeInstructionsBase[mode] + tierAnchor;

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
        'Put your follow-up question EXCLUSIVELY in "followUpQuestion". If you have no follow-up question, set "followUpQuestion" to null. ' +
        "Never duplicate content across the two fields.",
      acknowledgmentAndExtension:
        "\n\nIMPORTANT: Do NOT include the extension question inside \"acknowledgment\". " +
        'Put your extension question EXCLUSIVELY in "extensionQuestion". If you have none, set "extensionQuestion" to null. ' +
        "Never duplicate content across the two fields.",
      insightAndFollowUp:
        "\n\nIMPORTANT: Do NOT include the self-test question inside \"insight\". " +
        'Put the follow-up EXCLUSIVELY in "followUpQuestion". If you have no question, set "followUpQuestion" to null. ' +
        "Never duplicate content across those fields."
    };

    const responseSchemas: Record<TutorMode, string> = {
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

    const responseSchemaObjects: Record<TutorMode, unknown> = {
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
      userBlock += `RETRIEVAL QUESTION THEY ANSWERED: ${String(context.quickFireFollowUpQuestion).slice(0, 800)}\n`;
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

    const modeTokenLimits: Record<TutorMode, number> = {
      insight: 256,
      quick: 512,
      acknowledge: 512,
      socratic: 1024,
      teach: 1024,
      freeform: 512
    };
    const maxOut = modeTokenLimits[mode] || 1024;
    const lectureCtxBlock = body.lectureContext
      ? `\nLECTURE CONTEXT (source material the student studied):\n${body.lectureContext.courseDigest || ""}${body.lectureContext.topicChunk ? `\n\nRELEVANT SECTION:\n${body.lectureContext.topicChunk}` : ""}\n\n---\n\n`
      : "";
    let sessionSummaryBlock = "";
    const sessionSummary = Array.isArray(context.sessionSummary) ? context.sessionSummary : [];
    if (sessionSummary.length > 0) {
      sessionSummaryBlock =
        "\nSESSION CONTEXT (prior cards this session):\n" +
        sessionSummary.map((s, i) => `${i + 1}. ${String(s).substring(0, 200)}`).join("\n") +
        "\n\nUse this context to build bridges: reference topics the student got right earlier, " +
        "connect related concepts across cards, and avoid re-explaining things they already demonstrated understanding of.\n\n---\n\n";
    }
    const isFollowUpTurn = conversation.length >= 2;
    const systemPromptFinal = isFollowUpTurn ? `${systemPrompt}${supportiveVoiceBlock}\n\n${modeInstructionsBase[mode]}` : systemPromptAugmented;

    const dynamicPrompt = `${modeInstructionsForMode}\n\n---\n\n${sessionSummaryBlock}${lectureCtxBlock}${itemBlock}\n${userBlock}`;

    const geminiData = await callGemini(
      selectedModel,
      systemPromptFinal,
      dynamicPrompt,
      {
        temperature: 0.35,
        maxOutputTokens: maxOut,
        responseMimeType: "application/json",
        responseSchema: responseSchemaObjects[mode] || responseSchemaObjects.socratic
      } as any,
      env
    );

    const rawText = extractGeminiText(geminiData);
    
    // Enhanced parsing: strip markdown fences and extract JSON
    let cleanedText = rawText.trim();
    
    // Remove markdown code fences
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    // Extract JSON object if there's surrounding text
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanedText = jsonMatch[0];
    }
    
    const parsed = parseJsonResponse<unknown>(cleanedText);

    if (!parsed || typeof parsed !== "object") {
      // Return a structured fallback instead of 500 error
      const fallbackResponse = {
        error: "Failed to parse tutor response",
        raw: cleanedText.slice(0, 200), // First 200 chars for debugging
        tutorMessage: "I'm having trouble processing your request. Please try again.",
        followUpQuestion: null,
        isComplete: true,
        suggestedRating: 2
      };
      return jsonResponse(fallbackResponse, 200);
    }

    return jsonResponse(parsed, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("Gemini API error:")) {
      return jsonResponse({ error: "Gemini API error", detail: message.replace("Gemini API error: ", "") }, 502);
    }
    return jsonResponse({ error: "Internal error", detail: message }, 500);
  }
}

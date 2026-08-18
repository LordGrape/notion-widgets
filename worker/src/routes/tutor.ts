import { getCorsHeaders } from "../cors";
import { callGemini, extractGeminiText, getFinishReason } from "../gemini";
import { parseLlmJson } from "../llm/parse";
import type { Env, TutorMode, TutorRequest } from "../types";
import {
  TUTOR_STATIC_PREFIX,
  TUTOR_SYSTEM_PROMPT,
  jsonFieldSeparationHint,
  modeInstructionsBase,
  tierRatingAnchors
} from "../services/tutor/prompts";
import { responseSchemaObjects, responseSchemas } from "../services/tutor/schemas";
import {
  buildTutorContextBlock,
  formatExamContextBlock,
  formatLearnerProfileBlock
} from "../services/tutor/context-blocks";

// Phase V4 (2026-08-18): prompt text, response schemas, and context-block
// assembly moved verbatim to services/tutor/ (prompts.ts, schemas.ts,
// context-blocks.ts). This route keeps HTTP plumbing (method check, body
// validation, CORS, Response shaping) plus the orchestration: prompt
// composition, model selection, the Gemini call, and the parse/retry path.

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

function logUsage(tag: string, model: string, response: unknown): void {
  const usage = (response && typeof response === "object")
    ? ((response as Record<string, unknown>).usageMetadata as Record<string, unknown> | undefined)
    : undefined;
  const total = Number(usage?.totalTokenCount ?? usage?.totalTokens ?? 0);
  const cached = Number(usage?.cachedContentTokenCount ?? usage?.cachedTokens ?? 0);
  if (!Number.isFinite(cached) || cached <= 0) {
    console.log(`[${tag}] model=${model} usage=${JSON.stringify(usage || {})}`);
    return;
  }
  const cacheHitPct = total > 0 ? Number(((cached / total) * 100).toFixed(2)) : 0;
  console.log(`[${tag}] ${JSON.stringify({ model, cached, total, cache_hit_pct: cacheHitPct })}`);
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
    const supportiveVoiceBlock = body.tutorVoice === "rigorous"
      ? "\n\nVOICE: Rigorous mode. Be concise and direct. Prioritize precision over encouragement."
      : "\n\nVOICE: Supportive mode. Be warm and encouraging while staying rigorous and specific.";
    const learnerProfileBlock = formatLearnerProfileBlock(context.learner, item);
    const examContextBlock = context.courseContext ? formatExamContextBlock(context.courseContext) : "";
    const isRelearningPass = Boolean(context.isRelearning || (Number(context.sessionRetryCount) || 0) > 0);
    const relearningModePrefix = isRelearningPass
      ? "RELEARNING PASS: The student recently rated Again/Hard on this card. Use tighter scaffolding and ask a narrower bridge question before moving on.\n\n"
      : "";
    const systemPromptAugmented = TUTOR_STATIC_PREFIX + supportiveVoiceBlock + learnerProfileBlock + examContextBlock;

    const tier = item.tier || "explain";

    const tierAnchor = tierRatingAnchors[tier] || tierRatingAnchors.explain;
    let modeInstructionsForMode = (isRelearningPass ? relearningModePrefix : "") + modeInstructionsBase[mode] + tierAnchor;

    if (mode === "quick" && context.quickFireReRetrieval) {
      modeInstructionsForMode +=
        "\n\nQUICK FIRE RE-RETRIEVAL: The student cannot see the model answer yet. They just typed a short answer to a retrieval question after rating Again. " +
        "Compare their attempt to the model answer. Keep each JSON field (correct, missing, bridge) to 1–2 sentences max. " +
        "Do not paste the full model answer in your response — they will see it in a consolidation step next.\n\n" +
        "FORMAT RULES (STRICT): Return ONLY the JSON object. No markdown, no code fences, no lead-in text. " +
        "No greetings, no motivational preambles, and no restating the question in any field. " +
        "If the student answer is empty, set correct exactly to \"No answer submitted.\" and place all substantive guidance in missing/bridge.\n\n" +
        "IMPORTANT — STUDENT QUESTIONS: If the student asks a question within their response (e.g., \"is that because of X?\" / \"why did Y happen?\"), " +
        "address it briefly in the \"bridge\" field. Acknowledge their thinking, answer the question in 1-2 sentences, then connect it back to the model answer. " +
        "Do NOT ignore student questions.\n";
    }

    if (mode === "insight") {
      modeInstructionsForMode +=
        "\n\nFORMAT RULES (STRICT): Return ONLY the JSON object. No markdown, no code fences, no lead-in text. " +
        "No greetings, no motivational preambles. The \"insight\" field value must be at most 2 sentences.\n";
    }

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

    let userBlock = `USER_NAME: ${userName}\nCOURSE: ${item.course || "university-level courses"}\nSTUDENT'S RESPONSE: ${userResponse}\n`;

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
      insight: 2560,
      quick: 2560,
      acknowledge: 1024,
      socratic: 3072,
      teach: 3072,
      freeform: 1536
    };
    const maxOutBase = modeTokenLimits[mode] || 1536;
    const isProModel = selectedModel === "gemini-2.5-pro";
    const thinkingBudget = isProModel ? 512 : 0;
    const maxOut = maxOutBase + (isProModel ? 512 : 0);
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
    const modeInstructionInSystem = modeInstructionsForMode.trim();
    const systemPromptFinal = isFollowUpTurn
      ? `${TUTOR_SYSTEM_PROMPT}${supportiveVoiceBlock}\n\n${modeInstructionInSystem}`
      : `${systemPromptAugmented}\n\n${modeInstructionInSystem}`;
    const tutorContextBlock = buildTutorContextBlock(body.courseContext, mode);
    const tutorContextInsertion = tutorContextBlock ? `\n\n${tutorContextBlock}` : "";

    const dynamicPrompt =
      `${lectureCtxBlock}${tutorContextInsertion}${sessionSummaryBlock}---\n\n${itemBlock}\n${userBlock}`;

    const generationConfig = {
      temperature: 0.35,
      maxOutputTokens: maxOut,
      responseMimeType: "application/json",
      responseSchema: responseSchemaObjects[mode] || responseSchemaObjects.socratic,
      thinkingConfig: { thinkingBudget }
    };

    const useFlexTier = mode === "acknowledge" || mode === "insight";
    const geminiOptions = useFlexTier ? { serviceTier: "flex" as const } : undefined;
    const geminiData = await callGemini(selectedModel, systemPromptFinal, dynamicPrompt, generationConfig, env, geminiOptions);
    logUsage("tutor", selectedModel, geminiData);
    let finishReason = getFinishReason(geminiData);
    let rawText = extractGeminiText(geminiData);
    if (rawText === "") {
      return jsonResponse({ error: "tutor_empty_response", finishReason }, 502);
    }
    let parsed: unknown;

    try {
      // B1: tolerant parse on first pass too.
      parsed = parseLlmJson(rawText);
    } catch {
      const retryPrompt =
        `${dynamicPrompt}\n\n` +
        "Return ONLY a JSON object. No prose. No code fences. Keep each field value to at most 2 sentences." +
        (mode === "insight" ? " Keep the insight value to at most 2 sentences." : "");
      const retryData = await callGemini(selectedModel, systemPromptFinal, retryPrompt, generationConfig, env, geminiOptions);
      logUsage("tutor", selectedModel, retryData);
      finishReason = getFinishReason(retryData);
      rawText = extractGeminiText(retryData);
      if (rawText === "") {
        return jsonResponse({ error: "tutor_empty_response", finishReason }, 502);
      }
      try {
        // B1: tolerate fenced/prose-wrapped/mildly malformed JSON in tutor output.
        parsed = parseLlmJson(rawText);
      } catch (retryError) {
        if (retryError instanceof Error) {
          return jsonResponse({ error: "tutor_parse_failed", rawPreview: rawText.slice(0, 500), finishReason }, 502);
        }
        throw retryError;
      }
    }

    if (!parsed || typeof parsed !== "object" || Object.keys(parsed).length === 0) {
      return jsonResponse({ error: "tutor_parse_failed", rawPreview: rawText.slice(0, 500), finishReason }, 502);
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

/*
Unit-style sanity checks for extractJsonFromModelOutput:
- `{"ok":true}` -> parses
- `Here is the JSON:\n\`\`\`json\n{"ok":true}\n\`\`\`` -> parses
- `{"ok":true}\nLet me know if you need more.` -> parses
- `json: [{"ok":true}]` -> parses
*/

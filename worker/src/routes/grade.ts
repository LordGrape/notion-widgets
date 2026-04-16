import { getCorsHeaders } from "../cors";
import { callGemini, extractGeminiText } from "../gemini";
import type { Env, GradeEssayResponse, GradeExplainResponse, GradeRequest, GradeResponse, GradeStandardResponse, ScoreFeedback } from "../types";
import { parseJsonResponse } from "../utils/json";

const GRADE_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...GRADE_CORS_HEADERS
    }
  });
}

function coerceScoreFeedback(input: unknown): ScoreFeedback {
  const value = input && typeof input === "object" ? (input as Partial<ScoreFeedback>) : {};
  return {
    score: Number(value.score) || 0,
    feedback: String(value.feedback || "")
  };
}

export async function handleGrade(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await request.json()) as GradeRequest;
    const { prompt, modelAnswer, userResponse, tier, course, topic, conceptA, conceptB, mode } = body;
    const essayOutline = body.essayOutline || "";
    const isEssayMode = essayOutline.length > 0;

    if (!prompt || !modelAnswer) {
      return jsonResponse({ error: "Missing required fields" }, 400);
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

      try {
        const explainData = await callGemini(
          "gemini-2.5-flash",
          "You are a patient, expert tutor embedded in a spaced repetition study engine. When a student doesn't know the answer, you TEACH — explain WHY the answer is what it is for deep encoding. Respond in JSON.",
          explainPrompt,
          { temperature: 0.4, maxOutputTokens: 512, responseMimeType: "application/json" },
          env
        );

        const explainRaw = extractGeminiText(explainData);
        let explainResult = parseJsonResponse<GradeExplainResponse>(explainRaw);

        if (!explainResult || typeof explainResult !== "object") {
          explainResult = { explanation: "Could not generate explanation.", keyPoints: [], memoryHook: "" };
        }

        return jsonResponse(explainResult, 200);
      } catch (error) {
        return jsonResponse({ error: "Gemini API error", detail: error instanceof Error ? error.message.replace(/^Gemini API error:\s*/, "") : String(error) }, 502);
      }
    }

    if (!userResponse) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    const tierInstructions: Record<string, string> = {
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
    let gradingPrompt = "";

    if (isEssayMode) {
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
      const lectureContextBlock = body.lectureContext
        ? `\nLECTURE CONTEXT (source material the student studied — use for calibration):\n${body.lectureContext.courseDigest || ""}\n${body.lectureContext.topicChunk ? `\nRELEVANT LECTURE SECTION:\n${body.lectureContext.topicChunk}` : ""}\n\n` +
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

${tierInstructions[tier || ""] || tierInstructions.explain}

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
  "clarity": { "score": 0, "feedback": "One specific sentence referencing the student's response." },${isDistinguish ? '\n  "discrimination": { "score": 0, "feedback": "One specific sentence about whether the student correctly distinguished between the two concepts." },' : ""}
  "improvement": "One specific, actionable sentence.",
  "summary": "One sentence overall assessment that tells the student where they stand.",
  "annotations": [
    { "text": "exact short phrase from student response", "tag": "accurate|partial|inaccurate|missing|insight", "note": "Brief explanation of why this phrase is tagged this way." }
  ]
}`;
    }

    let gradingRaw = "";
    try {
      const geminiData = await callGemini(
        "gemini-2.5-flash",
        "You are an expert academic grader embedded in a spaced repetition study engine. Provide precise, calibrated, evidence-based feedback. Grade against the model answer as the reference standard. Respond in JSON.",
        gradingPrompt,
        {
          temperature: 0.2,
          maxOutputTokens: 1024,
          responseMimeType: "application/json"
        },
        env
      );
      gradingRaw = extractGeminiText(geminiData);
    } catch (error) {
      return jsonResponse({ error: "Gemini API error", detail: error instanceof Error ? error.message.replace(/^Gemini API error:\s*/, "") : String(error) }, 502);
    }

    const gradingParsed = parseJsonResponse<Record<string, unknown>>(gradingRaw);

    if (isEssayMode) {
      if (!gradingParsed || gradingParsed.thesisClarity === undefined) {
        return jsonResponse({ error: "Failed to parse essay grading response", raw: gradingRaw }, 500);
      }

      const thesisClarity = coerceScoreFeedback(gradingParsed.thesisClarity);
      const evidenceDensity = coerceScoreFeedback(gradingParsed.evidenceDensity);
      const argumentStructure = coerceScoreFeedback(gradingParsed.argumentStructure);
      const analyticalDepth = coerceScoreFeedback(gradingParsed.analyticalDepth);
      const conclusionQuality = coerceScoreFeedback(gradingParsed.conclusionQuality);

      const total = thesisClarity.score + evidenceDensity.score + argumentStructure.score + analyticalDepth.score + conclusionQuality.score;
      const maxTotal = 10;
      const ratio = total / maxTotal;

      let fsrsRating: 1 | 2 | 3 | 4;
      if (ratio <= 0.2) fsrsRating = 1;
      else if (ratio <= 0.5) fsrsRating = 2;
      else if (ratio <= 0.8) fsrsRating = 3;
      else fsrsRating = 4;

      const grading: GradeEssayResponse = {
        thesisClarity,
        evidenceDensity,
        argumentStructure,
        analyticalDepth,
        conclusionQuality,
        improvement: String(gradingParsed.improvement || ""),
        summary: String(gradingParsed.summary || ""),
        essayMode: true,
        totalScore: total,
        maxScore: maxTotal,
        fsrsRating
      };

      return jsonResponse(grading satisfies GradeResponse, 200);
    }

    if (!gradingParsed || gradingParsed.accuracy === undefined) {
      return jsonResponse({ error: "Failed to parse grading response", raw: gradingRaw }, 500);
    }

    const accuracy = coerceScoreFeedback(gradingParsed.accuracy);
    const depth = coerceScoreFeedback(gradingParsed.depth);
    const clarity = coerceScoreFeedback(gradingParsed.clarity);
    const discrimination = coerceScoreFeedback(gradingParsed.discrimination);

    let total: number;
    let maxTotal: number;
    if (isDistinguish) {
      total = accuracy.score + depth.score + clarity.score + discrimination.score;
      maxTotal = 8;
    } else {
      total = accuracy.score + depth.score + clarity.score;
      maxTotal = 6;
    }

    const ratio = total / maxTotal;
    let fsrsRating: 1 | 2 | 3 | 4;
    if (ratio <= 0.17) fsrsRating = 1;
    else if (ratio <= 0.5) fsrsRating = 2;
    else if (ratio <= 0.83) fsrsRating = 3;
    else fsrsRating = 4;

    const grading: GradeStandardResponse = {
      accuracy,
      depth,
      clarity,
      ...(isDistinguish ? { discrimination } : {}),
      improvement: String(gradingParsed.improvement || ""),
      summary: String(gradingParsed.summary || ""),
      annotations: Array.isArray(gradingParsed.annotations) ? (gradingParsed.annotations as GradeStandardResponse["annotations"]) : [],
      essayMode: false,
      totalScore: total,
      maxScore: maxTotal,
      fsrsRating
    };

    return jsonResponse(grading satisfies GradeResponse, 200);
  } catch (err) {
    return jsonResponse({ error: "Internal error", detail: err instanceof Error ? err.message : String(err) }, 500);
  }
}

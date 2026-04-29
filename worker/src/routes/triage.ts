import { getCorsHeaders } from "../cors";
import { extractGeminiText, recordGeminiUsage } from "../gemini";
import type { Env, ExamTriageRequest } from "../types";
import { parseJsonResponse } from "../utils/json";

const TRIAGE_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...TRIAGE_CORS_HEADERS
    }
  });
}

export async function handleTriage(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const body = (await request.json()) as ExamTriageRequest;
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
${topics.map((t) => `${t} (${topicCardCounts[t] || 0} cards)`).join("\n")}

${syllabusCtx ? `SYLLABUS CONTEXT: ${syllabusCtx}` : ""}
${chooseN && outOfM ? `EXAM FORMAT: Student answers ${chooseN} out of ${outOfM} questions presented (from the pool below)` : ""}

RAW EXAM QUESTIONS:
${body.rawQuestions}

INSTRUCTIONS:
1. Parse each numbered question into a separate object
2. Extract key themes and author names from each question
3. Map each question to the most relevant existing card topics (mappedTopics)
4. Score each question 0-1 based on: how many card topics cover it (coverage), how many themes overlap with other questions (overlap value)
5. Identify which questions share the most themes with other questions (overlapWith)
${chooseN ? `6. Recommend a priority set of ${chooseN + 2} questions (the ${chooseN} to answer + 2 safety margin) that maximises topic overlap and coverage. Recommend sacrifice set for the rest.` : "6. Recommend priority set (top 60% by score) and sacrifice set (bottom 20%)."}

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
    const qSummaries = body.questions
      .map(
        (q, i) =>
          `Q${i + 1} [${q.id}]: ${(q.text || "").substring(0, 100)} | Topics: ${(q.mappedTopics || []).join(", ")} | Themes: ${(q.themes || []).join(", ")}`
      )
      .join("\n");

    systemPrompt = `You are an exam strategy AI performing triage optimisation. The student has existing cards with known retention rates and learn status.

QUESTIONS:
${qSummaries}

TOPIC DATA:
${topics
  .map(
    (t) =>
      `${t}: ${topicCardCounts[t] || 0} cards, ${topicRetention[t] || 0}% retention, ${topicLearnStatus[t] || "unknown"}`
  )
  .join("\n")}

${chooseN && outOfM ? `EXAM FORMAT: Student answers ${chooseN} out of ${outOfM} presented` : ""}

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
    return jsonResponse({ error: "Provide rawQuestions or mode:'triage' with questions" }, 400);
  }

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
    {
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
    }
  );

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    return jsonResponse({ error: "Gemini API error", detail: errText }, 502);
  }

  const geminiData = (await geminiRes.json()) as import("../gemini").GeminiResponse;
  await recordGeminiUsage(env, "gemini-2.5-flash", geminiData.usageMetadata);
  const rawText = extractGeminiText(geminiData);
  const parsed = parseJsonResponse<Record<string, unknown>>(rawText);

  return jsonResponse(parsed || { questions: [], recommendedPriority: [], recommendedSacrifice: [] }, 200);
}

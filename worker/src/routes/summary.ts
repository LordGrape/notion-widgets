import { getCorsHeaders } from "../cors";
import { extractGeminiText } from "../gemini";
import { resolveUtilityModel } from "../ai-models";
import type { Env, SummaryRequest } from "../types";

const SUMMARY_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...SUMMARY_CORS_HEADERS
    }
  });
}

export async function handleSummary(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await request.json()) as SummaryRequest;
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
      `${weakLine ? `${weakLine}\n` : ""}` +
      `${strongLine ? `${strongLine}\n` : ""}` +
      `${calLine}\n\n` +
      "Write a 3-4 sentence summary that:\n" +
      "1. Highlights what went well (cite specific topics)\n" +
      "2. Identifies the key weakness or pattern (cite specific topics or card types)\n" +
      "3. Gives one specific, actionable suggestion for the next session\n" +
      "4. Notes calibration change if meaningful\n\n" +
      "Keep it concise and direct. No fluff. Address the student by name once.\n\n" +
      "Respond as plain text (NOT JSON). Just the summary paragraph.";

    const model = resolveUtilityModel(env);
    const sumRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: "You are generating a brief session summary for a study engine. Be specific and actionable. Respond as plain text, not JSON. 3-4 sentences."
              }
            ]
          },
          contents: [{ parts: [{ text: summaryPrompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 256 }
        })
      }
    );

    if (!sumRes.ok) {
      const errText = await sumRes.text();
      return jsonResponse({ error: "Gemini API error", detail: errText }, 502);
    }

    const sumData = (await sumRes.json()) as import("../gemini").GeminiResponse;
    const summaryText = String(extractGeminiText(sumData) || "").trim();
    if (!summaryText) {
      return jsonResponse({ error: "Empty summary" }, 500);
    }

    return jsonResponse({ summary: summaryText }, 200);
  } catch (e) {
    return jsonResponse({ error: "Summary failed", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
}

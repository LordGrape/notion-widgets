import { getCorsHeaders } from "../cors";
import { extractGeminiText } from "../gemini";
import { resolveUtilityModel } from "../ai-models";
import type { Env, SyllabusRequest } from "../types";
import { parseJsonResponse } from "../utils/json";

const SYLLABUS_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...SYLLABUS_CORS_HEADERS
    }
  });
}

export async function handleSyllabus(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await request.json()) as SyllabusRequest;
    const rawTextIn = body.rawText != null ? String(body.rawText).trim() : "";
    const courseName = body.courseName != null ? String(body.courseName).trim() : "";
    const existingExamType = body.existingExamType != null ? String(body.existingExamType) : "";

    if (!rawTextIn || !courseName) {
      return jsonResponse({ error: "rawText and courseName required" }, 400);
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

    const model = resolveUtilityModel(env);
    const sylRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
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
      }
    );

    if (!sylRes.ok) {
      const errText = await sylRes.text();
      return jsonResponse({ error: "Gemini API error", detail: errText }, 502);
    }

    const sylData = (await sylRes.json()) as import("../gemini").GeminiResponse;
    const sylRaw = extractGeminiText(sylData);
    const parsedSyl = parseJsonResponse<Record<string, unknown>>(sylRaw);

    if (!parsedSyl || typeof parsedSyl !== "object") {
      return jsonResponse({ error: "Failed to parse syllabus response" }, 500);
    }

    return jsonResponse(parsedSyl, 200);
  } catch (e) {
    return jsonResponse({ error: "Syllabus processing failed", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
}

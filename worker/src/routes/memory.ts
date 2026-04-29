import { getCorsHeaders } from "../cors";
import { extractGeminiText, recordGeminiUsage } from "../gemini";
import { resolveUtilityModel } from "../ai-models";
import type { Env, MemoryRequest } from "../types";
import { parseJsonResponse } from "../utils/json";

const MEMORY_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...MEMORY_CORS_HEADERS
    }
  });
}

interface MemoryPayload {
  id?: string;
  type?: string;
  content?: string;
  course?: string;
  scope?: string;
  relatedTopics?: string[];
  confidence?: number;
}

interface ParsedMemoryResponse {
  action?: "create" | "update" | null;
  memory?: MemoryPayload;
}

export async function handleMemory(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await request.json()) as MemoryRequest;
    const item = body.item || {};
    const userName = String(body.userName || "there").trim() || "there";
    const dialogue = Array.isArray(body.dialogue) ? body.dialogue : [];
    const suggestedRating = body.suggestedRating != null ? Number(body.suggestedRating) : 2;
    const existingMemories = Array.isArray(body.existingMemories) ? body.existingMemories : [];

    if (!item.prompt || !item.modelAnswer || dialogue.length < 1) {
      return jsonResponse({ action: null }, 200);
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

    const model = resolveUtilityModel(env);
    const memRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: "You are a learning analytics engine. You observe tutoring dialogues and extract durable observations about a student's learning patterns. You output JSON."
              }
            ]
          },
          contents: [{ parts: [{ text: memoryPrompt }] }],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 256,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!memRes.ok) {
      return jsonResponse({ action: null }, 200);
    }

    const memData = (await memRes.json()) as import("../gemini").GeminiResponse;
    await recordGeminiUsage(env, model, memData.usageMetadata);
    const memRaw = extractGeminiText(memData);
    const parsedMem = parseJsonResponse<ParsedMemoryResponse>(memRaw);

    if (!parsedMem || typeof parsedMem !== "object") {
      return jsonResponse({ action: null }, 200);
    }

    if (parsedMem.action !== "create" && parsedMem.action !== "update") {
      return jsonResponse({ action: null }, 200);
    }

    const mem = parsedMem.memory;
    if (!mem || typeof mem !== "object" || !mem.content) {
      return jsonResponse({ action: null }, 200);
    }

    if (parsedMem.action === "create" && !String(mem.id || "").startsWith("mem_")) {
      const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
      let suf = "";
      const arr = new Uint8Array(8);
      crypto.getRandomValues(arr);
      for (let i = 0; i < 8; i += 1) suf += chars[arr[i] % chars.length];
      mem.id = `mem_${suf}`;
    }

    mem.course = mem.course || item.course || "";
    if (mem.scope !== "global" && mem.scope !== "course") mem.scope = "course";
    if (mem.scope === "global" && !mem.course) mem.course = "";
    if (!Array.isArray(mem.relatedTopics)) mem.relatedTopics = [];

    return jsonResponse({ action: parsedMem.action, memory: mem }, 200);
  } catch {
    return jsonResponse({ action: null }, 200);
  }
}

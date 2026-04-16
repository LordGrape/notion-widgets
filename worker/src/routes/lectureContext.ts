import { getCorsHeaders } from "../cors";
import type { Env, LectureChunk, LectureContextRequest } from "../types";
import { hashString } from "../utils/helpers";

const LECTURE_CONTEXT_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...LECTURE_CONTEXT_CORS_HEADERS
    }
  });
}

interface LectureManifestEntry {
  topic?: string;
  kvKey?: string;
}

export async function handleLectureContext(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await request.json()) as LectureContextRequest;
    const courseName = String(body.courseName || "").trim();
    const topic = String(body.topic || "").trim();

    if (!courseName) {
      return jsonResponse({ topicChunk: null }, 200);
    }

    const courseKey = courseName.replace(/[^a-zA-Z0-9_-]/g, "_");
    let chunk: LectureChunk | null = null;

    if (topic) {
      const topicHash = hashString(topic.toLowerCase().trim());
      const kvKey = `lectureCtx:${courseKey}:${topicHash}`;
      const stored = (await env.WIDGET_KV.get(kvKey, "json")) as LectureChunk | null;
      if (stored && stored.content) chunk = stored;
    }

    if (!chunk && topic) {
      const manifestKey = `lectureManifest:${courseKey}`;
      const manifest = (await env.WIDGET_KV.get(manifestKey, "json")) as LectureManifestEntry[] | null;
      if (Array.isArray(manifest) && manifest.length > 0) {
        const topicWords = topic.toLowerCase().split(/\s+/).filter(Boolean);
        let bestMatch: LectureManifestEntry | null = null;
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
          const stored = (await env.WIDGET_KV.get(bestMatch.kvKey || "", "json")) as LectureChunk | null;
          if (stored && stored.content) chunk = stored;
        }
      }
    }

    return jsonResponse({ topicChunk: chunk }, 200);
  } catch {
    return jsonResponse({ topicChunk: null }, 200);
  }
}

import { getCorsHeaders } from "../cors";
import type { Env, TTSRequest, TTSResponse } from "../types";
import { hashString } from "../utils/helpers";

const TTS_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...TTS_CORS_HEADERS
    }
  });
}

export async function handleTTS(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await request.json()) as TTSRequest;
    const text = String(body.text || "").trim();
    const voiceName = body.voiceName || "en-US-Studio-O";
    const languageCode = body.languageCode || "en-US";

    if (!text) {
      return jsonResponse({ error: "Missing text" }, 400);
    }

    const cacheKey = `tts:${hashString(text + voiceName + languageCode)}`;
    const cached = await env.WIDGET_KV.get(cacheKey);
    if (cached) {
      return jsonResponse({ audioContent: cached } satisfies TTSResponse, 200);
    }

    const ttsRes = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${env.GOOGLE_TTS_KEY}`,
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
      return jsonResponse({ error: "Google TTS error", detail: errText }, 502);
    }

    const ttsData = (await ttsRes.json()) as Partial<TTSResponse>;
    const audioContent = ttsData.audioContent || "";

    if (audioContent) {
      try {
        await env.WIDGET_KV.put(cacheKey, audioContent, { expirationTtl: 30 * 24 * 60 * 60 });
      } catch (kvErr) {
        const safeErr = kvErr as { message?: string; name?: string };
        console.error("KV TTS CACHE WRITE ERROR:", JSON.stringify({ message: safeErr.message, name: safeErr.name, key: cacheKey }));
      }
    }

    return jsonResponse({ audioContent } satisfies TTSResponse, 200);
  } catch (err) {
    return jsonResponse(
      { error: "TTS failed", detail: err instanceof Error ? err.message : String(err) },
      500
    );
  }
}

export async function handleTts(request: Request, env: Env): Promise<Response> {
  return handleTTS(request, env);
}

import { validateAuth } from "./auth";
import { getCorsHeaders, handleOptions } from "./cors";
import { handleDistill } from "./routes/distill";
import { handleGrade } from "./routes/grade";
import { handleLearn } from "./routes/learn";
import { handleNotionMilestones } from "./routes/notion";
import { handlePrime } from "./routes/prime";
import { handleState } from "./routes/state";
import { handleTts } from "./routes/tts";
import { handleTutor } from "./routes/tutor";
import { handleVisual } from "./routes/visual";
import type { Env } from "./types";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders()
    }
  });
}

function methodNotAllowed(): Response {
  return json({ error: "Method not allowed" }, 405);
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return handleOptions(request);
    }

    try {
      const url = new URL(request.url);
      const authError = validateAuth(request, env);
      if (authError) return authError;

      const segments = url.pathname.replace(/^\/+/, "").split("/");
      const route = segments[0] || "";
      const key = segments.slice(1).join("/");

      if (route === "state" && key) {
        return handleState(request, env, key);
      }

      if (route === "notion") {
        if (key === "milestones" && request.method === "GET") {
          return handleNotionMilestones(request, env);
        }
        return json({ error: "Unknown Notion resource" }, 404);
      }

      if (url.pathname === "/studyengine/tutor") {
        if (request.method !== "POST") return methodNotAllowed();
        return handleTutor(request, env);
      }

      if (url.pathname === "/studyengine/grade") {
        if (request.method !== "POST") return methodNotAllowed();
        return handleGrade(request, env);
      }

      if (url.pathname === "/studyengine/visual") {
        if (request.method !== "POST") return methodNotAllowed();
        return handleVisual(request, env);
      }

      if (url.pathname === "/studyengine/tts") {
        if (request.method !== "POST") return methodNotAllowed();
        return handleTts(request, env);
      }

      if (url.pathname === "/studyengine/prime") {
        if (request.method !== "POST") return methodNotAllowed();
        return handlePrime(request, env);
      }

      if (url.pathname === "/studyengine/learn") {
        if (request.method !== "POST") return methodNotAllowed();
        return handleLearn(request, env);
      }

      if (url.pathname === "/studyengine/distill") {
        if (request.method !== "POST") return methodNotAllowed();
        return handleDistill(request, env);
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      const fatalErr = error as Error;
      return json({ error: "Internal server error", detail: fatalErr.message }, 500);
    }
  }
};

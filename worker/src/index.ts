import { validateAuth } from "./auth";
import { getCorsHeaders, handleOptions } from "./cors";
import { handleDistill } from "./routes/distill";
import { handleFetchLecture } from "./routes/fetchLecture";
import { handleGrade } from "./routes/grade";
import { handleLectureContext } from "./routes/lectureContext";
import { handleLearn } from "./routes/learn";
import { handleLearnCheck } from "./routes/learnCheck";
import { handleMemory } from "./routes/memory";
import { handleNotionMilestones } from "./routes/notion";
import { handlePrepare } from "./routes/prepare";
import { handlePrime } from "./routes/prime";
import { handleReformulate } from "./routes/reformulate";
import { handleState } from "./routes/state";
import { handleSummary } from "./routes/summary";
import { handleSyllabus } from "./routes/syllabus";
import { handleTriage } from "./routes/triage";
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
      const authError = validateAuth(request, env, url.pathname);
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

      if (url.pathname === "/studyengine/syllabus") {
        if (request.method !== "POST") return methodNotAllowed();
        return handleSyllabus(request, env);
      }

      if (url.pathname === "/studyengine/memory") {
        if (request.method !== "POST") return methodNotAllowed();
        return handleMemory(request, env);
      }

      if (url.pathname === "/studyengine/reformulate") {
        if (request.method !== "POST") return methodNotAllowed();
        return handleReformulate(request, env);
      }

      if (url.pathname === "/studyengine/summary") {
        if (request.method !== "POST") return methodNotAllowed();
        return handleSummary(request, env);
      }

      if (url.pathname === "/studyengine/prepare") {
        if (request.method !== "POST") return methodNotAllowed();
        return handlePrepare(request, env);
      }

      if (url.pathname === "/studyengine/fetch-lecture") {
        if (request.method !== "POST") return methodNotAllowed();
        return handleFetchLecture(request, env);
      }

      if (url.pathname === "/studyengine/distill") {
        if (request.method !== "POST") return methodNotAllowed();
        return handleDistill(request, env);
      }

      if (url.pathname === "/studyengine/lecture-context") {
        if (request.method !== "POST") return methodNotAllowed();
        return handleLectureContext(request, env);
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

      if (url.pathname === "/studyengine/learn" || url.pathname === "/studyengine/learn-plan") {
        if (request.method !== "POST") return methodNotAllowed();
        return handleLearn(request, env);
      }

      if (url.pathname === "/studyengine/learn-check") {
        if (request.method !== "POST") return methodNotAllowed();
        return handleLearnCheck(request, env);
      }

      if (url.pathname === "/studyengine/exam-triage" || url.pathname === "/studyengine/triage") {
        if (request.method !== "POST") return methodNotAllowed();
        return handleTriage(request, env);
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      const fatalErr = error as Error;
      return json({ error: "Internal server error", detail: fatalErr.message }, 500);
    }
  }
};

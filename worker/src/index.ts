import { validateAuth } from "./auth";
import { getCorsHeaders, withCorsHeaders } from "./cors";
import { handleDistill } from "./routes/distill";
import { handleFetchLecture } from "./routes/fetchLecture";
import { handleGrade } from "./routes/grade";
import { handleGloss } from "./routes/gloss";
import { handleIngestExtract } from "./routes/ingest-extract";
import { handleLectureContext } from "./routes/lectureContext";
import { handleLearnPlan } from "./routes/learn-plan";
import { handleLearnTurn } from "./routes/learn-turn";
import { handleMemory } from "./routes/memory";
import { handleNotionMilestones } from "./routes/notion";
import { handlePrepare } from "./routes/prepare";
import { handlePrime } from "./routes/prime";
import { handleParseSyllabus } from "./routes/parse-syllabus";
import { handleReformulate } from "./routes/reformulate";
import { handleState } from "./routes/state";
import { handleSummary } from "./routes/summary";
import { handleSyllabus } from "./routes/syllabus";
import { handleTriage } from "./routes/triage";
import { handleTts } from "./routes/tts";
import { handleTutor } from "./routes/tutor";
import { handleVisual } from "./routes/visual";

import { handleBuildAssemble } from "./routes/build/assemble";
import { handleDeckFrenchCore2000 } from "./routes/build/decks-french-core-2000";
import { handleBuildGlossBatch } from "./routes/build/gloss-batch";
import { handleBuildLexique3Prepare } from "./routes/build/lexique3-prepare";
import { handleBuildStatus } from "./routes/build/status";
import { handleBuildTatoebaPrepare } from "./routes/build/tatoeba-prepare";
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
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders()
      });
    }

    try {
      const url = new URL(request.url);
      const authError = validateAuth(request, env, url.pathname);
      if (authError) return withCorsHeaders(authError);

      const segments = url.pathname.replace(/^\/+/, "").split("/");
      const route = segments[0] || "";
      const key = segments.slice(1).join("/");

      if (route === "state" && key) {
        return withCorsHeaders(await handleState(request, env, key));
      }

      if (route === "notion") {
        if (key === "milestones" && request.method === "GET") {
          return withCorsHeaders(await handleNotionMilestones(request, env));
        }
        return json({ error: "Unknown Notion resource" }, 404);
      }

      if (url.pathname === "/studyengine/tutor") {
        if (request.method !== "POST") return methodNotAllowed();
        return withCorsHeaders(await handleTutor(request, env));
      }

      if (url.pathname === "/studyengine/syllabus") {
        if (request.method !== "POST") return methodNotAllowed();
        return withCorsHeaders(await handleSyllabus(request, env));
      }

      if (url.pathname === "/studyengine/parse-syllabus") {
        if (request.method !== "POST") return methodNotAllowed();
        return withCorsHeaders(await handleParseSyllabus(request, env));
      }

      if (url.pathname === "/studyengine/memory") {
        if (request.method !== "POST") return methodNotAllowed();
        return withCorsHeaders(await handleMemory(request, env));
      }

      if (url.pathname === "/studyengine/reformulate") {
        if (request.method !== "POST") return methodNotAllowed();
        return withCorsHeaders(await handleReformulate(request, env));
      }

      if (url.pathname === "/studyengine/summary") {
        if (request.method !== "POST") return methodNotAllowed();
        return withCorsHeaders(await handleSummary(request, env));
      }

      if (url.pathname === "/studyengine/prepare") {
        if (request.method !== "POST") return methodNotAllowed();
        return withCorsHeaders(await handlePrepare(request, env));
      }

      if (url.pathname === "/studyengine/fetch-lecture") {
        if (request.method !== "POST") return methodNotAllowed();
        return withCorsHeaders(await handleFetchLecture(request, env));
      }

      if (url.pathname === "/studyengine/distill") {
        if (request.method !== "POST") return methodNotAllowed();
        return withCorsHeaders(await handleDistill(request, env));
      }

      if (url.pathname === "/studyengine/lecture-context") {
        if (request.method !== "POST") return methodNotAllowed();
        return withCorsHeaders(await handleLectureContext(request, env));
      }

      if (url.pathname === "/studyengine/grade") {
        if (request.method !== "POST") return methodNotAllowed();
        return withCorsHeaders(await handleGrade(request, env));
      }

      if (url.pathname === "/studyengine/gloss") {
        if (request.method !== "POST") return methodNotAllowed();
        return withCorsHeaders(await handleGloss(request, env));
      }


      if (url.pathname === "/studyengine/build/lexique3-prepare") {
        if (request.method !== "POST") return methodNotAllowed();
        return withCorsHeaders(await handleBuildLexique3Prepare(request, env));
      }

      if (url.pathname === "/studyengine/build/tatoeba-prepare") {
        if (request.method !== "POST") return methodNotAllowed();
        return withCorsHeaders(await handleBuildTatoebaPrepare(request, env));
      }

      if (url.pathname === "/studyengine/build/gloss-batch") {
        if (request.method !== "POST") return methodNotAllowed();
        return withCorsHeaders(await handleBuildGlossBatch(request, env));
      }

      if (url.pathname === "/studyengine/build/assemble") {
        if (request.method !== "POST") return methodNotAllowed();
        return withCorsHeaders(await handleBuildAssemble(request, env));
      }

      if (url.pathname === "/studyengine/build/status") {
        if (request.method !== "GET") return methodNotAllowed();
        return withCorsHeaders(await handleBuildStatus(request, env));
      }

      if (url.pathname === "/studyengine/decks/french-core-2000") {
        if (request.method !== "GET") return methodNotAllowed();
        return withCorsHeaders(await handleDeckFrenchCore2000(request, env));
      }

      if (url.pathname === "/studyengine/visual") {
        if (request.method !== "POST") return methodNotAllowed();
        return withCorsHeaders(await handleVisual(request, env));
      }

      if (url.pathname === "/studyengine/tts") {
        if (request.method !== "POST") return methodNotAllowed();
        return withCorsHeaders(await handleTts(request, env));
      }

      if (url.pathname === "/studyengine/prime") {
        if (request.method !== "POST") return methodNotAllowed();
        return withCorsHeaders(await handlePrime(request, env));
      }

      if (url.pathname === "/studyengine/learn-plan") {
        if (request.method !== "POST") return methodNotAllowed();
        return withCorsHeaders(await handleLearnPlan(request, env));
      }

      if (url.pathname === "/studyengine/learn-turn") {
        if (request.method !== "POST") return methodNotAllowed();
        return withCorsHeaders(await handleLearnTurn(request, env));
      }

      if (url.pathname === "/studyengine/ingest-extract") {
        if (request.method !== "POST") return methodNotAllowed();
        return withCorsHeaders(await handleIngestExtract(request, env));
      }

      if (url.pathname === "/studyengine/exam-triage" || url.pathname === "/studyengine/triage") {
        if (request.method !== "POST") return methodNotAllowed();
        return withCorsHeaders(await handleTriage(request, env));
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      const fatalErr = error as Error;
      return json({ error: "Internal server error", detail: fatalErr.message }, 500);
    }
  }
};

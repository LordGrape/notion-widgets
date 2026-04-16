import { getCorsHeaders } from "../cors";
import type { Env, FetchLectureRequest } from "../types";

const FETCH_LECTURE_CORS_HEADERS = {
  ...getCorsHeaders(),
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...FETCH_LECTURE_CORS_HEADERS
    }
  });
}

export async function handleFetchLecture(request: Request, _env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await request.json()) as FetchLectureRequest;
    const targetUrl = String(body.url || "").trim();

    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
      return jsonResponse({ error: "Valid URL required" }, 400);
    }

    const pageRes = await fetch(targetUrl, {
      headers: {
        "User-Agent": "StudyEngine-LectureImport/1.0",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8"
      }
    });

    if (!pageRes.ok) {
      return jsonResponse({ error: "Failed to fetch URL", status: pageRes.status }, 502);
    }

    const contentType = pageRes.headers.get("content-type") || "";
    let html = "";
    let rawText = "";

    if (contentType.includes("text/plain")) {
      rawText = await pageRes.text();
    } else {
      html = await pageRes.text();

      const textChunks: string[] = [];
      const rewriter = new HTMLRewriter()
        .on("script", { element(el) { el.remove(); } })
        .on("style", { element(el) { el.remove(); } })
        .on("noscript", { element(el) { el.remove(); } })
        .on("svg", { element(el) { el.remove(); } })
        .on("nav", { element(el) { el.remove(); } })
        .on("header", { element(el) { el.remove(); } })
        .on("footer", { element(el) { el.remove(); } })
        .on("body", {
          text(t) {
            const s = t.text;
            if (s && s.trim()) textChunks.push(s);
          }
        });

      await rewriter.transform(new Response(html)).text();

      rawText = textChunks
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }

    if (rawText.length > 60000) rawText = rawText.slice(0, 60000);

    const titleMatch = typeof html === "string" ? html.match(/<title[^>]*>([^<]*)<\/title>/i) : null;
    const pageTitle = titleMatch ? String(titleMatch[1] || "").trim() : "";

    return jsonResponse(
      {
        text: rawText,
        title: pageTitle,
        charCount: rawText.length,
        source: targetUrl
      },
      200
    );
  } catch (e) {
    return jsonResponse({ error: "Fetch failed", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
}

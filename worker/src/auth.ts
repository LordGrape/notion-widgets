import type { Env } from "./types";
import { getCorsHeaders } from "./cors";

const PUBLIC_STUDYENGINE_ROUTES = new Set(["/studyengine/learn-plan", "/studyengine/learn-check"]);

export function validateAuth(request: Request, env: Env, pathname?: string): Response | null {
  const requiresWidgetKey = pathname ? !PUBLIC_STUDYENGINE_ROUTES.has(pathname) : true;
  if (!requiresWidgetKey) return null;

  const passphrase = request.headers.get("X-Widget-Key");
  if (!passphrase || passphrase !== env.WIDGET_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders()
      }
    });
  }
  return null;
}

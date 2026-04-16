import type { Env } from "./types";
import { getCorsHeaders } from "./cors";

export function validateAuth(request: Request, env: Env): Response | null {
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

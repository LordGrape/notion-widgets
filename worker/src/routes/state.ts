import { getCorsHeaders } from "../cors";
import type { Env } from "../types";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders()
    }
  });
}

export async function handleState(request: Request, env: Env, key: string): Promise<Response> {
  if (request.method === "GET") {
    const value = await env.WIDGET_KV.get(key, "json");
    return json({ key, value: value ?? null });
  }

  if (request.method === "PUT") {
    const body = (await request.json()) as { value?: unknown };
    const newState = (body.value ?? {}) as Record<string, unknown>;

    if (key === "dragon") {
      const existing = await env.WIDGET_KV.get(key, "json");
      if (existing && typeof existing === "object") {
        const getVal = (obj: unknown, k: string): number => {
          if (!obj || typeof obj !== "object" || !(k in obj)) return 0;
          const entry = (obj as Record<string, unknown>)[k];
          if (entry && typeof entry === "object" && "value" in (entry as Record<string, unknown>)) {
            return Number((entry as Record<string, unknown>).value) || 0;
          }
          return Number(entry) || 0;
        };

        const oldXP = getVal(existing, "xp");
        const newXP = getVal(newState, "xp");
        const delta = newXP - oldXP;

        if (delta < 0 && newXP !== 0) {
          if (newState.xp && typeof newState.xp === "object") {
            (newState.xp as Record<string, unknown>).value = oldXP;
          } else {
            newState.xp = oldXP;
          }
        }

        if (delta > 2000) {
          const capped = oldXP + 2000;
          if (newState.xp && typeof newState.xp === "object") {
            (newState.xp as Record<string, unknown>).value = capped;
          } else {
            newState.xp = capped;
          }
        }
      }
    }

    try {
      await env.WIDGET_KV.put(key, JSON.stringify(newState));
    } catch (error) {
      const kvError = error as Error;
      console.error(
        "KV WRITE ERROR:",
        JSON.stringify({
          message: kvError.message,
          name: kvError.name,
          stack: kvError.stack,
          key
        })
      );
      return json({ error: "KV write failed", detail: kvError.message, key, ok: false }, 503);
    }

    return json({ key, ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
}

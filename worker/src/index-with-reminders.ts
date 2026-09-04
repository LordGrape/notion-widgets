import app from "./index";
import { getReminderHealth, processDueReminders } from "./routes/reminders";
import type { Env } from "./types";

function healthResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/reminders/health") {
      try {
        return healthResponse(await getReminderHealth(env));
      } catch {
        return healthResponse({ ok: false, version: 2, error: "health_unavailable" }, 500);
      }
    }
    return app.fetch(request, env, ctx);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      processDueReminders(env).then((result) => {
        if (result.sent || result.failed) {
          console.log("Notion reminders", JSON.stringify(result));
        }
      }),
    );
  },
};

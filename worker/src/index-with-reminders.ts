import app from "./index";
import { processDueReminders } from "./routes/reminders";
import type { Env } from "./types";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

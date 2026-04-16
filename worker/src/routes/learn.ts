import { getCorsHeaders } from "../cors";
import type { Env } from "../types";

function notYetMigrated(): Response {
  return new Response(JSON.stringify({ error: "not yet migrated" }), {
    status: 501,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders()
    }
  });
}

export async function handleLearn(_request: Request, _env: Env): Promise<Response> {
  return notYetMigrated();
}

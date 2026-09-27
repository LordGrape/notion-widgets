import { getCorsHeaders } from "../cors";
import { sendWebPush } from "../webpush";
import type { Env } from "../types";

const SUBSCRIPTION_KEY = "push_subscription";
const PENDING_KEY = "push_pending";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders()
    }
  });
}

interface StoredSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface PendingPush {
  dueAt: number;
  title: string;
  body: string;
}

/* Single-tenant widget (just Musbah), so there's exactly one subscription and
   at most one pending scheduled push at a time — no per-user lookup needed. */

export async function handlePushSubscribe(request: Request, env: Env): Promise<Response> {
  if (request.method !== "PUT") return json({ error: "Method not allowed" }, 405);
  const body = (await request.json()) as { subscription?: StoredSubscription };
  const sub = body.subscription;
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    return json({ error: "Invalid subscription" }, 400);
  }
  await env.WIDGET_KV.put(SUBSCRIPTION_KEY, JSON.stringify(sub));
  return json({ ok: true });
}

export async function handlePushSchedule(request: Request, env: Env): Promise<Response> {
  if (request.method !== "PUT") return json({ error: "Method not allowed" }, 405);
  const body = (await request.json()) as Partial<PendingPush>;
  if (typeof body.dueAt !== "number" || !body.title || !body.body) {
    return json({ error: "Invalid schedule payload" }, 400);
  }
  const pending: PendingPush = { dueAt: body.dueAt, title: String(body.title), body: String(body.body) };
  await env.WIDGET_KV.put(PENDING_KEY, JSON.stringify(pending));
  return json({ ok: true });
}

export async function handlePushCancel(request: Request, env: Env): Promise<Response> {
  if (request.method !== "DELETE") return json({ error: "Method not allowed" }, 405);
  await env.WIDGET_KV.delete(PENDING_KEY);
  return json({ ok: true });
}

/* Called from the worker's existing once-a-minute cron (see
   index-with-reminders.ts). Fires the pending push once it's actually due
   and clears it either way so a dead/expired subscription can't retry
   forever. This is intentionally a backstop for when the client's own
   cancel-before-due-time never got a chance to run (tab frozen/closed) — in
   the common case the pending entry is already gone by the time this checks. */
export async function processDuePush(env: Env): Promise<{ sent: boolean; skipped: boolean; error?: string }> {
  const pending = await env.WIDGET_KV.get(PENDING_KEY, "json") as PendingPush | null;
  if (!pending) return { sent: false, skipped: true };
  if (pending.dueAt > Date.now()) return { sent: false, skipped: true };

  const sub = (await env.WIDGET_KV.get(SUBSCRIPTION_KEY, "json")) as StoredSubscription | null;
  if (!sub) {
    await env.WIDGET_KV.delete(PENDING_KEY);
    return { sent: false, skipped: false, error: "no_subscription" };
  }
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    await env.WIDGET_KV.delete(PENDING_KEY);
    return { sent: false, skipped: false, error: "vapid_not_configured" };
  }

  try {
    const result = await sendWebPush(
      sub,
      {
        publicKeyB64url: env.VAPID_PUBLIC_KEY,
        privateKeyD: env.VAPID_PRIVATE_KEY,
        subject: env.VAPID_SUBJECT || "https://notion-widgets-93r.pages.dev"
      },
      { title: pending.title, body: pending.body },
      120
    );
    await env.WIDGET_KV.delete(PENDING_KEY);
    if ((result.status === 404 || result.status === 410) ) {
      /* Subscription expired/invalid on the push service's end — drop it so
         we don't keep failing silently; the client re-subscribes next time
         it toggles notifications or reloads with them already on. */
      await env.WIDGET_KV.delete(SUBSCRIPTION_KEY);
    }
    return { sent: result.ok, skipped: false, error: result.ok ? undefined : `http_${result.status}` };
  } catch (error) {
    await env.WIDGET_KV.delete(PENDING_KEY);
    const err = error as Error;
    return { sent: false, skipped: false, error: err.message };
  }
}

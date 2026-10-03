import { getCorsHeaders } from "../cors";
import { sendWebPush } from "../webpush";
import type { Env } from "../types";

const SUBSCRIPTION_KEY = "push_subscription"; // legacy: a single device
const SUBSCRIPTIONS_KEY = "push_subscriptions";
const MAX_SUBSCRIPTIONS = 6;
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

/* Single-tenant widget (just Musbah): one pending scheduled push at a time, delivered to every
   device that has subscribed (a laptop and a desktop must not replace each other). */

export async function loadSubscriptions(env: Env): Promise<StoredSubscription[]> {
  const list = (await env.WIDGET_KV.get(SUBSCRIPTIONS_KEY, "json")) as StoredSubscription[] | null;
  if (Array.isArray(list)) return list;
  const legacy = (await env.WIDGET_KV.get(SUBSCRIPTION_KEY, "json")) as StoredSubscription | null;
  return legacy ? [legacy] : [];
}

async function saveSubscriptions(env: Env, list: StoredSubscription[]): Promise<void> {
  await env.WIDGET_KV.put(SUBSCRIPTIONS_KEY, JSON.stringify(list.slice(-MAX_SUBSCRIPTIONS)));
  await env.WIDGET_KV.delete(SUBSCRIPTION_KEY);
}

async function deliver(
  env: Env,
  payload: { title: string; body: string },
): Promise<{ sent: number; failed: number; devices: number; error?: string }> {
  const subs = await loadSubscriptions(env);
  if (!subs.length) return { sent: 0, failed: 0, devices: 0, error: "no_subscription" };
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return { sent: 0, failed: 0, devices: subs.length, error: "vapid_not_configured" };
  const vapid = {
    publicKeyB64url: env.VAPID_PUBLIC_KEY,
    privateKeyD: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT || "https://notion-widgets-93r.pages.dev"
  };
  let sent = 0;
  let failed = 0;
  let lastError: string | undefined;
  const keep: StoredSubscription[] = [];
  for (const sub of subs) {
    try {
      const result = await sendWebPush(sub, vapid, payload, 120);
      if (result.ok) sent++;
      else {
        failed++;
        lastError = `http_${result.status}`;
      }
      /* 404/410: the push service says this subscription is gone, so drop it. */
      if (result.status !== 404 && result.status !== 410) keep.push(sub);
    } catch (error) {
      failed++;
      lastError = (error as Error).message;
      keep.push(sub);
    }
  }
  if (keep.length !== subs.length) await saveSubscriptions(env, keep);
  return { sent, failed, devices: subs.length, error: sent ? undefined : lastError };
}

export async function handlePushSubscribe(request: Request, env: Env): Promise<Response> {
  if (request.method !== "PUT") return json({ error: "Method not allowed" }, 405);
  const body = (await request.json()) as { subscription?: StoredSubscription };
  const sub = body.subscription;
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    return json({ error: "Invalid subscription" }, 400);
  }
  const subs = (await loadSubscriptions(env)).filter((existing) => existing.endpoint !== sub.endpoint);
  subs.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
  await saveSubscriptions(env, subs);
  return json({ ok: true, devices: Math.min(subs.length, MAX_SUBSCRIPTIONS) });
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
  /* Clear first so a dead or expired subscription can never retry forever. */
  await env.WIDGET_KV.delete(PENDING_KEY);
  const result = await deliver(env, { title: pending.title, body: pending.body });
  return { sent: result.sent > 0, skipped: false, error: result.error };
}

/* Sends a notification to every subscribed device right now, so the closed-app path can be tested end to end. */
export async function handlePushTest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const result = await deliver(env, {
    title: "Command Centre",
    body: "Test notification. If you can read this, alerts reach you even when the app is closed."
  });
  return json({ ok: result.sent > 0, ...result });
}

import type { Env } from "../types";

export async function emitTier2Event(
  env: Env,
  evt: { route: string; model: string; ts: number }
): Promise<void> {
  const day = new Date(evt.ts).toISOString().slice(0, 10);
  const key = `tier2:${day}`;
  const existing = await env.WIDGET_KV.get(key, "json") as Array<typeof evt> | null;
  const next = [...(existing ?? []), evt];
  await env.WIDGET_KV.put(key, JSON.stringify(next), { expirationTtl: 60 * 60 * 24 * 90 });
}

import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("../src/webpush", () => ({ sendWebPush: (...args: unknown[]) => send(...args) }));

import { handlePushSchedule, handlePushSubscribe, handlePushTest, loadSubscriptions, processDuePush } from "../src/routes/push";

function fakeKV() {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key: string, type?: string) => {
      const raw = store.get(key);
      if (raw === undefined) return null;
      return type === "json" ? JSON.parse(raw) : raw;
    },
    put: async (key: string, value: string) => void store.set(key, value),
    delete: async (key: string) => void store.delete(key)
  };
}

const env = (kv: ReturnType<typeof fakeKV>, vapid = true) =>
  ({ WIDGET_KV: kv, ...(vapid ? { VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv" } : {}) }) as any;

const sub = (name: string) => ({ endpoint: `https://push.example/${name}`, keys: { p256dh: `p-${name}`, auth: `a-${name}` } });
const put = (body: unknown) => new Request("https://w/push/x", { method: "PUT", body: JSON.stringify(body) });

describe("push notifications", () => {
  let kv: ReturnType<typeof fakeKV>;
  beforeEach(() => {
    kv = fakeKV();
    send.mockReset();
    send.mockResolvedValue({ ok: true, status: 201, text: "" });
  });

  it("keeps every device, so a Mac and a Windows PC do not replace each other", async () => {
    await handlePushSubscribe(put({ subscription: sub("mac") }), env(kv));
    const res = await handlePushSubscribe(put({ subscription: sub("windows") }), env(kv));
    expect(((await res.json()) as any).devices).toBe(2);
    expect((await loadSubscriptions(env(kv))).map((s) => s.endpoint)).toEqual(["https://push.example/mac", "https://push.example/windows"]);
  });

  it("does not duplicate a device that subscribes again", async () => {
    await handlePushSubscribe(put({ subscription: sub("mac") }), env(kv));
    await handlePushSubscribe(put({ subscription: sub("mac") }), env(kv));
    expect(await loadSubscriptions(env(kv))).toHaveLength(1);
  });

  it("migrates the old single subscription instead of losing it", async () => {
    kv.store.set("push_subscription", JSON.stringify(sub("old")));
    await handlePushSubscribe(put({ subscription: sub("new") }), env(kv));
    expect((await loadSubscriptions(env(kv))).map((s) => s.endpoint)).toEqual(["https://push.example/old", "https://push.example/new"]);
    expect(kv.store.has("push_subscription")).toBe(false);
  });

  it("sends a due push to every device and clears it", async () => {
    await handlePushSubscribe(put({ subscription: sub("mac") }), env(kv));
    await handlePushSubscribe(put({ subscription: sub("windows") }), env(kv));
    await handlePushSchedule(put({ dueAt: Date.now() - 1000, title: "Focus over", body: "Take a break" }), env(kv));
    const result = await processDuePush(env(kv));
    expect(result.sent).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(kv.store.has("push_pending")).toBe(false);
  });

  it("waits for a push that is not due yet", async () => {
    await handlePushSubscribe(put({ subscription: sub("mac") }), env(kv));
    await handlePushSchedule(put({ dueAt: Date.now() + 60000, title: "t", body: "b" }), env(kv));
    expect((await processDuePush(env(kv))).skipped).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it("drops a device the push service says is gone but keeps the rest", async () => {
    await handlePushSubscribe(put({ subscription: sub("mac") }), env(kv));
    await handlePushSubscribe(put({ subscription: sub("windows") }), env(kv));
    send.mockImplementation(async (s: any) => (s.endpoint.endsWith("mac") ? { ok: false, status: 410, text: "gone" } : { ok: true, status: 201, text: "" }));
    await handlePushSchedule(put({ dueAt: Date.now() - 1, title: "t", body: "b" }), env(kv));
    const result = await processDuePush(env(kv));
    expect(result.sent).toBe(true);
    expect((await loadSubscriptions(env(kv))).map((s) => s.endpoint)).toEqual(["https://push.example/windows"]);
  });

  it("test endpoint reports how many devices were reached", async () => {
    await handlePushSubscribe(put({ subscription: sub("mac") }), env(kv));
    await handlePushSubscribe(put({ subscription: sub("windows") }), env(kv));
    const res = await handlePushTest(new Request("https://w/push/test", { method: "POST" }), env(kv));
    expect(await res.json()).toMatchObject({ ok: true, sent: 2, devices: 2 });
  });

  it("test endpoint explains why nothing was sent", async () => {
    const none = (await (await handlePushTest(new Request("https://w/push/test", { method: "POST" }), env(kv))).json()) as any;
    expect(none).toMatchObject({ ok: false, error: "no_subscription" });
    await handlePushSubscribe(put({ subscription: sub("mac") }), env(kv, false));
    const noKeys = (await (await handlePushTest(new Request("https://w/push/test", { method: "POST" }), env(kv, false))).json()) as any;
    expect(noKeys).toMatchObject({ ok: false, error: "vapid_not_configured" });
  });
});

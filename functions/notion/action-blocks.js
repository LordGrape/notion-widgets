const DB_ID = "67fdab55-eb09-4a59-a54d-0503ba4efeda";
const NOTION_VERSION = "2022-06-28";
const PRIVATE_WIDGET_KEY_HASH = "96228d55dfad1f177af44314d07b7fff83afe2a26efbd07892ca727e73839211";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json", "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  }});
}
function rich(value) { return value ? [{ type: "text", text: { content: String(value).slice(0, 1900) } }] : []; }
function text(prop) { return (prop?.title || prop?.rich_text || []).map(v => v?.plain_text || v?.text?.content || "").join(""); }
async function notion(env, path, init = {}) {
  const response = await fetch("https:" + "//api.notion.com/v1" + path, { ...init, headers: {
    Authorization: `Bearer ${env.NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json", ...(init.headers || {})
  }});
  if (!response.ok) throw new Error(`Notion ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}
function fromPage(page) {
  const p = page.properties || {};
  return { notionPageId: page.id, occurrenceId: text(p["Occurrence ID"]) || `notion:${page.id}`,
    scheduleId: text(p["Schedule ID"]) || null, contextPageId: p.Context?.relation?.[0]?.id || null,
    action: text(p.Action), category: p.Category?.select?.name || "Personal",
    status: p.Status?.status?.name || "Scheduled", scheduledStart: p.Scheduled?.date?.start || null,
    scheduledEnd: p.Scheduled?.date?.end || null, plannedMinutes: p["Planned minutes"]?.number ?? null,
    actualMinutes: p["Actual minutes"]?.number ?? null, priority: p.Priority?.select?.name || null,
    source: p.Source?.select?.name || "Manual", notes: text(p.Notes), lastEdited: page.last_edited_time || null };
}
function properties(item) {
  const p = { Action: { title: rich(item.action) }, Status: { status: { name: item.status } },
    Category: { select: { name: item.category } },
    Scheduled: item.scheduledStart ? { date: { start: item.scheduledStart, end: item.scheduledEnd || null } } : { date: null },
    "Planned minutes": { number: item.plannedMinutes ?? null }, "Actual minutes": { number: item.actualMinutes ?? null },
    Source: { select: { name: item.source || "Schedule" } }, "Occurrence ID": { rich_text: rich(item.occurrenceId) },
    "Schedule ID": { rich_text: rich(item.scheduleId || "") }, Notes: { rich_text: rich(item.notes || "") } };
  if (item.contextPageId !== undefined) p.Context = { relation: item.contextPageId ? [{ id: item.contextPageId }] : [] };
  if (item.priority) p.Priority = { select: { name: item.priority } };
  return p;
}
async function find(env, db, occurrenceId) {
  const data = await notion(env, `/databases/${db}/query`, { method: "POST", body: JSON.stringify({
    filter: { property: "Occurrence ID", rich_text: { equals: occurrenceId } }, page_size: 1 }) });
  return data.results?.[0] || null;
}
async function query(env, db, from, to) {
  const filters = [];
  if (from) filters.push({ property: "Scheduled", date: { on_or_after: from } });
  if (to) filters.push({ property: "Scheduled", date: { on_or_before: to } });
  const data = await notion(env, `/databases/${db}/query`, { method: "POST", body: JSON.stringify({
    ...(filters.length ? { filter: filters.length === 1 ? filters[0] : { and: filters } } : {}),
    sorts: [{ property: "Scheduled", direction: "ascending" }], page_size: 100 }) });
  return (data.results || []).map(fromPage);
}
async function upsert(env, db, item) {
  const page = item.notionPageId ? { id: item.notionPageId } : await find(env, db, item.occurrenceId);
  if (page) return notion(env, `/pages/${page.id}`, { method: "PATCH", body: JSON.stringify({ properties: properties(item) }) });
  return notion(env, "/pages", { method: "POST", body: JSON.stringify({ parent: { database_id: db }, properties: properties(item) }) });
}
export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return json({}, 204);
  if (!env.NOTION_TOKEN) return json({ configured: false, error: "Notion integration not configured" }, 501);
  const suppliedKey = request.headers.get("X-Widget-Key") || "";
  const suppliedHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(suppliedKey)))).map(value => value.toString(16).padStart(2, "0")).join("");
  const authorized = (env.VITE_WIDGET_KEY && suppliedKey === env.VITE_WIDGET_KEY) || suppliedHash === PRIVATE_WIDGET_KEY_HASH;
  if (!authorized) return json({ configured: false, error: "Unauthorized" }, 401);
  const url = new URL(request.url), db = env.ACTION_BLOCKS_DB_ID || DB_ID;
  try {
    if (request.method === "GET") return json({ configured: true, items: await query(env, db, url.searchParams.get("from"), url.searchParams.get("to")) });
    if (request.method === "POST") {
      const body = await request.json(), incoming = Array.isArray(body.items) ? body.items.slice(0, 50) : [], items = [];
      for (const item of incoming) {
        if (!item?.occurrenceId || !item?.action || (!item.scheduledStart && !item.contextPageId)) continue;
        items.push(fromPage(await upsert(env, db, item)));
      }
      return json({ configured: true, items });
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (error) { return json({ configured: true, error: "Notion action sync failed", detail: error.message }, 502); }
}

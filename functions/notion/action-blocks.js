const ACTION_BLOCKS_DB_ID = "67fdab55-eb09-4a59-a54d-0503ba4efeda";
const NOTION_VERSION = "2022-06-28";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}

function richText(value) {
  return value ? [{ type: "text", text: { content: String(value).slice(0, 1900) } }] : [];
}

function text(prop) {
  return (prop?.title || prop?.rich_text || [])
    .map((value) => value?.plain_text || value?.text?.content || "")
    .join("");
}

async function notionFetch(env, path, init = {}) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Notion ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return response.json();
}

function fromNotionPage(page) {
  const p = page.properties || {};
  return {
    notionPageId: page.id,
    occurrenceId: text(p["Occurrence ID"]) || `notion:${page.id}`,
    scheduleId: text(p["Schedule ID"]) || null,
    contextPageId: p.Context?.relation?.[0]?.id || null,
    action: text(p.Action),
    category: p.Category?.select?.name || "Personal",
    status: p.Status?.status?.name || "Scheduled",
    scheduledStart: p.Scheduled?.date?.start || null,
    scheduledEnd: p.Scheduled?.date?.end || null,
    plannedMinutes: p["Planned minutes"]?.number ?? null,
    actualMinutes: p["Actual minutes"]?.number ?? null,
    priority: p.Priority?.select?.name || null,
    source: p.Source?.select?.name || "Manual",
    notes: text(p.Notes),
    lastEdited: page.last_edited_time || null,
  };
}

function toNotionProperties(item) {
  const properties = {
    Action: { title: richText(item.action) },
    Status: { status: { name: item.status } },
    Category: { select: { name: item.category } },
    Scheduled: item.scheduledStart
      ? { date: { start: item.scheduledStart, end: item.scheduledEnd || null } }
      : { date: null },
    "Planned minutes": { number: item.plannedMinutes ?? null },
    "Actual minutes": { number: item.actualMinutes ?? null },
    Source: { select: { name: item.source || "Schedule" } },
    "Occurrence ID": { rich_text: richText(item.occurrenceId) },
    "Schedule ID": { rich_text: richText(item.scheduleId || "") },
    Notes: { rich_text: richText(item.notes || "") },
  };
  if (item.contextPageId !== undefined) {
    properties.Context = { relation: item.contextPageId ? [{ id: item.contextPageId }] : [] };
  }
  if (item.priority) properties.Priority = { select: { name: item.priority } };
  return properties;
}

async function findByOccurrence(env, dbId, occurrenceId) {
  const data = await notionFetch(env, `/databases/${dbId}/query`, {
    method: "POST",
    body: JSON.stringify({
      filter: { property: "Occurrence ID", rich_text: { equals: occurrenceId } },
      page_size: 1,
    }),
  });
  return data.results?.[0] || null;
}

async function queryRange(env, dbId, from, to) {
  const filters = [];
  if (from) filters.push({ property: "Scheduled", date: { on_or_after: from } });
  if (to) filters.push({ property: "Scheduled", date: { on_or_before: to } });
  const data = await notionFetch(env, `/databases/${dbId}/query`, {
    method: "POST",
    body: JSON.stringify({
      ...(filters.length ? { filter: filters.length === 1 ? filters[0] : { and: filters } } : {}),
      sorts: [{ property: "Scheduled", direction: "ascending" }],
      page_size: 100,
    }),
  });
  return (data.results || []).map(fromNotionPage);
}

async function upsert(env, dbId, item) {
  const existing = item.notionPageId
    ? { id: item.notionPageId }
    : await findByOccurrence(env, dbId, item.occurrenceId);
  const properties = toNotionProperties(item);
  if (existing) {
    return notionFetch(env, `/pages/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ properties }),
    });
  }
  return notionFetch(env, "/pages", {
    method: "POST",
    body: JSON.stringify({ parent: { database_id: dbId }, properties }),
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return json({}, 204);
  if (!env.NOTION_TOKEN) return json({ configured: false, error: "Notion integration not configured" }, 501);
  if (!env.VITE_WIDGET_KEY || request.headers.get("X-Widget-Key") !== env.VITE_WIDGET_KEY) {
    return json({ configured: false, error: "Unauthorized" }, 401);
  }
  const url = new URL(request.url);
  const dbId = env.ACTION_BLOCKS_DB_ID || ACTION_BLOCKS_DB_ID;
  try {
    if (request.method === "GET") {
      return json({
        configured: true,
        items: await queryRange(env, dbId, url.searchParams.get("from"), url.searchParams.get("to")),
      });
    }
    if (request.method === "POST") {
      const body = await request.json();
      const incoming = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
      const items = [];
      for (const item of incoming) {
        if (!item?.occurrenceId || !item?.action || (!item.scheduledStart && !item.contextPageId)) continue;
        items.push(fromNotionPage(await upsert(env, dbId, item)));
      }
      return json({ configured: true, items });
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    return json({ configured: true, error: "Notion action sync failed", detail: error.message }, 502);
  }
}

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

export async function handleNotionMilestones(request: Request, env: Env): Promise<Response> {
  if (!env.NOTION_TOKEN) {
    return json({ error: "Notion integration not configured" }, 501);
  }

  if (request.method !== "GET") {
    return json({ error: "Unknown Notion resource" }, 404);
  }

  const url = new URL(request.url);
  const dbId = url.searchParams.get("db") || env.NOTION_DB_ID || "";
  if (!dbId) {
    return json({ error: "Missing db — set NOTION_DB_ID secret or pass ?db=" }, 400);
  }

  const today = new Date().toISOString().split("T")[0];
  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      filter: {
        and: [
          { property: "date", date: { on_or_after: today } },
          { property: "assignment", select: { is_not_empty: true } }
        ]
      },
      sorts: [{ property: "date", direction: "ascending" }],
      page_size: 30
    })
  });

  if (!res.ok) {
    const err = await res.text();
    return json({ error: "Notion API error", detail: err }, res.status);
  }

  const data = (await res.json()) as {
    results?: Array<{
      id: string;
      properties: Record<string, any>;
    }>;
  };

  const items = (data.results || []).map((page) => {
    const props = page.properties;
    const titleProp = props["lecture/assignment"];
    const title = titleProp && titleProp.title && titleProp.title.length
      ? titleProp.title.map((t: { plain_text: string }) => t.plain_text).join("")
      : "";
    const dateProp = props.date;
    const date = dateProp && dateProp.date ? dateProp.date.start : null;
    const dateEnd = dateProp && dateProp.date ? dateProp.date.end : null;
    const category = props.assignment?.select?.name || "";
    const progress = props.progress?.status?.name || "";
    const worth = props.worth?.number ?? null;
    const notes = props.notes?.rich_text?.map((t: { plain_text: string }) => t.plain_text).join("").slice(0, 120) || "";

    return { id: page.id, title, date, dateEnd, category, progress, worth, notes };
  });

  return json({ items });
}

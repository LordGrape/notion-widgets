const FEED_URL = "https://raw.githubusercontent.com/LordGrape/notion-widgets/a06d8b3df72b612a8b2f428ec16e920fc33b6188/action-blocks-feed.enc.json";

export async function onRequestGet() {
  try {
    const response = await fetch(FEED_URL, { cf: { cacheTtl: 60, cacheEverything: true } });
    if (!response.ok) return new Response(JSON.stringify({ error: "Feed unavailable" }), { status: 502, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    return new Response(await response.text(), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=60", "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Feed unavailable" }), { status: 502, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
}

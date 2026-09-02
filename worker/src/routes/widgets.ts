const RAW_ROOT = "https:" + "//raw.githubusercontent.com/LordGrape/notion-widgets/main/";
const ROOT_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:html|js|css|json)$/;
const NESTED_FILE = /^(?:assets|studyengine)\/[A-Za-z0-9._/-]+$/;
const SAFE_EXTENSION = /\.(?:html|js|css|json|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|mp3|wav|m4a|pdf)$/i;

export function widgetAssetPath(pathname: string): string | null {
  if (!pathname.startsWith("/widgets/")) return null;
  let value: string;
  try {
    value = decodeURIComponent(pathname.slice("/widgets/".length));
  } catch {
    return null;
  }
  if (!value || value.includes("\0") || value.startsWith("/") || value.split("/").includes("..")) return null;
  if (ROOT_FILE.test(value)) return value;
  if (NESTED_FILE.test(value) && SAFE_EXTENSION.test(value)) return value;
  return null;
}

export function buildWidgetAssetUrl(pathname: string): string | null {
  const path = widgetAssetPath(pathname);
  if (!path) return null;
  return RAW_ROOT + path.split("/").map(encodeURIComponent).join("/");
}

export function widgetContentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const types: Record<string, string> = {
    html: "text/html; charset=utf-8",
    js: "application/javascript; charset=utf-8",
    css: "text/css; charset=utf-8",
    json: "application/json; charset=utf-8",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    ico: "image/x-icon",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    pdf: "application/pdf"
  };
  return types[ext] || "application/octet-stream";
}

export async function handleWidgetAsset(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }
  const url = new URL(request.url);
  const path = widgetAssetPath(url.pathname);
  const upstream = buildWidgetAssetUrl(url.pathname);
  if (!path || !upstream) return new Response("Not found", { status: 404 });

  const response = await fetch(upstream, {
    headers: { Accept: "*/*", "User-Agent": "notion-widgets-worker" }
  });
  if (!response.ok) {
    return new Response("Widget asset unavailable", { status: response.status === 404 ? 404 : 502 });
  }

  const headers = new Headers();
  headers.set("Content-Type", widgetContentType(path));
  headers.set("Cache-Control", path.endsWith(".html") ? "no-cache, max-age=0" : "public, max-age=60, s-maxage=300");
  headers.set("X-Content-Type-Options", "nosniff");
  const etag = response.headers.get("ETag");
  if (etag) headers.set("ETag", etag);
  return new Response(response.body, { status: 200, headers });
}

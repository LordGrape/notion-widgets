const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Widget-Key",
  "Access-Control-Max-Age": "86400"
} satisfies Record<string, string>;

export function getCorsHeaders(_origin?: string): HeadersInit {
  return { ...CORS_HEADERS };
}

export function handleOptions(_request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders()
  });
}

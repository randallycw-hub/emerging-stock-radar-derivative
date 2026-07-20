export function publicApiHeaders(cacheControl = "no-store") {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": cacheControl
  };
}

export function publicApiOptions() {
  return new Response(null, { status: 204, headers: publicApiHeaders() });
}

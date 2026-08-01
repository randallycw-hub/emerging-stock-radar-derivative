import { pathToFileURL } from "node:url";

export async function triggerIpoRefresh({
  url = process.env.IPO_REFRESH_URL,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!url) throw new Error("IPO_REFRESH_URL is required");

  const refreshUrl = new URL(url);
  refreshUrl.searchParams.set("refresh", "1");
  const response = await fetchImpl(refreshUrl, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`IPO refresh failed: HTTP ${response.status}`);

  const payload = await response.json();
  if (payload?.schemaVersion !== 1) throw new Error("IPO refresh returned an unsupported schemaVersion");
  if (!Array.isArray(payload.records)) throw new Error("IPO refresh payload is missing records");
  if (typeof payload.dataDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.dataDate)) {
    throw new Error("IPO refresh payload is missing dataDate");
  }
  return payload;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const payload = await triggerIpoRefresh();
  console.log(`IPO refresh accepted: ${payload.dataDate}${payload.stale ? " (stale snapshot)" : ""}`);
}

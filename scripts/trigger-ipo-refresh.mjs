import { pathToFileURL } from "node:url";
import { assertIpoEventSnapshot } from "../lib/ipo-events/snapshot.ts";

export async function triggerIpoRefresh({
  url = process.env.IPO_REFRESH_URL,
  fetchImpl = globalThis.fetch,
  now = new Date(),
  maxAttempts = 3,
  retryDelayMs = 20_000,
  sleep = delay,
} = {}) {
  if (!url) throw new Error("IPO_REFRESH_URL is required");

  const refreshUrl = new URL(url);
  refreshUrl.searchParams.set("refresh", "1");
  const attempts = Math.min(3, Math.max(1, Math.floor(maxAttempts)));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(refreshUrl, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`IPO refresh failed: HTTP ${response.status}`);

      const payload = await response.json();
      if (payload?.stale === true) throw new Error("IPO refresh returned a stale snapshot");
      assertIpoEventSnapshot(payload);
      if (payload.records.length === 0) throw new Error("IPO refresh returned empty records");
      if (payload.dataDate !== taipeiDate(now)) throw new Error("IPO refresh dataDate is not Taipei today");
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(retryDelayMs);
    }
  }
  throw lastError;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const payload = await triggerIpoRefresh();
  console.log(`IPO refresh accepted: ${payload.dataDate}`);
}

function taipeiDate(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

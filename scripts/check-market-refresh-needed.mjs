import { pathToFileURL } from "node:url";

export function marketRefreshNeeded({ manifest, now = new Date() } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.valueOf())) {
    throw new TypeError("now must be a valid Date");
  }
  const taipeiDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  return !(
    manifest?.market?.status === "verified"
    && manifest.market.dataDate === taipeiDate
  );
}

export async function checkPublishedMarket({
  manifestUrl,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  if (!manifestUrl) return true;
  try {
    const response = await fetchImpl(manifestUrl, {
      headers: { Accept: "application/json" },
      redirect: "error",
    });
    if (!response.ok) return true;
    return marketRefreshNeeded({
      manifest: await response.json(),
      now,
    });
  } catch {
    return true;
  }
}

const entryUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (entryUrl === import.meta.url) {
  const needed = await checkPublishedMarket({
    manifestUrl: process.argv[2] || process.env.PUBLIC_MANIFEST_URL,
  });
  process.stdout.write(`needed=${needed}\n`);
}

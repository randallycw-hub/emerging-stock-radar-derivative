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
    const pointerResponse = await fetchImpl(manifestUrl, {
      headers: { Accept: "application/json" },
      redirect: "error",
    });
    if (!pointerResponse.ok) return true;
    const pointer = await pointerResponse.json();
    if (typeof pointer?.runtimeUrl !== "string") return true;
    const runtimeResponse = await fetchImpl(resolvePublishedUrl(manifestUrl, pointer.runtimeUrl), {
      headers: { Accept: "application/json" }, redirect: "error",
    });
    if (!runtimeResponse.ok) return true;
    const runtime = await runtimeResponse.json();
    if (typeof runtime?.manifestUrl !== "string") return true;
    const response = await fetchImpl(resolvePublishedUrl(manifestUrl, runtime.manifestUrl), {
      headers: { Accept: "application/json" }, redirect: "error",
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

function resolvePublishedUrl(currentUrl, publishedUrl) {
  const current = new URL(currentUrl);
  if (!publishedUrl.startsWith("./data/")) return new URL(publishedUrl, current).href;
  const marker = "/data/";
  const index = current.pathname.indexOf(marker);
  if (index < 0) throw new TypeError("current pointer must be under /data/");
  return new URL(publishedUrl.slice(2), `${current.origin}${current.pathname.slice(0, index + 1)}`).href;
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

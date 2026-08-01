import { cp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export async function stageStaticShowcase({
  source = "static-showcase",
  destination = "dist/client/market-site",
} = {}) {
  const pointer = await readJson(
    join(source, "data", "current.json"),
    "active generation pointer is missing or invalid",
  );
  if (!/^generations\/[a-f0-9]+$/i.test(pointer?.generation ?? "")) {
    throw new Error("active generation pointer is missing or invalid");
  }
  const expectedRuntimeUrl = `./data/${pointer.generation}/runtime.json`;
  if (pointer.runtimeUrl !== expectedRuntimeUrl) {
    throw new Error("active generation pointer is missing or invalid");
  }
  const runtime = await readJson(
    join(source, pointer.runtimeUrl.replace(/^\.\//, "")),
    "active generation runtime is missing or invalid",
  );
  if (
    runtime?.generation !== pointer.generation
    || runtime?.manifestUrl !== `./data/${pointer.generation}/manifest.json`
  ) {
    throw new Error("active generation runtime is missing or invalid");
  }
  const manifest = await readJson(
    join(source, runtime.manifestUrl.replace(/^\.\//, "")),
    "active generation manifest is missing or invalid",
  );
  if (manifest?.market?.status !== "verified" || !manifest?.market?.dataDate) {
    throw new Error("active generation manifest is missing or invalid");
  }
  const base = `./data/${pointer.generation}`;
  const requiredArtifacts = {
    emergingMarketUrl: `${base}/emerging-market.json`,
    "datasets.94025": `${base}/94025.json`,
    "datasets.11406": `${base}/11406.json`,
    "datasets.11586": `${base}/11586.json`,
    "datasets.bondMarket": `${base}/bond-market-view.json`,
    "datasets.conversionPrices": `${base}/conversion-prices.json`,
    "datasets.bondHistory": `${base}/bond-market-history.json`,
  };
  if (manifest.emergingMarketUrl !== requiredArtifacts.emergingMarketUrl) {
    throw new Error("active generation required dataset artifacts are missing or invalid");
  }
  for (const [key, expectedUrl] of Object.entries(requiredArtifacts)) {
    const actualUrl = key === "emergingMarketUrl"
      ? runtime.emergingMarketUrl
      : runtime.datasets?.[key.slice("datasets.".length)];
    if (actualUrl !== expectedUrl) {
      throw new Error("active generation required dataset artifacts are missing or invalid");
    }
    await readJson(
      join(source, expectedUrl.replace(/^\.\//, "")),
      "active generation required dataset artifacts are missing or invalid",
    );
  }
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true, force: true });
}

async function readJson(path, message) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error(message);
  }
}

const entryUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (entryUrl === import.meta.url) {
  await stageStaticShowcase({
    source: process.argv[2],
    destination: process.argv[3],
  });
}

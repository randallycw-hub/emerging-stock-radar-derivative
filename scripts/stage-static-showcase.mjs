import { createHash } from "node:crypto";
import { cp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { parseCbIssuerResearchSnapshot } from "../lib/market-data/cb-issuer-research.ts";
import { verifyIssuerResearchViewConsistency } from "./build-bond-market-snapshot.mjs";

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
  const declaresIssuerResearch = manifest.market.files?.some(
    (file) => file?.name === "cb-issuer-research.json",
  ) === true;
  if (declaresIssuerResearch) {
    requiredArtifacts["datasets.cbIssuerResearch"] =
      `${base}/cb-issuer-research.json`;
  }
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
  if (declaresIssuerResearch) {
    await verifyDeclaredIssuerResearch({ source, manifest, runtime, base });
  }
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true, force: true });
}

async function verifyDeclaredIssuerResearch({ source, manifest, runtime, base }) {
  const issuerEntries = manifest.market.files.filter(
    (file) => file?.name === "cb-issuer-research.json",
  );
  const viewEntries = manifest.market.files.filter(
    (file) => file?.name === "bond-market-view.json",
  );
  if (issuerEntries.length !== 1 || viewEntries.length !== 1) {
    throw new Error("active generation issuer research manifest is invalid");
  }
  const issuerEntry = validateFileEntry(issuerEntries[0], "cb-issuer-research.json");
  const viewEntry = validateFileEntry(viewEntries[0], "bond-market-view.json");
  const researchText = await readFile(
    join(source, `${base}/cb-issuer-research.json`.replace(/^\.\//, "")),
    "utf8",
  );
  const viewsText = await readFile(
    join(source, `${base}/bond-market-view.json`.replace(/^\.\//, "")),
    "utf8",
  );
  if (
    sha256Text(researchText) !== issuerEntry.sha256
    || sha256Text(viewsText) !== viewEntry.sha256
  ) {
    throw new Error("active generation issuer research hash is invalid");
  }
  const snapshot = parseCbIssuerResearchSnapshot(JSON.parse(researchText));
  const views = JSON.parse(viewsText);
  if (
    snapshot.records.length !== issuerEntry.recordCount
    || !Array.isArray(views)
    || views.length !== viewEntry.recordCount
    || runtime.datasets?.cbIssuerResearch !== `${base}/cb-issuer-research.json`
  ) {
    throw new Error("active generation issuer research artifact is invalid");
  }
  verifyIssuerResearchViewConsistency(snapshot, views);
}

function validateFileEntry(entry, expectedName) {
  if (
    entry?.name !== expectedName
    || !/^sha256:[0-9a-f]{64}$/.test(entry.sha256 ?? "")
    || !Number.isInteger(entry.recordCount)
    || entry.recordCount < 0
  ) {
    throw new Error("active generation issuer research manifest is invalid");
  }
  return entry;
}

function sha256Text(text) {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
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

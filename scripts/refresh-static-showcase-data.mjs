import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { parseCsv } from "../lib/source-verification/csv.ts";
import {
  bondInputsFrom11406Rows,
  buildBondMarketSnapshot,
} from "./build-bond-market-snapshot.mjs";
import { fetchCurrentOfficialMarketData } from "./lib/official-market-fetch.mjs";

export const OFFICIAL_SHOWCASE_SOURCES = {
  "94025": "https://mopsfin.twse.com.tw/opendata/t187ap05_R.csv",
  "11406": "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv",
  "11586":
    "https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data",
};

const DATA_DIRECTORY = "static-showcase/data";
const RUNTIME_PATH = `${DATA_DIRECTORY}/runtime.js`;
const INDEX_PATH = "static-showcase/index.html";

export function buildEmbeddedRuntime(existingRuntime, manifest, datasets) {
  const presentationStart = existingRuntime.indexOf("const val = ");
  if (presentationStart < 0) {
    throw new Error("runtime presentation marker not found");
  }
  const prefix = [
    `const manifest = ${JSON.stringify(manifest)};`,
    `const embeddedData = ${JSON.stringify(datasets)};`,
    'const revenue = embeddedData["94025"];',
    'const bonds = embeddedData["11406"];',
    'const ipo = embeddedData["11586"];',
    "",
  ].join("\n");
  return prefix + existingRuntime.slice(presentationStart);
}

export async function refreshStaticShowcase({
  fetchImpl = fetch,
  now = new Date(),
  marketBuilder = buildBondMarketSnapshot,
} = {}) {
  const datasets = {};
  const manifestDatasets = [];

  for (const [datasetId, sourceUrl] of Object.entries(
    OFFICIAL_SHOWCASE_SOURCES,
  )) {
    const response = await fetchImpl(sourceUrl, {
      headers: { Accept: "text/csv, application/octet-stream" },
      redirect: "error",
    });
    if (!response.ok) {
      throw new Error(`${datasetId}: HTTP_${response.status}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 8_000_000) {
      throw new Error(`${datasetId}: invalid response size`);
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const rows = parseCsv(text);
    datasets[datasetId] = rows;

    manifestDatasets.push({
      datasetId,
      sourceUrl,
      downloadedAt: taipeiDate(now),
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      rawBytes: bytes.byteLength,
      rowCount: rows.length,
    });
  }

  const baseManifest = {
    kind: "official-source-snapshot",
    status: "official-static-snapshot",
    generatedAt: taipeiDate(now),
    datasets: manifestDatasets,
  };

  const marketResult = await marketBuilder({
    outputDir: DATA_DIRECTORY,
    bonds: bondInputsFrom11406Rows(datasets["11406"]),
    collectImpl: (options) => fetchCurrentOfficialMarketData({
      ...options,
      fetchImpl,
    }),
    now: () => now,
    manifestBase: baseManifest,
  });
  const manifest = marketResult.manifest;

  for (const [datasetId, rows] of Object.entries(datasets)) {
    await writeFile(
      `${DATA_DIRECTORY}/${datasetId}.json`,
      JSON.stringify(rows),
      "utf8",
    );
  }
  const currentRuntime = await readFile(RUNTIME_PATH, "utf8");
  const nextRuntime = buildEmbeddedRuntime(currentRuntime, manifest, datasets);
  await writeFile(RUNTIME_PATH, nextRuntime, "utf8");

  const cacheKey = createHash("sha256")
    .update(JSON.stringify(manifestDatasets))
    .digest("hex")
    .slice(0, 12);
  const currentIndex = await readFile(INDEX_PATH, "utf8");
  const nextIndex = currentIndex.replace(
    /runtime\.js\?v=[^"]+/,
    `runtime.js?v=${cacheKey}`,
  );
  if (nextIndex === currentIndex) {
    throw new Error("runtime cache key marker not found");
  }
  await writeFile(INDEX_PATH, nextIndex, "utf8");

  return {
    manifest,
    rowCounts: Object.fromEntries(
      Object.entries(datasets).map(([datasetId, rows]) => [
        datasetId,
        rows.length,
      ]),
    ),
    market: marketResult.report,
  };
}

function taipeiDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const entryUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (entryUrl === import.meta.url) {
  const result = await refreshStaticShowcase();
  console.log(JSON.stringify(result, null, 2));
}

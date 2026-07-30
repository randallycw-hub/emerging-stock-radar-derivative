import { createHash } from "node:crypto";
import {
  access,
  appendFile,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { isIsoDate } from "../lib/domain/dates.ts";
import { EmergingMarketViewSchema } from "../lib/domain/schema.ts";
import { buildEmergingMarketViews } from "../lib/market-data/emerging-market-view.ts";
import { parseCsv } from "../lib/source-verification/csv.ts";
import { parseEmergingMarketSource } from "../lib/source-verification/source-emerging-market.ts";
import { normalize94025Row, parse94025Csv } from "../lib/source-verification/source-94025.ts";
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
  emergingMarket:
    "https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics",
};

const DATA_DIRECTORY = "static-showcase/data";
const RUNTIME_PATH = `${DATA_DIRECTORY}/runtime.js`;
const INDEX_PATH = "static-showcase/index.html";

export function buildRuntimeBootstrap() {
  return [
    "window.__OFFICIAL_SHOWCASE__ = ",
    JSON.stringify({
      manifestUrl: "./data/manifest.json",
      emergingMarketUrl: "./data/emerging-market.json",
      datasets: {
        "94025": "./data/94025.json",
        "11406": "./data/11406.json",
        "11586": "./data/11586.json",
        bondMarket: "./data/bond-market-view.json",
        conversionPrices: "./data/conversion-prices.json",
        bondHistory: "./data/bond-market-history.json",
      },
    }),
    ";\n",
  ].join("");
}

export function updateRuntimeCacheKey(html, cacheKey) {
  const marker = /runtime\.js\?v=[^"]+/;
  if (!marker.test(html)) {
    throw new Error("runtime cache key marker not found");
  }
  return html.replace(marker, `runtime.js?v=${cacheKey}`);
}

export async function fetchOfficialCsvWithRetry(
  url,
  fetchImpl = fetch,
  {
    maxAttempts = 3,
    sleep = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: "text/csv, application/json, application/octet-stream" },
        redirect: "error",
      });
      if (!response.ok) {
        const retryable = [408, 425, 429].includes(response.status)
          || response.status >= 500 && response.status <= 599;
        if (!retryable || attempt === maxAttempts) {
          return {
            ok: false,
            status: response.status,
            bytes: new Uint8Array(),
          };
        }
        lastError = new Error(`HTTP_${response.status}`);
      } else {
        return {
          ok: true,
          status: response.status,
          bytes: new Uint8Array(await response.arrayBuffer()),
        };
      }
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) throw error;
    }
    await sleep(250 * 2 ** (attempt - 1));
  }
  throw lastError ?? new Error("official CSV request failed");
}

export async function openMarketCheckpoint({
  date,
  directory = ".cache/official-market",
} = {}) {
  if (!isIsoDate(date)) throw new TypeError("checkpoint date must be ISO");
  await mkdir(directory, { recursive: true });
  const path = `${directory}/${date}.jsonl`;
  const checkpoint = {
    schemaVersion: 1,
    date,
    cbQuotesByBondCode: {},
    conversionPricesByBondCode: {},
  };
  const lines = await readFile(path, "utf8")
    .then((text) => text.split("\n").filter(Boolean))
    .catch(() => []);
  const records = lines.flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
  const validHeader = (
    records[0]?.schemaVersion === 1
    && records[0]?.date === date
  );
  if (!validHeader) {
    await writeFile(
      path,
      `${JSON.stringify({ schemaVersion: 1, date })}\n`,
      "utf8",
    );
  } else {
    for (const record of records.slice(1)) {
      if (
        ["cbQuotesByBondCode", "conversionPricesByBondCode"]
          .includes(record?.kind)
        && /^\d{5,6}$/.test(record?.key)
      ) {
        checkpoint[record.kind][record.key] = record.value;
      }
    }
  }

  return {
    path,
    checkpoint,
    onCheckpoint: async ({ kind, key, value }) => {
      if (
        !["cbQuotesByBondCode", "conversionPricesByBondCode"].includes(kind)
        || !/^\d{5,6}$/.test(key)
      ) {
        throw new TypeError("invalid market checkpoint entry");
      }
      checkpoint[kind][key] = value;
      await appendFile(
        path,
        `${JSON.stringify({ kind, key, value })}\n`,
        "utf8",
      );
    },
  };
}

export async function refreshStaticShowcase({
  fetchImpl = fetch,
  now = new Date(),
  marketBuilder = buildBondMarketSnapshot,
} = {}) {
  const datasets = {};
  const datasetTexts = {};
  const manifestDatasets = [];

  for (const [datasetId, sourceUrl] of Object.entries(OFFICIAL_SHOWCASE_SOURCES)) {
    if (datasetId === "emergingMarket") continue;
    const response = await fetchOfficialCsvWithRetry(sourceUrl, fetchImpl);
    if (!response.ok) {
      throw new Error(`${datasetId}: HTTP_${response.status}`);
    }

    const bytes = response.bytes;
    if (bytes.byteLength === 0 || bytes.byteLength > 8_000_000) {
      throw new Error(`${datasetId}: invalid response size`);
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const rows = parseCsv(text);
    datasets[datasetId] = rows;
    datasetTexts[datasetId] = text;

    manifestDatasets.push({
      datasetId,
      sourceUrl,
      downloadedAt: taipeiDate(now),
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      rawBytes: bytes.byteLength,
      rowCount: rows.length,
    });
  }

  const emergingResponse = await fetchOfficialCsvWithRetry(
    OFFICIAL_SHOWCASE_SOURCES.emergingMarket,
    fetchImpl,
  );
  if (!emergingResponse.ok) {
    throw new Error(`emergingMarket: HTTP_${emergingResponse.status}`);
  }
  if (
    emergingResponse.bytes.byteLength === 0
    || emergingResponse.bytes.byteLength > 8_000_000
  ) {
    throw new Error("emergingMarket: invalid response size");
  }
  const emergingText = new TextDecoder("utf-8", { fatal: true }).decode(
    emergingResponse.bytes,
  );
  const marketRows = parseEmergingMarketSource(JSON.parse(emergingText));
  const companyRows = newest94025CompanyRows(datasetTexts["94025"]);
  const emergingSnapshot = buildEmergingMarketSnapshot({ marketRows, companyRows });

  const baseManifest = {
    kind: "official-source-snapshot",
    status: "official-static-snapshot",
    generatedAt: taipeiDate(now),
    datasets: manifestDatasets,
    emergingMarketUrl: "./data/emerging-market.json",
  };

  const stagingRoot = await mkdtemp(join(dirname(DATA_DIRECTORY), ".showcase-"));
  const stagingDataDirectory = join(stagingRoot, "data");
  const stagingIndexPath = join(stagingRoot, "index.html");
  try {
    await copyDirectoryIfExists(DATA_DIRECTORY, stagingDataDirectory);
    await mkdir(stagingDataDirectory, { recursive: true });
    const currentIndex = await readFile(INDEX_PATH, "utf8");
    await writeFile(stagingIndexPath, currentIndex, "utf8");

    for (const [datasetId, rows] of Object.entries(datasets)) {
      await writeFile(
        join(stagingDataDirectory, `${datasetId}.json`),
        `${JSON.stringify(rows)}\n`,
        "utf8",
      );
    }
    await writeFile(
      join(stagingDataDirectory, "emerging-market.json"),
      `${JSON.stringify(emergingSnapshot, null, 2)}\n`,
      "utf8",
    );

    const marketResult = await marketBuilder({
      outputDir: stagingDataDirectory,
      bonds: bondInputsFrom11406Rows(datasets["11406"]),
      collectImpl: async (options) => {
        const store = await openMarketCheckpoint({ date: options.date });
        return fetchCurrentOfficialMarketData({
          ...options,
          fetchImpl,
          checkpoint: store.checkpoint,
          onCheckpoint: store.onCheckpoint,
        });
      },
      now: () => now,
      manifestBase: baseManifest,
    });
    const manifest = marketResult.manifest;
    await writeFile(
      join(stagingDataDirectory, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(stagingDataDirectory, "runtime.js"),
      buildRuntimeBootstrap(manifest),
      "utf8",
    );

    const cacheKey = createHash("sha256")
      .update(JSON.stringify(manifest))
      .digest("hex")
      .slice(0, 12);
    await writeFile(
      stagingIndexPath,
      updateRuntimeCacheKey(currentIndex, cacheKey),
      "utf8",
    );
    await verifyStagedEmergingSnapshot(stagingDataDirectory);

    const publishedNames = [
      ...Object.keys(datasets).map((datasetId) => `${datasetId}.json`),
      "emerging-market.json",
      "manifest.json",
      "runtime.js",
      ...(marketResult.files ?? []),
    ];
    await publishAtomically([
      ...[...new Set(publishedNames)].map((name) => ({
        source: join(stagingDataDirectory, name),
        target: join(DATA_DIRECTORY, name),
      })),
      { source: stagingIndexPath, target: INDEX_PATH },
    ]);

    return {
      manifest,
      rowCounts: {
        ...Object.fromEntries(
          Object.entries(datasets).map(([datasetId, rows]) => [datasetId, rows.length]),
        ),
        emergingMarket: emergingSnapshot.records.length,
      },
      market: marketResult.report,
    };
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

function newest94025CompanyRows(text) {
  const latestByCompanyCode = new Map();
  for (const sourceRow of parse94025Csv(text)) {
    const row = normalize94025Row(sourceRow);
    const current = latestByCompanyCode.get(row.companyCode);
    if (
      current === undefined
      || `${row.sourcePublishedOn}\u001f${row.yearMonth}`
        > `${current.sourcePublishedOn}\u001f${current.yearMonth}`
    ) {
      latestByCompanyCode.set(row.companyCode, row);
    }
  }
  return [...latestByCompanyCode.values()];
}

function buildEmergingMarketSnapshot({ marketRows, companyRows }) {
  if (!Array.isArray(marketRows) || marketRows.length === 0) {
    throw new TypeError("emerging market payload must contain at least one row");
  }
  const records = buildEmergingMarketViews({ marketRows, companyRows })
    .map((record) => EmergingMarketViewSchema.parse(record));
  const tradingDate = marketRows[0].tradingDate;
  if (!records.every((record) => record.tradingDate === tradingDate)) {
    throw new TypeError("emerging market records must use one trading date");
  }
  if (new Set(records.map((record) => record.companyCode)).size !== records.length) {
    throw new TypeError("emerging market records must have unique company codes");
  }
  const publishedTime = marketRows.map((row) => row.publishedTime).sort().at(-1);
  return {
    schemaVersion: 1,
    tradingDate,
    publishedAt: `${tradingDate}T${publishedTime}+08:00`,
    sourceId: "tpex_esb_latest_statistics",
    records,
  };
}

async function verifyStagedEmergingSnapshot(stagingDataDirectory) {
  const snapshot = JSON.parse(await readFile(
    join(stagingDataDirectory, "emerging-market.json"),
    "utf8",
  ));
  if (
    snapshot?.schemaVersion !== 1
    || snapshot?.sourceId !== "tpex_esb_latest_statistics"
    || !isIsoDate(snapshot?.tradingDate)
    || !Array.isArray(snapshot?.records)
    || snapshot.records.length === 0
  ) {
    throw new Error("VALIDATION_FAILED:EMERGING_MARKET_SNAPSHOT");
  }
  const records = snapshot.records.map((record) => EmergingMarketViewSchema.parse(record));
  if (
    records.some((record) => record.tradingDate !== snapshot.tradingDate)
    || new Set(records.map((record) => record.companyCode)).size !== records.length
  ) {
    throw new Error("VALIDATION_FAILED:EMERGING_MARKET_INTEGRITY");
  }
  const manifest = JSON.parse(await readFile(join(stagingDataDirectory, "manifest.json"), "utf8"));
  if (manifest.emergingMarketUrl !== "./data/emerging-market.json") {
    throw new Error("VALIDATION_FAILED:EMERGING_MARKET_MANIFEST");
  }
  const runtime = await readFile(join(stagingDataDirectory, "runtime.js"), "utf8");
  if (!runtime.includes('"emergingMarketUrl":"./data/emerging-market.json"')) {
    throw new Error("VALIDATION_FAILED:EMERGING_MARKET_RUNTIME");
  }
}

async function copyDirectoryIfExists(source, target) {
  if (await pathExists(source)) {
    await cp(source, target, { recursive: true });
  }
}

async function publishAtomically(entries) {
  const existing = [];
  const backupDirectory = await mkdtemp(join(dirname(entries[0].target), ".showcase-backup-"));
  try {
    for (const [index, entry] of entries.entries()) {
      if (await pathExists(entry.target)) {
        const backup = join(backupDirectory, String(index));
        await copyFile(entry.target, backup);
        existing.push([entry.target, backup]);
      }
    }
    for (const entry of entries) {
      await rename(entry.source, entry.target);
    }
  } catch (error) {
    for (const entry of entries) {
      const backup = existing.find(([target]) => target === entry.target)?.[1];
      if (backup !== undefined) {
        await copyFile(backup, entry.target);
      } else {
        await rm(entry.target, { force: true });
      }
    }
    throw error;
  } finally {
    await rm(backupDirectory, { recursive: true, force: true });
  }
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
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

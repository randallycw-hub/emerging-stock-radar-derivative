import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { isIsoDate } from "../lib/domain/dates.ts";
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

export function buildRuntimeBootstrap() {
  return [
    "window.__OFFICIAL_SHOWCASE__ = ",
    JSON.stringify({
      manifestUrl: "./data/manifest.json",
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
        headers: { Accept: "text/csv, application/octet-stream" },
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
  const manifestDatasets = [];

  for (const [datasetId, sourceUrl] of Object.entries(
    OFFICIAL_SHOWCASE_SOURCES,
  )) {
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

  for (const [datasetId, rows] of Object.entries(datasets)) {
    await writeFile(
      `${DATA_DIRECTORY}/${datasetId}.json`,
      JSON.stringify(rows),
      "utf8",
    );
  }
  await writeFile(RUNTIME_PATH, buildRuntimeBootstrap(manifest), "utf8");

  const cacheKey = createHash("sha256")
    .update(JSON.stringify(manifestDatasets))
    .digest("hex")
    .slice(0, 12);
  const currentIndex = await readFile(INDEX_PATH, "utf8");
  const nextIndex = updateRuntimeCacheKey(currentIndex, cacheKey);
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

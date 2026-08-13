import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { isIsoDate } from "../lib/domain/dates.ts";
import {
  buildHistoryPoints,
  mergeBondMarketHistory,
  parseBondMarketHistory,
} from "../lib/market-data/bond-market-history.ts";
import { bondInputsFrom11406Rows } from "./build-bond-market-snapshot.mjs";
import {
  fetchCbMonthlyHistory,
  fetchTpexMonthlyStockHistory,
  fetchTwseMonthlyStockHistory,
} from "./lib/official-market-fetch.mjs";
import { mapLimit } from "./lib/map-limit.mjs";

export async function backfillBondMarketHistory({
  dataDirectory = "static-showcase/data",
  fetchImpl = fetch,
  asOfDate = taipeiDate(new Date()),
} = {}) {
  if (!isIsoDate(asOfDate)) throw new TypeError("asOfDate must be an ISO date");
  const [rawBonds, conversionPrices, currentStockCloses, previousHistory] = await Promise.all([
    readJson(join(dataDirectory, "11406.json")),
    readJson(join(dataDirectory, "conversion-prices.json")),
    readJson(join(dataDirectory, "stock-closes.json")),
    readOptionalJson(join(dataDirectory, "bond-market-history.json")),
  ]);
  const verifiedPreviousHistory = parseBondMarketHistory(previousHistory ?? []);
  const bonds = bondInputsFrom11406Rows(rawBonds);
  const months = latestTwelveMonths(asOfDate);
  const issuerMarkets = selectIssuerMarkets(currentStockCloses);

  const cbTasks = bonds.flatMap((bond) =>
    months.map((month) => ({ bondCode: bond.bondCode, month }))
  );
  const cbGroups = await mapLimit(cbTasks, 2, (task) =>
    fetchCbMonthlyHistory({ ...task, fetchImpl })
  );

  const stockTasks = [...issuerMarkets].flatMap(([issuerCode, market]) =>
    months.map((month) => ({ issuerCode, market, month }))
  );
  const stockGroups = await mapLimit(stockTasks, 2, (task) =>
    task.market === "listed"
      ? fetchTwseMonthlyStockHistory({
        issuerCode: task.issuerCode,
        month: task.month,
        fetchImpl,
      })
      : fetchTpexMonthlyStockHistory({
        issuerCode: task.issuerCode,
        month: task.month,
        fetchImpl,
      })
  );

  const points = mergeBondMarketHistory(verifiedPreviousHistory, buildHistoryPoints({
    cbQuotes: cbGroups.flat(),
    stockCloses: stockGroups.flat(),
    conversionPrices,
  }));
  const outputPath = join(dataDirectory, "bond-market-history.json");
  const stagingDirectory = await mkdtemp(
    join(dirname(outputPath), ".cb-history-"),
  );
  try {
    const candidatePath = join(stagingDirectory, "bond-market-history.json");
    const expectedText = `${JSON.stringify(points, null, 2)}\n`;
    await writeFile(candidatePath, expectedText, "utf8");
    const candidateText = await readFile(candidatePath, "utf8");
    const candidate = parseBondMarketHistory(JSON.parse(candidateText));
    if (candidate.length !== points.length) {
      throw new Error("VALIDATION_FAILED:HISTORY_COUNT_MISMATCH");
    }
    if (sha256(candidateText) !== sha256(expectedText)) {
      throw new Error("VALIDATION_FAILED:HISTORY_HASH_MISMATCH");
    }
    await rename(candidatePath, outputPath);
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }

  return {
    status: "published",
    asOfDate,
    months,
    concurrency: 2,
    counts: {
      bonds: bonds.length,
      issuers: issuerMarkets.size,
      cbRequests: cbTasks.length,
      stockRequests: stockTasks.length,
      points: points.length,
    },
    missingIssuerMarkets: [
      ...new Set(
        bonds
          .map((bond) => bond.issuerCode)
          .filter((issuerCode) => !issuerMarkets.has(issuerCode)),
      ),
    ],
  };
}

export function latestTwelveMonths(asOfDate) {
  if (!isIsoDate(asOfDate)) throw new TypeError("asOfDate must be an ISO date");
  const [year, month] = asOfDate.split("-").map(Number);
  const values = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - offset, 1));
    values.push(
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
    );
  }
  return values;
}

export function selectIssuerMarkets(stockCloses) {
  if (!Array.isArray(stockCloses)) {
    throw new TypeError("stockCloses must be an array");
  }
  const result = new Map();
  for (const value of stockCloses) {
    if (
      value === null
      || typeof value !== "object"
      || typeof value.companyCode !== "string"
      || (value.market !== "listed" && value.market !== "otc")
    ) {
      throw new TypeError("invalid current stock close market record");
    }
    const existing = result.get(value.companyCode);
    if (existing !== undefined && existing !== value.market) {
      throw new TypeError(`ambiguous issuer market: ${value.companyCode}`);
    }
    result.set(value.companyCode, value.market);
  }
  return result;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readOptionalJson(path) {
  try {
    return await readJson(path);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function sha256(text) {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
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
  console.log(JSON.stringify(await backfillBondMarketHistory(), null, 2));
}

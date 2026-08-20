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
import { types } from "node:util";

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

const CORRECTION_KEYS = [
  "bondCode",
  "date",
  "sourceId",
  "retrievedAt",
  "sha256",
  "beforeHash",
  "afterHash",
];
const OFFICIAL_CORRECTION_SOURCES = new Set([
  "tpex-cb-day-query",
  "twse-stock-day-all",
  "tpex-mainboard-daily-close",
  "tpex-conversion-index",
  "mops-conversion-detail",
]);

export async function backfillBondMarketHistory(options = {}) {
  assertExactOptions(options, [
    "dataDirectory",
    "fetchImpl",
    "asOfDate",
    "correction",
  ], "backfillBondMarketHistory");
  const {
    dataDirectory = "static-showcase/data",
    fetchImpl = fetch,
    asOfDate = taipeiDate(new Date()),
    correction,
  } = options;
  if (!isIsoDate(asOfDate)) throw new TypeError("asOfDate must be an ISO date");
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  if (correction !== undefined) validateCorrectionManifest(correction);
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

  const currentPoints = buildHistoryPoints({
    cbQuotes: cbGroups.flat(),
    stockCloses: stockGroups.flat(),
    conversionPrices,
  });
  const corrected = correction === undefined
    ? undefined
    : applyBondMarketHistoryCorrection({
      previous: verifiedPreviousHistory,
      candidate: overlayHistory(verifiedPreviousHistory, currentPoints),
      correction,
    });
  const points = corrected?.history
    ?? mergeBondMarketHistory(verifiedPreviousHistory, currentPoints);
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
    ...(corrected === undefined ? {} : { correctionTrace: corrected.trace }),
  };
}

export function applyBondMarketHistoryCorrection(options = {}) {
  assertExactOptions(
    options,
    ["previous", "candidate", "correction"],
    "applyBondMarketHistoryCorrection",
  );
  const { previous, candidate, correction } = options;
  const evidence = validateCorrectionManifest(correction);
  const previousHistory = parseBondMarketHistory(previous);
  const candidateHistory = parseBondMarketHistory(candidate);
  const identity = `${evidence.bondCode}\u001f${evidence.date}`;
  const beforeByIdentity = historyByIdentity(previousHistory);
  const afterByIdentity = historyByIdentity(candidateHistory);
  const before = beforeByIdentity.get(identity);
  const after = afterByIdentity.get(identity);
  if (
    before === undefined
    || after === undefined
    || pointSha256(before) !== evidence.beforeHash
    || pointSha256(after) !== evidence.afterHash
    || evidence.beforeHash === evidence.afterHash
  ) {
    throw new TypeError("correction evidence does not match the targeted history point");
  }
  for (const [key, point] of beforeByIdentity) {
    const replacement = afterByIdentity.get(key);
    if (replacement === undefined) {
      throw new TypeError("correction evidence cannot remove history points");
    }
    if (key !== identity && JSON.stringify(replacement) !== JSON.stringify(point)) {
      throw new TypeError("correction evidence may change only the targeted history point");
    }
  }
  return Object.freeze({
    history: candidateHistory,
    trace: Object.freeze({
      correction: Object.freeze({ ...evidence }),
      previousGeneration: historySha256(previousHistory),
      nextGeneration: historySha256(candidateHistory),
    }),
  });
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

function validateCorrectionManifest(value) {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || types.isProxy(value)
    || (
      Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null
    )
  ) {
    throw new TypeError("data-only correction evidence must be a plain manifest");
  }
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== CORRECTION_KEYS.length
    || keys.some((key) => (
      typeof key !== "string"
      || !CORRECTION_KEYS.includes(key)
      || !Object.prototype.propertyIsEnumerable.call(value, key)
    ))
  ) {
    throw new TypeError("correction evidence keys must match the exact contract");
  }
  const descriptors = Object.fromEntries(keys.map((key) => [
    key,
    Object.getOwnPropertyDescriptor(value, key),
  ]));
  if (Object.values(descriptors).some((descriptor) => (
    descriptor === undefined
    || !("value" in descriptor)
    || !descriptor.enumerable
  ))) {
    throw new TypeError("data-only correction evidence must use plain properties");
  }
  const manifest = Object.fromEntries(
    CORRECTION_KEYS.map((key) => [key, descriptors[key].value]),
  );
  if (!/^\d{5,6}$/.test(manifest.bondCode) || !isIsoDate(manifest.date)) {
    throw new TypeError("correction evidence target is invalid");
  }
  if (!OFFICIAL_CORRECTION_SOURCES.has(manifest.sourceId)) {
    throw new TypeError("correction evidence sourceId is not approved");
  }
  if (
    typeof manifest.retrievedAt !== "string"
    || !Number.isFinite(Date.parse(manifest.retrievedAt))
    || new Date(manifest.retrievedAt).toISOString() !== manifest.retrievedAt
  ) {
    throw new TypeError("correction evidence retrievedAt is invalid");
  }
  for (const key of ["sha256", "beforeHash", "afterHash"]) {
    if (!/^sha256:[0-9a-f]{64}$/.test(manifest[key])) {
      throw new TypeError(`correction evidence ${key} is invalid`);
    }
  }
  const evidenceHash = sha256(JSON.stringify([
    manifest.bondCode,
    manifest.date,
    manifest.sourceId,
    manifest.retrievedAt,
    manifest.beforeHash,
    manifest.afterHash,
  ]));
  if (manifest.sha256 !== evidenceHash) {
    throw new TypeError("correction evidence sha256 does not match its manifest");
  }
  return Object.freeze(manifest);
}

function historyByIdentity(history) {
  return new Map(history.map((point) => [
    `${point.bondCode}\u001f${point.date}`,
    point,
  ]));
}

function overlayHistory(previous, current) {
  const points = historyByIdentity(parseBondMarketHistory(previous));
  for (const point of parseBondMarketHistory(current)) {
    points.set(`${point.bondCode}\u001f${point.date}`, point);
  }
  return parseBondMarketHistory([...points.values()].sort(
    (left, right) => left.date.localeCompare(right.date)
      || left.bondCode.localeCompare(right.bondCode),
  ));
}

function pointSha256(point) {
  return sha256(JSON.stringify(point));
}

function historySha256(history) {
  return sha256(JSON.stringify(history));
}

function assertExactOptions(value, allowed, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} options must be an object`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (
      typeof key !== "string"
      || !allowed.includes(key)
      || !Object.prototype.propertyIsEnumerable.call(value, key)
    ) {
      throw new TypeError(`${String(key)} is not supported by ${name}`);
    }
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

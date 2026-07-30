import { createHash } from "node:crypto";
import {
  access,
  copyFile,
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
import { buildHistoryPoints } from "../lib/market-data/bond-market-history.ts";
import { buildBondMarketViews } from "../lib/market-data/bond-market-view.ts";
import { multiplyDecimal } from "../lib/market-data/decimal.ts";
import { fetchCurrentOfficialMarketData } from "./lib/official-market-fetch.mjs";

const MARKET_FILE_ENTRIES = [
  ["cb-quotes.json", "cbQuotes"],
  ["stock-closes.json", "stockCloses"],
  ["conversion-prices.json", "conversionPrices"],
  ["bond-market-view.json", "views"],
  ["bond-market-history.json", "history"],
];

export async function buildBondMarketSnapshot({
  outputDir = "static-showcase/data",
  bonds,
  collectImpl = fetchCurrentOfficialMarketData,
  now = () => new Date(),
  manifestBase,
} = {}) {
  const generatedDate = now();
  if (!(generatedDate instanceof Date) || !Number.isFinite(generatedDate.valueOf())) {
    throw new TypeError("now must return a valid Date");
  }
  const asOfDate = taipeiDate(generatedDate);
  const bondInputs = bonds ?? await loadBondInputs(outputDir);
  if (!Array.isArray(bondInputs)) throw new TypeError("bonds must be an array");
  const bondCodes = bondInputs.map((bond) => bond.bondCode);
  const issuerCodes = [...new Set(bondInputs.map((bond) => bond.issuerCode))];
  const collected = await collectImpl({
    bondCodes,
    issuerCodes,
    date: asOfDate,
  });
  const views = buildBondMarketViews({
    asOfDate,
    bonds: bondInputs,
    cbQuotes: collected.cbQuotes,
    stockCloses: collected.stockCloses,
    conversionPrices: collected.conversionPrices,
  });

  const errors = validateCandidate({
    bondInputs,
    collected,
    views,
  });
  if (errors.length > 0) {
    throw new Error(`VALIDATION_FAILED:${errors.join(",")}`);
  }

  await mkdir(outputDir, { recursive: true });
  const previousHistory =
    await readOptionalJson(join(outputDir, "bond-market-history.json")) ?? [];
  if (!Array.isArray(previousHistory)) {
    throw new TypeError("bond market history must be an array");
  }
  const currentHistory = buildHistoryPoints({
    cbQuotes: collected.cbQuotes,
    stockCloses: collected.stockCloses,
    conversionPrices: collected.conversionPrices,
  });
  const history = mergeHistory(previousHistory, currentHistory);
  const stagingDir = await mkdtemp(join(dirname(outputDir), ".cb-market-"));
  try {
    const documents = {
      cbQuotes: collected.cbQuotes,
      stockCloses: collected.stockCloses,
      conversionPrices: collected.conversionPrices,
      views,
      history,
    };
    const files = [];
    for (const [name, key] of MARKET_FILE_ENTRIES) {
      const text = `${JSON.stringify(documents[key], null, 2)}\n`;
      await writeFile(join(stagingDir, name), text, "utf8");
      files.push({
        name,
        sha256: sha256(text),
        recordCount: documents[key].length,
      });
    }

    const currentManifest = manifestBase
      ?? await readOptionalJson(join(outputDir, "manifest.json"))
      ?? {
        kind: "official-source-snapshot",
        generatedAt: asOfDate,
        datasets: [],
      };
    const latestCbPriceDate = latestTradingDate(collected.cbQuotes);
    const latestStockPriceDate = latestTradingDate(collected.stockCloses);
    const dataDate = [latestCbPriceDate, latestStockPriceDate]
      .filter(Boolean)
      .sort()[0] ?? null;
    const manifest = {
      ...currentManifest,
      market: {
        status: "verified",
        generatedAt: generatedDate.toISOString(),
        requestedDate: collected.requestedDate ?? asOfDate,
        latestCbPriceDate,
        latestStockPriceDate,
        dataDate,
        files,
      },
    };
    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
    await writeFile(join(stagingDir, "manifest.json"), manifestText, "utf8");
    await verifyStagedFiles(stagingDir, files, manifestText);
    await publishAtomically(
      stagingDir,
      outputDir,
      [...files.map((file) => file.name), "manifest.json"],
    );

    return {
      status: "published",
      files: files.map((file) => file.name),
      manifest,
      views,
      report: {
        generatedAt: generatedDate.toISOString(),
        requestedDate: collected.requestedDate ?? asOfDate,
        dataDate,
        validation: "passed",
        concurrency: 2,
        counts: {
          bonds: bondInputs.length,
          cbQuotes: collected.cbQuotes.length,
          stockCloses: collected.stockCloses.length,
          conversionPrices: collected.conversionPrices.length,
          views: views.length,
          missingViews: views.filter((view) => view.missingReasons.length > 0).length,
        },
        sourceUrls: collected.sourceUrls ?? [],
      },
    };
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}

function mergeHistory(previous, current) {
  const points = new Map();
  for (const point of [...previous, ...current]) {
    if (
      point === null
      || typeof point !== "object"
      || !/^\d{5,6}$/.test(point.bondCode)
      || !isIsoDate(point.date)
    ) {
      throw new TypeError("invalid bond market history point");
    }
    points.set(`${point.bondCode}\u001f${point.date}`, point);
  }
  return [...points.values()].sort(
    (left, right) =>
      left.date.localeCompare(right.date)
      || left.bondCode.localeCompare(right.bondCode),
  );
}

function latestTradingDate(records) {
  return records
    .map((record) => record.tradingDate)
    .filter(isIsoDate)
    .sort()
    .at(-1) ?? null;
}

export function bondInputsFrom11406Rows(rows) {
  if (!Array.isArray(rows)) throw new TypeError("11406 rows must be an array");
  return rows.flatMap((row, index) => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      throw new TypeError(`11406 row ${index + 1} must be an object`);
    }
    const bondCode = sourceText(row, "債券代碼");
    if (bondCode === "") {
      if (isExplicitPrivateUnlistedBond(row)) return [];
      throw new TypeError(`11406 row ${index + 1} has missing bond code`);
    }
    if (!/^\d{5,6}$/.test(bondCode)) {
      if (isExplicitPrivateUnlistedBond(row)) return [];
      throw new TypeError(`11406 row ${index + 1} has invalid bond code`);
    }
    const putText = sourceText(row, "賣回權日期");
    return [{
      bondCode,
      issuerCode: requiredSourceText(row, "機構代碼", index),
      shortName: requiredSourceText(row, "債券簡稱", index),
      maturityDate: officialDate(
        requiredSourceText(row, "到期日期", index),
        `11406 row ${index + 1} maturityDate`,
      ),
      issueAmount: officialAmount(
        requiredSourceText(row, "發行總額", index),
        `11406 row ${index + 1} issueAmount`,
      ),
      outstandingAmount: officialAmount(
        requiredSourceText(row, "目前餘額", index),
        `11406 row ${index + 1} outstandingAmount`,
      ),
      putDates: putText === ""
        ? []
        : putText
          .split(/[、,;；|\s]+/)
          .filter(Boolean)
          .map((date) => officialDate(
            date,
            `11406 row ${index + 1} putDate`,
          )),
    }];
  });
}

function isExplicitPrivateUnlistedBond(row) {
  return (
    sourceText(row, "募集方式") === "8"
    && sourceText(row, "上市櫃否") === "5"
  );
}

function validateCandidate({ bondInputs, collected, views }) {
  const errors = [];
  if (bondInputs.length === 0) errors.push("EMPTY_BOND_INPUT");
  if (!Array.isArray(collected.cbQuotes) || collected.cbQuotes.length === 0) {
    errors.push("EMPTY_CB_QUOTES");
  }
  if (!Array.isArray(collected.stockCloses) || collected.stockCloses.length === 0) {
    errors.push("EMPTY_STOCK_CLOSES");
  }
  if (
    !Array.isArray(collected.conversionPrices)
    || collected.conversionPrices.length === 0
  ) {
    errors.push("EMPTY_CONVERSION_PRICES");
  }
  if (views.length === 0) errors.push("EMPTY_BOND_MARKET_VIEW");
  if (new Set(views.map((view) => view.bondCode)).size !== views.length) {
    errors.push("DUPLICATE_BOND_CODE");
  }
  if (views.some((view) => view.premiumRate !== null && view.valuationDate === null)) {
    errors.push("DERIVED_VALUE_WITHOUT_VALUATION_DATE");
  }
  if ((collected.sourceUrls ?? []).some((url) => !isApprovedOfficialUrl(url))) {
    errors.push("UNAPPROVED_SOURCE_URL");
  }
  return errors;
}

async function verifyStagedFiles(stagingDir, files, manifestText) {
  for (const file of files) {
    const text = await readFile(join(stagingDir, file.name), "utf8");
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed) || parsed.length !== file.recordCount) {
      throw new Error(`VALIDATION_FAILED:STAGED_COUNT_MISMATCH:${file.name}`);
    }
    if (sha256(text) !== file.sha256) {
      throw new Error(`VALIDATION_FAILED:STAGED_HASH_MISMATCH:${file.name}`);
    }
  }
  JSON.parse(manifestText);
}

async function publishAtomically(stagingDir, outputDir, names) {
  const backupDir = join(stagingDir, "backup");
  await mkdir(backupDir);
  const existed = new Set();
  for (const name of names) {
    const target = join(outputDir, name);
    if (await pathExists(target)) {
      existed.add(name);
      await copyFile(target, join(backupDir, name));
    }
  }

  try {
    for (const name of names) {
      await rename(join(stagingDir, name), join(outputDir, name));
    }
  } catch (error) {
    for (const name of names) {
      const target = join(outputDir, name);
      if (existed.has(name)) {
        await copyFile(join(backupDir, name), target);
      } else {
        await rm(target, { force: true });
      }
    }
    throw error;
  }
}

async function loadBondInputs(outputDir) {
  const rows = JSON.parse(await readFile(join(outputDir, "11406.json"), "utf8"));
  return bondInputsFrom11406Rows(rows);
}

function isApprovedOfficialUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    if (url.hostname === "openapi.twse.com.tw") {
      return url.pathname === "/v1/exchangeReport/STOCK_DAY_ALL";
    }
    if (url.hostname === "mopsov.twse.com.tw") {
      return url.pathname === "/mops/web/t120sg01";
    }
    if (url.hostname === "www.tpex.org.tw") {
      return new Set([
        "/www/zh-tw/bond/cbDayQry",
        "/openapi/v1/tpex_mainboard_daily_close_quotes",
        "/www/zh-tw/bond/convSearch",
      ]).has(url.pathname);
    }
    return false;
  } catch {
    return false;
  }
}

function sourceText(row, key) {
  if (!(key in row) || typeof row[key] !== "string") {
    throw new TypeError(`11406 row is missing string field: ${key}`);
  }
  const text = row[key].trim();
  return new Set(["-", "—", "－"]).has(text) ? "" : text;
}

function requiredSourceText(row, key, index) {
  const value = sourceText(row, key);
  if (value === "") {
    throw new TypeError(`11406 row ${index + 1} requires ${key}`);
  }
  return value;
}

function officialDate(value, name) {
  let iso;
  let match;
  if ((match = /^(\d{4})(\d{2})(\d{2})$/.exec(value))) {
    iso = `${match[1]}-${match[2]}-${match[3]}`;
  } else if ((match = /^(\d{3})(\d{2})(\d{2})$/.exec(value))) {
    iso = `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
  } else if ((match = /^(\d{3})\/(\d{2})\/(\d{2})$/.exec(value))) {
    iso = `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
  } else {
    iso = value;
  }
  if (!isIsoDate(iso)) throw new TypeError(`${name} must be a valid date`);
  return iso;
}

function officialAmount(value, name) {
  const unitMatch = /^(.*?)(仟元|元)?$/.exec(value.replaceAll(",", ""));
  if (!unitMatch) throw new TypeError(`${name} has an unsupported unit`);
  const text = unitMatch[1];
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) {
    throw new TypeError(`${name} must be a non-negative decimal`);
  }
  const canonical = text.replace(/\.0+$/, "");
  return unitMatch[2] === "仟元"
    ? multiplyDecimal(canonical, "1000", 0)
    : canonical;
}

async function readOptionalJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
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
  const dryRun = process.env.CB_MARKET_DRY_RUN === "1";
  if (dryRun) {
    const outputDir = "static-showcase/data";
    const bonds = await loadBondInputs(outputDir);
    const collected = await fetchCurrentOfficialMarketData({
      bondCodes: bonds.map((bond) => bond.bondCode),
      issuerCodes: [...new Set(bonds.map((bond) => bond.issuerCode))],
      date: taipeiDate(new Date()),
    });
    const views = buildBondMarketViews({
      asOfDate: collected.requestedDate,
      bonds,
      cbQuotes: collected.cbQuotes,
      stockCloses: collected.stockCloses,
      conversionPrices: collected.conversionPrices,
    });
    const errors = validateCandidate({ bondInputs: bonds, collected, views });
    if (errors.length > 0) throw new Error(`VALIDATION_FAILED:${errors.join(",")}`);
    console.log(JSON.stringify({
      mode: "dry-run",
      concurrency: 2,
      validation: "passed",
      published: false,
      counts: {
        bonds: bonds.length,
        cbQuotes: collected.cbQuotes.length,
        stockCloses: collected.stockCloses.length,
        conversionPrices: collected.conversionPrices.length,
        views: views.length,
      },
      sourceUrls: collected.sourceUrls,
    }, null, 2));
  } else {
    console.log(JSON.stringify(await buildBondMarketSnapshot(), null, 2));
  }
}

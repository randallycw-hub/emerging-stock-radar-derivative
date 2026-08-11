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
import {
  buildCbIssuerResearchSnapshot,
  parseCbIssuerResearchSnapshot,
} from "../lib/market-data/cb-issuer-research.ts";
import { multiplyDecimal } from "../lib/market-data/decimal.ts";
import { getApprovedResource } from "../lib/pipeline/source-registry.ts";
import {
  CB_ISSUER_RESEARCH_SOURCE_POLICIES,
  fetchCbIssuerResearchSources,
} from "../lib/source-verification/source-cb-issuer-research.ts";
import { fetchCurrentOfficialMarketData } from "./lib/official-market-fetch.mjs";

const MARKET_FILE_ENTRIES = [
  ["cb-quotes.json", "cbQuotes"],
  ["stock-closes.json", "stockCloses"],
  ["conversion-prices.json", "conversionPrices"],
  ["cb-issuer-research.json", "issuerResearch"],
  ["bond-market-view.json", "views"],
  ["bond-market-history.json", "history"],
];

const CB_ISSUER_RESEARCH_RESOURCES = [
  {
    policy: CB_ISSUER_RESEARCH_SOURCE_POLICIES.listed,
    resourceId: "data-gov-18420-listed-monthly-revenue-csv",
  },
  {
    policy: CB_ISSUER_RESEARCH_SOURCE_POLICIES.otc,
    resourceId: "data-gov-56510-otc-monthly-revenue-csv",
  },
];

export async function buildBondMarketSnapshot(options = {}) {
  assertPublicOptions(options, [
    "outputDir",
    "bonds",
    "collectImpl",
    "now",
    "manifestBase",
    "asOfDate",
    "previousIssuerResearch",
  ], "buildBondMarketSnapshot");
  const {
    outputDir = "static-showcase/data",
    bonds,
    collectImpl = fetchCurrentOfficialMarketData,
    now = () => new Date(),
    manifestBase,
    asOfDate: requestedAsOfDate,
    previousIssuerResearch,
  } = options;
  const generatedDate = now();
  if (!(generatedDate instanceof Date) || !Number.isFinite(generatedDate.valueOf())) {
    throw new TypeError("now must return a valid Date");
  }
  if (requestedAsOfDate !== undefined && !isIsoDate(requestedAsOfDate)) {
    throw new TypeError("asOfDate must be an ISO date");
  }
  const asOfDate = requestedAsOfDate ?? taipeiDate(generatedDate);
  const bondInputs = bonds ?? await loadBondInputs(outputDir);
  if (!Array.isArray(bondInputs)) throw new TypeError("bonds must be an array");
  const validatedPreviousIssuerResearch = previousIssuerResearch === undefined
    ? await readPreviousIssuerResearch(outputDir)
    : parseCbIssuerResearchSnapshot(previousIssuerResearch);
  const issuerResearchCandidate = buildCbIssuerResearchCandidate({
    generatedAt: generatedDate.toISOString(),
    issuers: issuerInputsFromBonds(bondInputs),
    sourceResults: await settleProductionCbIssuerResearchSources(),
    ...(validatedPreviousIssuerResearch === undefined
      ? {}
      : { previous: validatedPreviousIssuerResearch }),
  });
  const issuerResearch = issuerResearchCandidate.snapshot;
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
    issuerResearch: issuerResearch.records,
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
      issuerResearch,
      views,
      history,
    };
    const files = [];
    for (const [name, key] of MARKET_FILE_ENTRIES) {
      const text = key === "issuerResearch"
        ? issuerResearchCandidate.artifact.text
        : `${JSON.stringify(documents[key], null, 2)}\n`;
      await writeFile(join(stagingDir, name), text, "utf8");
      files.push({
        name,
        sha256: sha256(text),
        recordCount: key === "issuerResearch"
          ? documents[key].records.length
          : documents[key].length,
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
      issuerResearch,
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
          issuerResearch: issuerResearch.records.length,
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

export async function settleProductionCbIssuerResearchSources({
  fetchSourcesImpl = fetchCbIssuerResearchSources,
} = {}) {
  const error = productionIssuerResearchApprovalError();
  if (error !== undefined) {
    return {
      listed: { status: "rejected", reason: error },
      otc: { status: "rejected", reason: error },
    };
  }
  if (typeof fetchSourcesImpl !== "function") {
    throw new TypeError("fetchSourcesImpl must be a function");
  }
  return validateSettledIssuerResearchSources(await fetchSourcesImpl());
}

export function buildCbIssuerResearchCandidate({
  generatedAt,
  issuers,
  sourceResults,
  previous,
} = {}) {
  const settled = validateSettledIssuerResearchSources(sourceResults);
  const snapshot = buildCbIssuerResearchSnapshot({
    generatedAt,
    issuers,
    ...settled,
    ...(previous === undefined ? {} : { previous }),
  });
  const text = `${JSON.stringify(snapshot, null, 2)}\n`;
  return Object.freeze({
    snapshot,
    artifact: Object.freeze({
      name: "cb-issuer-research.json",
      text,
      sha256: sha256(text),
      recordCount: snapshot.records.length,
    }),
    viewRecords: snapshot.records,
  });
}

function productionIssuerResearchApprovalError() {
  try {
    for (const { policy, resourceId } of CB_ISSUER_RESEARCH_RESOURCES) {
      const resource = getApprovedResource(policy.sourceId, resourceId);
      if (
        resource.approvalStatus !== "APPROVED_FOR_PRODUCTION"
        || resource.exactUrl !== policy.url
      ) {
        return new Error("CB issuer research sources are not approved for production");
      }
    }
    return undefined;
  } catch {
    return new Error("CB issuer research sources are not approved for production");
  }
}

function validateSettledIssuerResearchSources(
  value,
  name = "CB issuer research source results",
) {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || !hasExactEnumerableKeys(value, ["listed", "otc"])
  ) {
    throw new TypeError(`${name} must contain exact listed and otc results`);
  }
  return {
    listed: validateSettledResult(value.listed, `${name}.listed`),
    otc: validateSettledResult(value.otc, `${name}.otc`),
  };
}

function assertPublicOptions(value, allowed, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} options must be an object`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key)) {
      throw new TypeError(`${String(key)} is not supported by ${name}`);
    }
  }
}

function validateSettledResult(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be a settled result`);
  }
  if (value.status === "fulfilled") {
    if (!hasExactEnumerableKeys(value, ["status", "value"]) || typeof value.value !== "string") {
      throw new TypeError(`${name} fulfilled value must be a CSV string`);
    }
    return { status: "fulfilled", value: value.value };
  }
  if (value.status === "rejected") {
    if (!hasExactEnumerableKeys(value, ["status", "reason"])) {
      throw new TypeError(`${name} rejected result is invalid`);
    }
    return { status: "rejected", reason: value.reason };
  }
  throw new TypeError(`${name} must be fulfilled or rejected`);
}

function issuerInputsFromBonds(bonds) {
  return bonds.map((bond, index) => {
    if (bond === null || typeof bond !== "object" || Array.isArray(bond)) {
      throw new TypeError(`bond ${index} must be an object`);
    }
    return {
      issuerCode: requiredPlainText(bond.issuerCode, `bond ${index} issuerCode`),
      issuerName: requiredPlainText(bond.issuerName, `bond ${index} issuerName`),
    };
  });
}

function requiredPlainText(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

async function readPreviousIssuerResearch(outputDir) {
  const value = await readOptionalJson(join(outputDir, "cb-issuer-research.json"));
  return value === undefined ? undefined : parseCbIssuerResearchSnapshot(value);
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
    const outstandingDataDateText = optionalSourceAliasText(
      row,
      ["資料日期", "DataDate"],
      index,
    );
    return [{
      bondCode,
      issuerCode: requiredSourceText(row, "機構代碼", index),
      issuerName: requiredSourceText(row, "機構名稱", index),
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
      outstandingDataDate: outstandingDataDateText === ""
        ? null
        : officialDate(
          outstandingDataDateText,
          `11406 row ${index + 1} outstanding data date`,
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
  let stagedIssuerResearch;
  let stagedViews;
  for (const file of files) {
    const text = await readFile(join(stagingDir, file.name), "utf8");
    const parsed = JSON.parse(text);
    if (file.name === "cb-issuer-research.json") {
      stagedIssuerResearch = parseCbIssuerResearchSnapshot(parsed);
      if (stagedIssuerResearch.records.length !== file.recordCount) {
        throw new Error(`VALIDATION_FAILED:STAGED_COUNT_MISMATCH:${file.name}`);
      }
    } else if (!Array.isArray(parsed) || parsed.length !== file.recordCount) {
      throw new Error(`VALIDATION_FAILED:STAGED_COUNT_MISMATCH:${file.name}`);
    }
    if (file.name === "bond-market-view.json") stagedViews = parsed;
    if (sha256(text) !== file.sha256) {
      throw new Error(`VALIDATION_FAILED:STAGED_HASH_MISMATCH:${file.name}`);
    }
  }
  const manifest = JSON.parse(manifestText);
  const manifestFiles = manifest?.market?.files;
  if (
    !Array.isArray(manifestFiles)
    || manifestFiles.length !== files.length
    || files.some((file) => {
      const entry = manifestFiles.find((candidate) => candidate?.name === file.name);
      return entry?.sha256 !== file.sha256 || entry?.recordCount !== file.recordCount;
    })
  ) {
    throw new Error("VALIDATION_FAILED:MARKET_MANIFEST_FILES");
  }
  if (stagedIssuerResearch === undefined || stagedViews === undefined) {
    throw new Error("VALIDATION_FAILED:ISSUER_RESEARCH_ARTIFACTS");
  }
  verifyIssuerResearchViewConsistency(stagedIssuerResearch, stagedViews);
}

export function verifyIssuerResearchViewConsistency(snapshot, views) {
  if (!Array.isArray(views)) {
    throw new Error("VALIDATION_FAILED:BOND_MARKET_VIEW_ENVELOPE");
  }
  const researchByCode = new Map(
    snapshot.records.map((record) => [record.issuerCode, publicIssuerResearch(record)]),
  );
  const viewedIssuerCodes = new Set();
  for (const view of views) {
    if (view === null || typeof view !== "object" || Array.isArray(view)) {
      throw new Error("VALIDATION_FAILED:BOND_MARKET_VIEW_ENVELOPE");
    }
    const expected = researchByCode.get(view.issuerCode) ?? null;
    if (!equalPlainJson(view.issuerResearch, expected)) {
      throw new Error(`VALIDATION_FAILED:ISSUER_RESEARCH_VIEW_MISMATCH:${view.issuerCode}`);
    }
    viewedIssuerCodes.add(view.issuerCode);
  }
  if (snapshot.records.some((record) => !viewedIssuerCodes.has(record.issuerCode))) {
    throw new Error("VALIDATION_FAILED:ORPHAN_ISSUER_RESEARCH");
  }
}

function publicIssuerResearch(record) {
  return {
    market: record.market,
    industryName: record.industryName,
    revenueMonth: record.revenueMonth,
    sourcePublishedOn: record.sourcePublishedOn,
    revenueUnit: record.revenueUnit,
    currentMonthRevenue: record.currentMonthRevenue,
    monthOverMonthPercent: record.monthOverMonthPercent,
    yearOverYearPercent: record.yearOverYearPercent,
    cumulativeRevenue: record.cumulativeRevenue,
    cumulativeYearOverYearPercent: record.cumulativeYearOverYearPercent,
  };
}

function equalPlainJson(left, right) {
  if (left === null || right === null) return left === right;
  if (
    typeof left !== "object"
    || typeof right !== "object"
    || Array.isArray(left)
    || Array.isArray(right)
  ) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key])
  );
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

function optionalSourceAliasText(row, keys, index) {
  const present = keys.filter((key) => key in row);
  if (present.length === 0) return "";
  if (present.length !== 1) {
    throw new TypeError(
      `11406 row ${index + 1} requires exactly one of ${keys.join("/")}`,
    );
  }
  return sourceText(row, present[0]);
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

function hasExactEnumerableKeys(value, expected) {
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === expected.length
    && keys.every((key) => (
      typeof key === "string"
      && expected.includes(key)
      && Object.prototype.propertyIsEnumerable.call(value, key)
    ))
  );
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

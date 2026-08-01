import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { getBasicRows } from "../lib/company.ts";
import { parseEmergingMarketSource } from "../lib/source-verification/source-emerging-market.ts";
import { getTrackerData } from "../lib/tracker.mjs";

const root = new URL("../", import.meta.url);
const file = relativePath => readFile(new URL(relativePath, root), "utf8");
const productionRoots = ["app", "lib", "worker", "db", "scripts", "public"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs"]);
const approvedEndpoints = new Set([
  "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv",
  "https://mopsfin.twse.com.tw/opendata/t187ap05_R.csv",
  "https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data",
  "https://mopsfin.twse.com.tw/opendata/t187ap03_P.csv",
  "https://www.tpex.org.tw/openapi/v1/bond_ISSBD5_data",
  "https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics",
  "https://www.tpex.org.tw/openapi/v1/t187ap05_R",
  "https://www.tpex.org.tw/openapi/v1/tpex_esb_applicant_companies",
  "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_R",
  "https://www.tpex.org.tw/www/zh-tw/bond/cbDayQry",
  "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
  "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes",
  "https://www.tpex.org.tw/www/zh-tw/bond/convSearch",
  "https://www.twse.com.tw/exchangeReport/STOCK_DAY",
  "https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock",
]);

async function filesUnder(relativePath) {
  const absolutePath = fileURLToPath(new URL(relativePath, root));
  const entry = await stat(absolutePath).catch(() => null);
  if (!entry) return [];
  if (entry.isFile()) return sourceExtensions.has(path.extname(absolutePath)) ? [relativePath] : [];

  const children = await readdir(absolutePath, { withFileTypes: true });
  const nested = await Promise.all(children.map(child => filesUnder(path.join(relativePath, child.name))));
  return nested.flat();
}

function externalUrlLiterals(source) {
  return [...source.matchAll(/https?:\/\/[^"'`\s$}]+/gi)]
    .map(match => match[0].replace(/[),;]+$/, ""));
}

function assertOnlyApprovedExternalUrls(urls) {
  const violations = urls.filter(value => {
    const url = new URL(value);
    if (url.hostname === "localhost" || url.hostname.endsWith(".local")) return false;
    return !approvedEndpoints.has(value);
  });
  assert.deepEqual([...new Set(violations)], []);
}

test("all production source roots contain only Source Registry APPROVED external URL literals", async () => {
  const productionFiles = (await Promise.all(productionRoots.map(filesUnder))).flat();
  const sources = await Promise.all(productionFiles.map(file));
  assertOnlyApprovedExternalUrls(sources.flatMap(externalUrlLiterals));
});

test("rejects representative PENDING, REJECTED, and unregistered external URLs", () => {
  for (const endpoint of [
    "https://openapi.twse.com.tw/v1/company/applylistingLocal",
    "https://query1.finance.yahoo.com/v8/finance/chart/2330.TW",
    "https://data.example.invalid/unregistered",
  ]) {
    assert.throws(() => assertOnlyApprovedExternalUrls([endpoint]), assert.AssertionError);
  }
});

test("tracker rejects source failure instead of using pending, unregistered, or fixture fallback", async () => {
  const originalFetch = globalThis.fetch;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFixtureFlag = process.env.ENABLE_DEV_SOURCE_FIXTURES;
  const requested = [];

  process.env.NODE_ENV = "production";
  process.env.ENABLE_DEV_SOURCE_FIXTURES = "1";
  globalThis.fetch = async url => {
    requested.push(String(url));
    return new Response("unavailable", { status: 503 });
  };

  try {
    await assert.rejects(getTrackerData(true), /source_unavailable/);
    assert.deepEqual(requested, [
      "https://www.tpex.org.tw/openapi/v1/tpex_esb_applicant_companies",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalFixtureFlag === undefined) delete process.env.ENABLE_DEV_SOURCE_FIXTURES;
    else process.env.ENABLE_DEV_SOURCE_FIXTURES = originalFixtureFlag;
  }
});

test("company API has no general-page or storage request and returns explicit unavailable state", async () => {
  const [route, company] = await Promise.all([
    file("app/api/company/route.ts"),
    file("lib/company.ts"),
  ]);

  assert.doesNotMatch(route, /ic\.tpex\.org\.tw|dsp\.tpex\.org\.tw|\/storage\/|fetchCompanyDetail/);
  assert.match(route, /source_unavailable|source_not_approved/);
  assert.doesNotMatch(company, /^import\s+.+company-basic-snapshot\.json/m);
  assert.match(company, /NODE_ENV.+production/);
  assert.match(company, /ENABLE_DEV_SOURCE_FIXTURES/);
});

test("company source failure cannot enable a production fixture fallback", async () => {
  const originalFetch = globalThis.fetch;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFixtureFlag = process.env.ENABLE_DEV_SOURCE_FIXTURES;
  const requested = [];

  process.env.NODE_ENV = "production";
  process.env.ENABLE_DEV_SOURCE_FIXTURES = "1";
  globalThis.fetch = async url => {
    requested.push(String(url));
    return new Response("unavailable", { status: 503 });
  };

  try {
    await assert.rejects(getBasicRows(), /source_unavailable/);
    assert.deepEqual(requested, [
      "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_R",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalFixtureFlag === undefined) delete process.env.ENABLE_DEV_SOURCE_FIXTURES;
    else process.env.ENABLE_DEV_SOURCE_FIXTURES = originalFixtureFlag;
  }
});

test("tracker API exposes explicit unavailable state and production fixtures are gated", async () => {
  const [route, tracker] = await Promise.all([
    file("app/api/tracker/route.ts"),
    file("lib/tracker.mjs"),
  ]);

  assert.match(route, /source_unavailable|source_not_approved/);
  assert.doesNotMatch(tracker, /^import\s+.+tpex-applicant-snapshot\.json/m);
  assert.match(tracker, /NODE_ENV.+production/);
  assert.match(tracker, /ENABLE_DEV_SOURCE_FIXTURES/);
});

test("retains allowed end-of-day and contractual price semantics", async () => {
  const allowed = await file("tests/fixtures/phase1-guardrails/allowed-fields.txt");
  for (const field of [
    "dailyAveragePrice",
    "previousDailyAveragePrice",
    "dayHigh",
    "dayLow",
    "dailyVolume",
    "initialConversionPrice",
    "putPrice",
  ]) {
    assert.match(allowed, new RegExp(`\\b${field}\\b`));
  }
  assert.doesNotMatch(allowed, /\bclosePrice\b/);
});

test("emerging market parser publishes the approved final trade but no bid or ask fields", () => {
  const [row] = parseEmergingMarketSource([{
    Date: "1150730",
    Time: "140006",
    SecuritiesCompanyCode: "1260",
    CompanyName: "富味鄉",
    PreviousAveragePrice: "25.29",
    BuyingPrice: "24.6",
    BuyingQuantity: "3000",
    SellingPrice: "25.55",
    SellingQuantity: "3000",
    Highest: "26.5",
    Lowest: "25.2",
    Average: "25.45",
    LatestPrice: "25.2",
    "Buy/Sell": "S",
    SuspendTime: "000000",
    TransactionVolume: "22001",
    ApplyingDate: "",
    ApplyingStatus: "",
  }]);
  assert.deepEqual(Object.keys(row).sort(), [
    "applyingDate",
    "applyingStatus",
    "companyCode",
    "companyName",
    "dailyAveragePrice",
    "dailyHighPrice",
    "dailyLowPrice",
    "lastTradedPrice",
    "previousAveragePrice",
    "publishedTime",
    "tradingDate",
    "transactionVolume",
  ]);
});

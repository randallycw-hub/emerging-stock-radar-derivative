import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildBondMarketViews } from "../lib/market-data/bond-market-view.ts";
import * as snapshotBuilder from "../scripts/build-bond-market-snapshot.mjs";

const {
  bondInputsFrom11406Rows,
  buildBondMarketSnapshot,
} = snapshotBuilder;

const bond = {
  bondCode: "35221",
  issuerCode: "3522",
  issuerName: "御嵿",
  shortName: "御嵿一",
  maturityDate: "2028-07-29",
  issueAmount: "500000000",
  outstandingAmount: "400000000",
  putDates: ["2027-08-30"],
};

const previousIssuerResearch = {
  schemaVersion: 1,
  generatedAt: "2026-07-29T12:30:00.000Z",
  records: [{
    issuerCode: "3522",
    issuerName: "御嵿",
    market: "listed",
    industryName: "觀光餐旅",
    revenueMonth: "2026-06",
    sourcePublishedOn: "2026-07-17",
    revenueUnit: "仟元",
    currentMonthRevenue: "100",
    monthOverMonthPercent: "1",
    yearOverYearPercent: "2",
    cumulativeRevenue: "600",
    cumulativeYearOverYearPercent: "3",
  }],
  sources: {
    listed: {
      status: "current",
      dataDate: "2026-07-17",
      fetchedAt: "2026-07-29T12:30:00.000Z",
    },
    otc: { status: "unavailable", dataDate: null, fetchedAt: null },
  },
  diagnostics: [],
};
const validCollectedMarketData = {
  requestedDate: "2026-07-30",
  cbQuotes: [{
    bondCode: "35221",
    tradingDate: "2026-07-29",
    tradingMode: "equivalent",
    close: "103.5",
    change: "1.5",
    open: "103.5",
    high: "103.5",
    low: "103.5",
    tradeCount: "2",
    tradingUnits: "10",
    turnover: "1035000",
    average: "103.5",
  }],
  stockCloses: [{
    companyCode: "3522",
    market: "otc",
    tradingDate: "2026-07-29",
    close: "38.25",
    change: "0",
    volume: "1000",
    turnover: "38250",
  }],
  conversionPrices: [{
    bondCode: "35221",
    issuerCode: "3522",
    initialConversionPrice: "40",
    currentConversionPrice: "35.1",
    effectiveDate: "2025-11-09",
    officialDetailUrl:
      "https://mopsov.twse.com.tw/mops/web/t120sg01?bond_id=35221&issuer_stock_code=3522",
  }],
  sourceUrls: [
    "https://www.tpex.org.tw/www/zh-tw/bond/cbDayQry",
    "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes",
    "https://www.tpex.org.tw/www/zh-tw/bond/convSearch",
  ],
};

async function makePublishedDirectory() {
  const root = await mkdtemp(join(tmpdir(), "cb-market-test-"));
  const outputDir = join(root, "data");
  await mkdir(outputDir);
  await writeFile(
    join(outputDir, "manifest.json"),
    `${JSON.stringify({
      kind: "official-source-snapshot",
      generatedAt: "2026-07-29",
      datasets: [],
    })}\n`,
  );
  return outputDir;
}

async function offlineIssuerResearchSourceResults() {
  const listed = await readFile(new URL(
    "./fixtures/source-verification/cb-issuer-research/listed-minimal.csv",
    import.meta.url,
  ), "utf8");
  return {
    listed: {
      status: "fulfilled",
      value: listed.replace('"1101","台泥"', '"3522","御嵿"'),
    },
    otc: { status: "rejected", reason: new Error("offline OTC unavailable") },
  };
}

test("maps official 11406 dates, put dates and amount units exactly", () => {
  assert.deepEqual(bondInputsFrom11406Rows([{
    債券代碼: "35221",
    機構代碼: "3522",
    機構名稱: "御嵿",
    債券簡稱: "御嵿一",
    到期日期: "1170729",
    發行總額: "2仟元",
    目前餘額: "1,500元",
    賣回權日期: "115/08/30、1160830",
  }]), [{
    bondCode: "35221",
    issuerCode: "3522",
    issuerName: "御嵿",
    shortName: "御嵿一",
    maturityDate: "2028-07-29",
    issueAmount: "2000",
    outstandingAmount: "1500",
    putDates: ["2026-08-30", "2027-08-30"],
  }]);
});

test("production issuer research refuses both network calls until both registry resources are approved", async () => {
  const { settleProductionCbIssuerResearchSources } = await import(
    "../scripts/build-bond-market-snapshot.mjs"
  );
  let fetchCalls = 0;
  const result = await settleProductionCbIssuerResearchSources({
    fetchSourcesImpl: async () => {
      fetchCalls += 1;
      return offlineIssuerResearchSourceResults();
    },
  });

  assert.equal(fetchCalls, 0);
  assert.equal(result.listed.status, "rejected");
  assert.equal(result.otc.status, "rejected");
  assert.match(String(result.listed.reason), /not approved for production/i);
});

test("pure issuer-research candidate helper validates settled CSVs without publishing", async () => {
  const candidate = snapshotBuilder.buildCbIssuerResearchCandidate({
    generatedAt: "2026-08-09T12:30:00.000Z",
    issuers: [{ issuerCode: "3522", issuerName: "御嵿" }],
    sourceResults: await offlineIssuerResearchSourceResults(),
  });

  const researchText = candidate.artifact.text;
  const research = JSON.parse(researchText);
  assert.equal(research.records.length, 1);
  assert.equal(research.records[0].issuerCode, "3522");
  assert.equal(research.sources.listed.status, "current");
  assert.equal(research.sources.otc.status, "unavailable");
  assert.equal(researchText.includes("備註"), false);
  assert.equal(researchText.includes("offline OTC unavailable"), false);
  assert.equal(researchText.includes("t187ap05_L.csv"), false);
  assert.deepEqual(candidate.snapshot, research);
  assert.equal(candidate.viewRecords, candidate.snapshot.records);
  assert.equal(candidate.artifact.name, "cb-issuer-research.json");
  assert.match(candidate.artifact.sha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(candidate.artifact.recordCount, 1);

  const views = buildBondMarketViews({
    asOfDate: "2026-08-09",
    bonds: [bond, { ...bond, bondCode: "35222", shortName: "御嵿二" }],
    cbQuotes: [],
    stockCloses: [],
    conversionPrices: [],
    issuerResearch: candidate.viewRecords,
  });
  assert.deepEqual(views.map((view) => view.issuerResearch?.industryName), [
    "水泥工業",
    "水泥工業",
  ]);
  assert.notStrictEqual(views[0].issuerResearch, views[1].issuerResearch);
});

test("removed offline source option cannot publish current research while unapproved", async () => {
  const outputDir = await makePublishedDirectory();
  await writeFile(
    join(outputDir, "cb-issuer-research.json"),
    `${JSON.stringify(previousIssuerResearch)}\n`,
  );
  const before = await readFile(join(outputDir, "cb-issuer-research.json"), "utf8");
  let marketCalls = 0;

  await assert.rejects(
    buildBondMarketSnapshot({
      outputDir,
      bonds: [bond],
      collectImpl: async () => {
        marketCalls += 1;
        return validCollectedMarketData;
      },
      offlineIssuerResearchSourceResults: await offlineIssuerResearchSourceResults(),
      now: () => new Date("2026-08-09T12:30:00.000Z"),
    }),
    /offlineIssuerResearchSourceResults.*not supported/i,
  );
  assert.equal(marketCalls, 0);
  assert.equal(await readFile(join(outputDir, "cb-issuer-research.json"), "utf8"), before);
});

test("validates the entire prior issuer snapshot before market collection or stale reuse", async () => {
  const outputDir = await makePublishedDirectory();
  await writeFile(
    join(outputDir, "cb-issuer-research.json"),
    `${JSON.stringify({ ...previousIssuerResearch, schemaVersion: 2 })}\n`,
  );
  let marketCalls = 0;

  await assert.rejects(
    buildBondMarketSnapshot({
      outputDir,
      bonds: [bond],
      collectImpl: async () => {
        marketCalls += 1;
        return validCollectedMarketData;
      },
      now: () => new Date("2026-08-09T12:30:00.000Z"),
    }),
    /schemaVersion/i,
  );
  assert.equal(marketCalls, 0);
});

test("production default stages unavailable rather than current research while registry is unapproved", async () => {
  const outputDir = await makePublishedDirectory();
  const result = await buildBondMarketSnapshot({
    outputDir,
    bonds: [bond],
    collectImpl: async () => validCollectedMarketData,
    now: () => new Date("2026-08-09T12:30:00.000Z"),
  });

  assert.deepEqual(result.issuerResearch.sources, {
    listed: { status: "unavailable", dataDate: null, fetchedAt: null },
    otc: { status: "unavailable", dataDate: null, fetchedAt: null },
  });
  assert.equal(result.issuerResearch.records.length, 0);
  assert.equal(result.views[0].issuerResearch, null);
});

test("excludes only explicitly private unlisted 11406 bonds without hiding malformed public codes", () => {
  assert.deepEqual(bondInputsFrom11406Rows([
    {
      債券代碼: "YI31AA",
      機構代碼: "2911",
      債券簡稱: "麗嬰房私債一",
      到期日期: "20281206",
      發行總額: "300000000",
      目前餘額: "300000000",
      賣回權日期: "",
      掛牌地點: "0",
      上市櫃否: "5",
      募集方式: "8",
    },
    {
      債券代碼: "YB66AC",
      機構代碼: "6165",
      債券簡稱: "浪凡私債三",
      到期日期: "20281206",
      發行總額: "300000000",
      目前餘額: "300000000",
      賣回權日期: "",
      掛牌地點: "1",
      上市櫃否: "5",
      募集方式: "8",
    },
  ]), []);

  assert.throws(
    () => bondInputsFrom11406Rows([{
      債券代碼: "BAD-CODE",
      機構代碼: "2911",
      債券簡稱: "錯誤公開債券",
      到期日期: "20281206",
      發行總額: "300000000",
      目前餘額: "300000000",
      賣回權日期: "",
      掛牌地點: "1",
      上市櫃否: "1",
      募集方式: "1",
    }]),
    /invalid bond code/,
  );
  assert.throws(
    () => bondInputsFrom11406Rows([{
      債券代碼: "",
      機構代碼: "2911",
      債券簡稱: "缺少代碼的公開債券",
      到期日期: "20281206",
      發行總額: "300000000",
      目前餘額: "300000000",
      賣回權日期: "",
      掛牌地點: "1",
      上市櫃否: "1",
      募集方式: "1",
    }]),
    /missing bond code/,
  );
});

test("a failed candidate leaves every published market file unchanged", async () => {
  const outputDir = await makePublishedDirectory();
  const names = [
    "cb-quotes.json",
    "stock-closes.json",
    "conversion-prices.json",
    "cb-issuer-research.json",
    "bond-market-view.json",
  ];
  for (const name of names) {
    await writeFile(
      join(outputDir, name),
      name === "cb-issuer-research.json"
        ? `${JSON.stringify(previousIssuerResearch)}\n`
        : `{"previous":"${name}"}\n`,
    );
  }
  const before = Object.fromEntries(await Promise.all(
    ["manifest.json", ...names].map(async (name) => [
      name,
      await readFile(join(outputDir, name), "utf8"),
    ]),
  ));

  await assert.rejects(
    () => buildBondMarketSnapshot({
      outputDir,
      bonds: [bond],
      collectImpl: async () => ({
        ...validCollectedMarketData,
        cbQuotes: [],
      }),
      now: () => new Date("2026-07-30T12:30:00.000Z"),
    }),
    /VALIDATION_FAILED/,
  );

  for (const [name, text] of Object.entries(before)) {
    assert.equal(await readFile(join(outputDir, name), "utf8"), text);
  }
});

test("a valid candidate publishes verified files and appends exact-date history", async () => {
  const outputDir = await makePublishedDirectory();
  await writeFile(
    join(outputDir, "bond-market-history.json"),
    `${JSON.stringify([{
      bondCode: "35221",
      date: "2026-07-28",
      cbClose: "102",
      stockClose: "37",
      effectiveConversionPrice: "35.1",
      conversionValue: "105.41",
      premiumRate: "-3.24",
    }])}\n`,
  );
  const result = await buildBondMarketSnapshot({
    outputDir,
    bonds: [bond],
    collectImpl: async () => validCollectedMarketData,
    now: () => new Date("2026-07-30T12:30:00.000Z"),
  });

  assert.equal(result.status, "published");
  assert.equal(result.files.length, 6);
  assert.equal(result.manifest.market.generatedAt, "2026-07-30T12:30:00.000Z");
  assert.equal(result.manifest.market.status, "verified");
  assert.equal(result.manifest.market.requestedDate, "2026-07-30");
  assert.equal(result.manifest.market.latestCbPriceDate, "2026-07-29");
  assert.equal(result.manifest.market.latestStockPriceDate, "2026-07-29");
  assert.equal(result.manifest.market.dataDate, "2026-07-29");
  assert.equal(result.report.validation, "passed");

  for (const file of result.manifest.market.files) {
    const text = await readFile(join(outputDir, file.name), "utf8");
    assert.deepEqual(JSON.parse(text), file.name === "bond-market-view.json"
      ? result.views
      : JSON.parse(text));
    assert.match(file.sha256, /^sha256:[0-9a-f]{64}$/);
  }
  const storedManifest = JSON.parse(
    await readFile(join(outputDir, "manifest.json"), "utf8"),
  );
  assert.equal(
    storedManifest.market.generatedAt,
    result.manifest.market.generatedAt,
  );
  const history = JSON.parse(
    await readFile(join(outputDir, "bond-market-history.json"), "utf8"),
  );
  assert.deepEqual(
    history.map((point) => point.date),
    ["2026-07-28", "2026-07-29"],
  );
});

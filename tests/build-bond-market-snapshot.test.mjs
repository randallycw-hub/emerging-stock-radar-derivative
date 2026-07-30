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

import {
  bondInputsFrom11406Rows,
  buildBondMarketSnapshot,
} from "../scripts/build-bond-market-snapshot.mjs";

const bond = {
  bondCode: "35221",
  issuerCode: "3522",
  shortName: "御嵿一",
  maturityDate: "2028-07-29",
  issueAmount: "500000000",
  outstandingAmount: "400000000",
  putDates: ["2027-08-30"],
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

test("maps official 11406 dates, put dates and amount units exactly", () => {
  assert.deepEqual(bondInputsFrom11406Rows([{
    債券代碼: "35221",
    機構代碼: "3522",
    債券簡稱: "御嵿一",
    到期日期: "1170729",
    發行總額: "2仟元",
    目前餘額: "1,500元",
    賣回權日期: "115/08/30、1160830",
  }]), [{
    bondCode: "35221",
    issuerCode: "3522",
    shortName: "御嵿一",
    maturityDate: "2028-07-29",
    issueAmount: "2000",
    outstandingAmount: "1500",
    putDates: ["2026-08-30", "2027-08-30"],
  }]);
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
    "bond-market-view.json",
  ];
  for (const name of names) {
    await writeFile(join(outputDir, name), `{"previous":"${name}"}\n`);
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
  assert.equal(result.files.length, 5);
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

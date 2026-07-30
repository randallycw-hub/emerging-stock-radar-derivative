import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseEmergingMarketSource } from "../../lib/source-verification/source-emerging-market.ts";

const sourceRow = (overrides = {}) => ({
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
  ...overrides,
});

test("parses only approved emerging end-of-day fields", async () => {
  const payload = JSON.parse(await readFile(
    new URL("../fixtures/source-verification/emerging-market/tpex-esb-latest-statistics.json", import.meta.url),
    "utf8",
  ));
  const [row] = parseEmergingMarketSource(payload);
  assert.deepEqual(row, {
    tradingDate: "2026-07-30",
    publishedTime: "14:00:06",
    companyCode: "1260",
    companyName: "富味鄉",
    previousAveragePrice: "25.29",
    dailyAveragePrice: "25.45",
    dailyHighPrice: "26.5",
    dailyLowPrice: "25.2",
    transactionVolume: "22001",
    applyingDate: null,
    applyingStatus: null,
  });
  assert.equal("latestPrice" in row, false);
  assert.equal("buyingPrice" in row, false);
  assert.equal("sellingPrice" in row, false);
});

test("rejects non-array payloads", () => {
  assert.throws(() => parseEmergingMarketSource({}), /must be an array/);
});

test("rejects duplicate company codes on the same trading date", () => {
  assert.throws(
    () => parseEmergingMarketSource([sourceRow(), sourceRow({ Average: "25.5" })]),
    /duplicate company code: 1260 on 2026-07-30/,
  );
});

test("converts blank, dash, and non-finite numeric source values to null", () => {
  const [row] = parseEmergingMarketSource([sourceRow({
    PreviousAveragePrice: " ",
    Average: "-",
    Highest: "Infinity",
    Lowest: "NaN",
    TransactionVolume: "-",
  })]);
  assert.deepEqual(
    {
      previousAveragePrice: row.previousAveragePrice,
      dailyAveragePrice: row.dailyAveragePrice,
      dailyHighPrice: row.dailyHighPrice,
      dailyLowPrice: row.dailyLowPrice,
      transactionVolume: row.transactionVolume,
    },
    {
      previousAveragePrice: null,
      dailyAveragePrice: null,
      dailyHighPrice: null,
      dailyLowPrice: null,
      transactionVolume: null,
    },
  );
});

test("converts dash application cells to null", () => {
  const [row] = parseEmergingMarketSource([sourceRow({
    ApplyingDate: "-",
    ApplyingStatus: "-",
  })]);
  assert.deepEqual(
    { applyingDate: row.applyingDate, applyingStatus: row.applyingStatus },
    { applyingDate: null, applyingStatus: null },
  );
});

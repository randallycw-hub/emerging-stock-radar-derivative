import assert from "node:assert/strict";
import test from "node:test";

import { buildHistoryPoints } from "../lib/market-data/bond-market-history.ts";

const cbQuotes = [{
  bondCode: "35221",
  tradingDate: "2026-07-29",
  tradingMode: "equivalent",
  close: "103.5",
  change: "0",
  open: "103.5",
  high: "103.5",
  low: "103.5",
  tradeCount: "1",
  tradingUnits: "1",
  turnover: "103500",
  average: "103.5",
}];
const stockCloses = [
  {
    companyCode: "3522",
    market: "otc",
    tradingDate: "2026-07-29",
    close: "36.21",
    change: "0",
    volume: "1000",
    turnover: "36210",
  },
  {
    companyCode: "3522",
    market: "otc",
    tradingDate: "2026-07-30",
    close: "39",
    change: "0",
    volume: "1000",
    turnover: "39000",
  },
];
const conversionPrices = [{
  bondCode: "35221",
  issuerCode: "3522",
  initialConversionPrice: "40",
  currentConversionPrice: "35",
  effectiveDate: "2025-11-09",
  officialDetailUrl:
    "https://mopsov.twse.com.tw/mops/web/t120sg01?bond_id=35221&issuer_stock_code=3522",
}];

test("history computes premium only when CB and stock share the exact date", () => {
  const points = buildHistoryPoints({
    cbQuotes,
    stockCloses,
    conversionPrices,
  });

  assert.deepEqual(points, [
    {
      bondCode: "35221",
      date: "2026-07-29",
      cbClose: "103.5",
      stockClose: "36.21",
      effectiveConversionPrice: "35",
      conversionValue: "103.46",
      premiumRate: "0.04",
    },
    {
      bondCode: "35221",
      date: "2026-07-30",
      cbClose: null,
      stockClose: "39",
      effectiveConversionPrice: "35",
      conversionValue: "111.43",
      premiumRate: null,
    },
  ]);
});

test("history never applies the latest conversion price before its effective date", () => {
  const points = buildHistoryPoints({
    cbQuotes: [{ ...cbQuotes[0], tradingDate: "2025-10-31" }],
    stockCloses: [{ ...stockCloses[0], tradingDate: "2025-10-31" }],
    conversionPrices,
  });

  assert.equal(points[0].effectiveConversionPrice, null);
  assert.equal(points[0].conversionValue, null);
  assert.equal(points[0].premiumRate, null);
});

test("history rejects duplicate daily identities", () => {
  assert.throws(
    () => buildHistoryPoints({
      cbQuotes: [cbQuotes[0], structuredClone(cbQuotes[0])],
      stockCloses,
      conversionPrices,
    }),
    /duplicate CB history quote/,
  );
});

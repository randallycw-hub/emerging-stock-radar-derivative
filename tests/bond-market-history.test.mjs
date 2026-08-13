import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildHistoryPoints,
  mergeBondMarketHistory,
  parseBondMarketHistory,
} from "../lib/market-data/bond-market-history.ts";

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
      cbOpen: "103.5",
      cbHigh: "103.5",
      cbLow: "103.5",
      cbClose: "103.5",
      cbAverage: "103.5",
      cbChange: "0",
      cbTradingUnits: "1",
      cbTurnover: "103500",
      stockClose: "36.21",
      effectiveConversionPrice: "35",
      conversionValue: "103.46",
      premiumRate: "0.04",
    },
    {
      bondCode: "35221",
      date: "2026-07-30",
      cbOpen: null,
      cbHigh: null,
      cbLow: null,
      cbClose: null,
      cbAverage: null,
      cbChange: null,
      cbTradingUnits: null,
      cbTurnover: null,
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

test("history preserves a zero-volume date without inventing a candle", () => {
  const [point] = buildHistoryPoints({
    cbQuotes: [{
      ...cbQuotes[0],
      close: null,
      open: null,
      high: null,
      low: null,
      average: null,
      change: null,
      tradingUnits: "0",
      turnover: "0",
    }],
    stockCloses: [{ ...stockCloses[0] }],
    conversionPrices,
  });

  assert.deepEqual(point, {
    bondCode: "35221",
    date: "2026-07-29",
    cbOpen: null,
    cbHigh: null,
    cbLow: null,
    cbClose: null,
    cbAverage: null,
    cbChange: null,
    cbTradingUnits: "0",
    cbTurnover: "0",
    stockClose: "36.21",
    effectiveConversionPrice: "35",
    conversionValue: "103.46",
    premiumRate: null,
  });
});

test("history recognizes every canonical zero-volume spelling without inventing a candle", () => {
  const [point] = buildHistoryPoints({
    cbQuotes: [{ ...cbQuotes[0], tradingUnits: "0.0" }],
    stockCloses: [{ ...stockCloses[0] }],
    conversionPrices,
  });

  assert.deepEqual(
    [point.cbOpen, point.cbHigh, point.cbLow, point.cbClose, point.premiumRate],
    [null, null, null, null, null],
  );
});

test("history removes an incomplete OHLC candle while retaining the day volume", () => {
  const [point] = buildHistoryPoints({
    cbQuotes: [{ ...cbQuotes[0], high: null, tradingUnits: "3" }],
    stockCloses: [{ ...stockCloses[0] }],
    conversionPrices,
  });

  assert.deepEqual(
    [point.cbOpen, point.cbHigh, point.cbLow, point.cbClose, point.cbTradingUnits],
    [null, null, null, null, "3"],
  );
  assert.equal(point.premiumRate, null);
});

test("history rejects impossible OHLC relationships", () => {
  assert.throws(
    () => buildHistoryPoints({
      cbQuotes: [{ ...cbQuotes[0], high: "102", low: "104" }],
      stockCloses,
      conversionPrices,
    }),
    /OHLC|high|low/i,
  );
});

test("history parser accepts only frozen exact valid points", () => {
  const input = [{
    bondCode: "35221",
    date: "2026-07-29",
    cbOpen: "103.5",
    cbHigh: "104",
    cbLow: "103",
    cbClose: "103.5",
    cbAverage: "103.5",
    cbChange: "0",
    cbTradingUnits: "1",
    cbTurnover: "103500",
    stockClose: "36.21",
    effectiveConversionPrice: "35",
    conversionValue: "103.46",
    premiumRate: "0.04",
  }];
  const parsed = parseBondMarketHistory(input);

  assert.deepEqual(parsed, input);
  assert.notStrictEqual(parsed, input);
  assert.notStrictEqual(parsed[0], input[0]);
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed[0]));
  input[0].cbClose = "99";
  assert.equal(parsed[0].cbClose, "103.5");
  assert.throws(
    () => parseBondMarketHistory([{ ...parsed[0], cbHigh: "102", cbLow: "104" }]),
    /OHLC|high|low/i,
  );
  assert.throws(
    () => parseBondMarketHistory([{ ...parsed[0], cbOpen: "0103" }]),
    /canonical/i,
  );
  assert.throws(
    () => parseBondMarketHistory([parsed[0], structuredClone(parsed[0])]),
    /duplicate/i,
  );
  const sparse = [parsed[0]];
  sparse.length = 2;
  assert.throws(() => parseBondMarketHistory(sparse), /dense/i);
});

test("history merge is append-only and rejects same-day conflicts", () => {
  const existing = parseBondMarketHistory([{
    bondCode: "35221",
    date: "2026-07-29",
    cbOpen: "103.5",
    cbHigh: "103.5",
    cbLow: "103.5",
    cbClose: "103.5",
    cbAverage: "103.5",
    cbChange: "0",
    cbTradingUnits: "1",
    cbTurnover: "103500",
    stockClose: "36.21",
    effectiveConversionPrice: "35",
    conversionValue: "103.46",
    premiumRate: "0.04",
  }]);

  assert.deepEqual(mergeBondMarketHistory(existing, existing), existing);
  assert.throws(
    () => mergeBondMarketHistory(existing, [{ ...existing[0], cbChange: "1" }]),
    /conflict|correction/i,
  );
});

test("migrated legacy history preserves all source values and represents unavailable fields as null", async () => {
  const history = JSON.parse(await readFile(
    new URL("../static-showcase/data/bond-market-history.json", import.meta.url),
    "utf8",
  ));
  const parsed = parseBondMarketHistory(history);
  assert.equal(history.length, 4007);
  assert.equal(parsed.length, 4007);
  const legacyProjection = history.map(({
    bondCode,
    date,
    cbClose,
    stockClose,
    effectiveConversionPrice,
    conversionValue,
    premiumRate,
  }) => ({
    bondCode,
    date,
    cbClose,
    stockClose,
    effectiveConversionPrice,
    conversionValue,
    premiumRate,
  }));
  assert.equal(
    createHash("sha256").update(JSON.stringify(legacyProjection)).digest("hex"),
    "d810b7dbd8ce972139f7f9dfc56cfe9d84647f20f15973ee3e9077461c5d7201",
  );
  for (const point of history) {
    assert.deepEqual(
      [
        point.cbOpen,
        point.cbHigh,
        point.cbLow,
        point.cbAverage,
        point.cbChange,
        point.cbTradingUnits,
        point.cbTurnover,
      ],
      [null, null, null, null, null, null, null],
    );
  }
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

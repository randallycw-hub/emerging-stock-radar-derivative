import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateCandles,
  bollingerBands,
  macd,
  relativeStrengthIndex,
  simpleMovingAverage,
  stochasticKd,
  verifiedDailyCandles,
} from "../static-showcase/assets/bond-technical-analysis.js";

function historyPoint(date, {
  open,
  high,
  low,
  close,
  tradingUnits = "0",
  turnover = "0",
}) {
  return {
    bondCode: "35221",
    date,
    cbOpen: open,
    cbHigh: high,
    cbLow: low,
    cbClose: close,
    cbAverage: null,
    cbChange: null,
    cbTradingUnits: tradingUnits,
    cbTurnover: turnover,
    stockClose: null,
    effectiveConversionPrice: null,
    conversionValue: null,
    premiumRate: null,
  };
}

function candle(date, close, { high = close, low = close } = {}) {
  return {
    periodStart: date,
    periodEnd: date,
    open: close,
    high,
    low,
    close,
    tradingUnits: "1",
    turnover: "1",
  };
}

function dateAt(offset, start = "2026-01-01") {
  const value = new Date(`${start}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

test("daily candles keep only complete verified OHLC days and preserve a gap", () => {
  const points = [
    historyPoint("2026-01-05", {
      open: "101.25",
      high: "103",
      low: "100.5",
      close: "102.75",
      tradingUnits: "8",
      turnover: "822000",
    }),
    historyPoint("2026-01-06", {
      open: null,
      high: null,
      low: null,
      close: null,
      tradingUnits: "0",
      turnover: "0",
    }),
    historyPoint("2026-01-07", {
      open: "102.75",
      high: "104.5",
      low: "102",
      close: "104",
      tradingUnits: "5",
      turnover: "520000",
    }),
  ];
  const before = structuredClone(points);

  assert.deepEqual(verifiedDailyCandles(points), [
    {
      periodStart: "2026-01-05",
      periodEnd: "2026-01-05",
      open: "101.25",
      high: "103",
      low: "100.5",
      close: "102.75",
      tradingUnits: "8",
      turnover: "822000",
    },
    {
      periodStart: "2026-01-07",
      periodEnd: "2026-01-07",
      open: "102.75",
      high: "104.5",
      low: "102",
      close: "104",
      tradingUnits: "5",
      turnover: "520000",
    },
  ]);
  assert.deepEqual(points, before);
});

test("weekly candles use Asia/Taipei Monday weeks across a year boundary", () => {
  const candles = [
    {
      ...candle("2025-12-29", "11", { high: "12", low: "9" }),
      open: "10",
      tradingUnits: "9007199254740993",
      turnover: "9007199254740993000",
    },
    {
      ...candle("2026-01-02", "14", { high: "15", low: "10" }),
      open: "11",
      tradingUnits: "7",
      turnover: "11",
    },
    {
      ...candle("2026-01-05", "20", { high: "21", low: "19" }),
      tradingUnits: "3",
      turnover: "60",
    },
  ];
  const before = structuredClone(candles);

  assert.deepEqual(aggregateCandles(candles, "week"), [
    {
      periodStart: "2025-12-29",
      periodEnd: "2026-01-04",
      open: "10",
      high: "15",
      low: "9",
      close: "14",
      tradingUnits: "9007199254741000",
      turnover: "9007199254740993011",
    },
    {
      periodStart: "2026-01-05",
      periodEnd: "2026-01-11",
      open: "20",
      high: "21",
      low: "19",
      close: "20",
      tradingUnits: "3",
      turnover: "60",
    },
  ]);
  assert.deepEqual(candles, before);
});

test("monthly candles use calendar month boundaries and exact OHLC aggregation", () => {
  assert.deepEqual(aggregateCandles([
    {
      ...candle("2026-01-02", "12", { high: "13", low: "9" }),
      open: "10",
      tradingUnits: "2",
      turnover: "20",
    },
    {
      ...candle("2026-01-30", "11", { high: "15", low: "10" }),
      open: "12",
      tradingUnits: "3",
      turnover: "30",
    },
    {
      ...candle("2026-02-02", "20", { high: "22", low: "18" }),
      tradingUnits: "5",
      turnover: "100",
    },
  ], "month"), [
    {
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      open: "10",
      high: "15",
      low: "9",
      close: "11",
      tradingUnits: "5",
      turnover: "50",
    },
    {
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
      open: "20",
      high: "22",
      low: "18",
      close: "20",
      tradingUnits: "5",
      turnover: "100",
    },
  ]);
});

test("simple moving averages expose null until each full 5, 20, or 60 day window", () => {
  const candles = Array.from({ length: 60 }, (_, index) =>
    candle(dateAt(index, "2026-03-01"), String(index + 1)));

  const ma5 = simpleMovingAverage(candles, 5);
  const ma20 = simpleMovingAverage(candles, 20);
  const ma60 = simpleMovingAverage(candles, 60);

  assert.deepEqual(ma5.slice(0, 6), [null, null, null, null, "3", "4"]);
  assert.deepEqual(ma20.slice(18, 21), [null, "10.5", "11.5"]);
  assert.deepEqual(ma60.slice(58), [null, "30.5"]);
});

test("Bollinger bands use population standard deviation and six-decimal rounding", () => {
  assert.deepEqual(bollingerBands([
    candle("2026-01-01", "1"),
    candle("2026-01-02", "3"),
    candle("2026-01-03", "3"),
  ], 2, 2), [
    { middle: null, upper: null, lower: null },
    { middle: "2", upper: "4", lower: "0" },
    { middle: "3", upper: "3", lower: "3" },
  ]);
  assert.deepEqual(bollingerBands([
    candle("2026-01-01", "0"),
    candle("2026-01-02", "1"),
  ], 2, 1)[1], {
    middle: "0.5",
    upper: "1",
    lower: "0",
  });
});

test("Wilder RSI seeds after the full period and smooths gains and losses", () => {
  const candles = ["1", "2", "3", "4", "3", "2", "4"].map((close, index) =>
    candle(`2026-01-0${index + 1}`, close));

  assert.deepEqual(relativeStrengthIndex(candles, 3), [
    null,
    null,
    null,
    "100",
    "66.666667",
    "44.444444",
    "72.222222",
  ]);
  assert.deepEqual(relativeStrengthIndex([
    candle("2026-02-01", "5"),
    candle("2026-02-02", "5"),
    candle("2026-02-03", "5"),
    candle("2026-02-04", "5"),
  ], 3), [null, null, null, "50"]);
});

test("stochastic KD uses a lookback range with neutral 50 seeds", () => {
  const ranged = [
    candle("2026-01-01", "2", { high: "10", low: "0" }),
    candle("2026-01-02", "5", { high: "10", low: "0" }),
    candle("2026-01-03", "8", { high: "10", low: "0" }),
    candle("2026-01-04", "10", { high: "10", low: "0" }),
  ];

  assert.deepEqual(stochasticKd(ranged, 3, 3, 3), [
    { k: null, d: null },
    { k: null, d: null },
    { k: "60", d: "53.333333" },
    { k: "73.333333", d: "60" },
  ]);
  assert.deepEqual(stochasticKd([
    candle("2026-02-01", "5"),
    candle("2026-02-02", "5"),
    candle("2026-02-03", "5"),
  ], 3, 3, 3)[2], { k: "50", d: "50" });
});

test("MACD seeds both EMAs and its signal line from complete SMA windows", () => {
  const candles = ["1", "2", "4", "8", "16"].map((close, index) =>
    candle(`2026-01-0${index + 1}`, close));

  assert.deepEqual(macd(candles, 2, 3, 2), [
    { macd: null, signal: null, histogram: null },
    { macd: null, signal: null, histogram: null },
    { macd: "0.833333", signal: null, histogram: null },
    { macd: "1.222222", signal: "1.027778", histogram: "0.194444" },
    { macd: "2.212963", signal: "1.817901", histogram: "0.395062" },
  ]);
});

test("indicator results contain only numeric strings or null and no trading advice", () => {
  const candles = Array.from({ length: 30 }, (_, index) =>
    candle(dateAt(index, "2026-04-01"), String(100 + index)));
  const output = {
    movingAverage: simpleMovingAverage(candles, 5),
    bollinger: bollingerBands(candles),
    rsi: relativeStrengthIndex(candles),
    stochastic: stochasticKd(candles),
    macd: macd(candles),
  };
  const values = [];
  JSON.parse(JSON.stringify(output), (_key, value) => {
    if (typeof value === "string") values.push(value);
    return value;
  });

  assert.ok(values.every((value) => /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)));
  assert.doesNotMatch(values.join(" "), /advice|buy|sell|signal|買點|賣點|黃金交叉/i);
});

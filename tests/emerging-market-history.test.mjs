import assert from "node:assert/strict";
import test from "node:test";

import { buildEmergingWeeklyMetrics } from "../lib/market-data/emerging-market-history.ts";

test("uses the last valid average in the prior complete week as the weekly baseline", () => {
  const result = buildEmergingWeeklyMetrics([
    { tradingDate: "2026-08-14", dailyAveragePrice: "100", transactionVolume: "10" },
    { tradingDate: "2026-08-20", dailyAveragePrice: "110", transactionVolume: "10" },
    { tradingDate: "2026-08-24", dailyAveragePrice: "120", transactionVolume: "10" },
  ], "2026-08-24");

  assert.deepEqual(result, {
    lastWeekAverage: "110",
    weeklyChange: "10",
    weeklyChangePercent: "9.09",
  });
});

test("does not calculate a weekly change for a no-trade current row", () => {
  const result = buildEmergingWeeklyMetrics([
    { tradingDate: "2026-08-20", dailyAveragePrice: "110", transactionVolume: "10" },
    { tradingDate: "2026-08-24", dailyAveragePrice: null, transactionVolume: "0" },
  ], "2026-08-24");

  assert.deepEqual(result, {
    lastWeekAverage: "110",
    weeklyChange: null,
    weeklyChangePercent: null,
  });
});

test("returns null metrics when there is no official prior-week trading average", () => {
  const result = buildEmergingWeeklyMetrics([
    { tradingDate: "2026-08-24", dailyAveragePrice: "120", transactionVolume: "10" },
  ], "2026-08-24");

  assert.deepEqual(result, {
    lastWeekAverage: null,
    weeklyChange: null,
    weeklyChangePercent: null,
  });
});

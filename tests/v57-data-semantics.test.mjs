import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateRollingMetrics,
  normalizeIpoPublicPrice,
  resolveTradeState,
} from "../lib/market-data/v57-semantics.ts";

test("V5.7 distinguishes unpublished IPO prices from verified positive prices", () => {
  assert.equal(normalizeIpoPublicPrice(0, "unpublished"), null);
  assert.equal(normalizeIpoPublicPrice("0", "provisional"), null);
  assert.equal(normalizeIpoPublicPrice(56, "final"), 56);
  assert.equal(normalizeIpoPublicPrice("25.5", "minimum_bid"), 25.5);
  assert.equal(normalizeIpoPublicPrice(0, "verified_zero"), 0);
});

test("V5.7 compares latest CB trade date against the public snapshot date", () => {
  assert.deepEqual(resolveTradeState({
    latestTradeDate: "2026-08-11",
    dataDate: "2026-08-28",
    lastPrice: 196,
    lastVolume: 1,
  }), {
    state: "NO_TRADE_TODAY",
    lastTradeDate: "2026-08-11",
    lastPrice: 196,
    lastVolume: 1,
  });
  assert.equal(resolveTradeState({
    latestTradeDate: "2026-08-28",
    dataDate: "2026-08-28",
    lastPrice: 100,
    lastVolume: 8,
  }).state, "TRADED_TODAY");
  assert.equal(resolveTradeState({
    latestTradeDate: "2026-08-28",
    dataDate: "2026-08-28",
    lastPrice: 100,
    lastVolume: 0,
  }).state, "NO_TRADE_TODAY");
});

test("V5.7 rolling metrics preserve insufficient samples as null", () => {
  const insufficient = calculateRollingMetrics([{ date: "2026-08-28", volume: 10, amount: 1000 }]);
  assert.equal(insufficient.average5, null);
  assert.equal(insufficient.average20, null);
  assert.equal(insufficient.volumeRatio, null);
  assert.equal(insufficient.amountChange, null);

  const fiveSessions = Array.from({ length: 5 }, (_, index) => ({
    date: `2026-08-${String(index + 21).padStart(2, "0")}`,
    volume: 10 + index,
    amount: 1000 + index * 100,
  }));
  assert.equal(calculateRollingMetrics(fiveSessions).average5, 12);
  assert.equal(calculateRollingMetrics(fiveSessions).average20, null);
});

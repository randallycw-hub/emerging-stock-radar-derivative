import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatePeriodReturn,
  selectValidPeriodBaseline,
} from "../lib/market-data/v56-performance.ts";

const sessions = Object.freeze([
  { tradeDate: "2026-08-03", close: 100 },
  { tradeDate: "2026-08-04", close: 101 },
  { tradeDate: "2026-08-05", close: 102 },
  { tradeDate: "2026-08-06", close: 103 },
  { tradeDate: "2026-08-07", close: 104 },
  { tradeDate: "2026-08-10", close: 105 },
]);

test("uses the fifth prior valid session for one-week return", () => {
  assert.equal(selectValidPeriodBaseline(sessions, "1W")?.tradeDate, "2026-08-03");
  assert.equal(calculatePeriodReturn(sessions, "1W"), 0.05);
});

test("returns null rather than a fabricated return for insufficient or zero baseline history", () => {
  assert.equal(calculatePeriodReturn(sessions.slice(-5), "1W"), null);
  assert.equal(calculatePeriodReturn([{ tradeDate: "2026-08-03", close: 0 }, ...sessions.slice(1)], "1W"), null);
});

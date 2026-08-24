import assert from "node:assert/strict";
import test from "node:test";

import { emergingDailyAverageLabel } from "../static-showcase/assets/emerging-market-display.js";

test("labels a zero-volume row with no daily average as no trade", () => {
  assert.equal(emergingDailyAverageLabel({ dailyAveragePrice: null, transactionVolume: "0" }), "今日無成交");
});

test("does not label unavailable market data as no trade", () => {
  assert.equal(emergingDailyAverageLabel({ dailyAveragePrice: null, transactionVolume: null }), "—");
});

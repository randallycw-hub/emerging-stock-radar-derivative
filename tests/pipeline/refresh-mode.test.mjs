import assert from "node:assert/strict";
import test from "node:test";

import {
  parseRefreshMode,
  refreshSchedule,
  shouldPublishMarketCandidate,
} from "../../lib/pipeline/refresh-mode.ts";

test("accepts only the five named Taiwan market refresh modes", () => {
  assert.deepEqual(["FAST", "OFFICIAL", "EVENT", "RECONCILE", "WEEKLY"].map(parseRefreshMode), [
    "FAST", "OFFICIAL", "EVENT", "RECONCILE", "WEEKLY",
  ]);
  assert.throws(() => parseRefreshMode("NIGHTLY"), /refresh mode/i);
});

test("declares every scheduled Taiwan-time run without using UTC display times", () => {
  assert.deepEqual(refreshSchedule(), [
    { mode: "FAST", taipeiTime: "16:15", tradingDaysOnly: true },
    { mode: "OFFICIAL", taipeiTime: "17:45", tradingDaysOnly: true },
    { mode: "EVENT", taipeiTime: "22:30", tradingDaysOnly: false },
    { mode: "RECONCILE", taipeiTime: "07:30", tradingDaysOnly: true },
    { mode: "WEEKLY", taipeiTime: "10:00", tradingDaysOnly: false, taipeiWeekday: "Saturday" },
  ]);
});

test("permits market publication only when an official date advances on a trading-day mode", () => {
  assert.equal(shouldPublishMarketCandidate({
    mode: "OFFICIAL",
    requestedDate: "2026-08-24",
    officialDataDate: "2026-08-24",
    previousPublishedDate: "2026-08-22",
  }), true);
  assert.equal(shouldPublishMarketCandidate({
    mode: "OFFICIAL",
    requestedDate: "2026-08-24",
    officialDataDate: "2026-08-22",
    previousPublishedDate: "2026-08-22",
  }), false);
  assert.equal(shouldPublishMarketCandidate({
    mode: "EVENT",
    requestedDate: "2026-08-24",
    officialDataDate: "2026-08-22",
    previousPublishedDate: "2026-08-22",
  }), false);
});

import assert from "node:assert/strict";
import test from "node:test";

import { resolveBondStatus } from "../lib/market-data/bond-status.ts";

function status(overrides = {}) {
  return resolveBondStatus({
    maturityDate: "2030-12-31",
    delistingDate: null,
    redemptionDate: null,
    conversionSuspended: false,
    tradingSuspended: false,
    tradingUnits: "12",
    quoteDate: "2026-08-25",
    dataConflict: false,
    ...overrides,
  }, "2026-08-25");
}

test("terminal lifecycle dates take precedence over all trade conditions", () => {
  assert.equal(status({ maturityDate: "2026-08-25", tradingUnits: "0" }), "MATURED");
  assert.equal(status({ delistingDate: "2026-08-24", maturityDate: "2026-08-25" }), "DELISTED");
  assert.equal(status({ redemptionDate: "2026-08-25", conversionSuspended: true }), "REDEMPTION_PROCESS");
});

test("suspension and data integrity conditions precede no-trade and active status", () => {
  assert.equal(status({ conversionSuspended: true, tradingUnits: "0" }), "CONVERSION_SUSPENDED");
  assert.equal(status({ tradingSuspended: true, tradingUnits: "0" }), "TRADING_SUSPENDED");
  assert.equal(status({ dataConflict: true, tradingUnits: "0" }), "DATA_CONFLICT");
  assert.equal(status({ quoteDate: "2026-08-22", tradingUnits: "0" }), "STALE");
  assert.equal(status({ tradingUnits: "0" }), "NO_TRADE");
  assert.equal(status(), "ACTIVE");
});

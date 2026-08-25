import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeConversionPriceVersions,
  selectEffectiveConversionPrice,
} from "../lib/market-data/conversion-price-history.ts";

function version(effectiveDate, currentConversionPrice, overrides = {}) {
  return {
    bondCode: "35221",
    issuerCode: "3522",
    initialConversionPrice: "40",
    currentConversionPrice,
    effectiveDate,
    officialDetailUrl: "https://mopsov.twse.com.tw/mops/web/t120sg01?bond_id=35221&issuer_stock_code=3522",
    ...overrides,
  };
}

test("selects only the newest conversion price already effective on the valuation date", () => {
  const versions = [
    version("2026-01-01", "40"),
    version("2026-07-01", "35"),
    version("2026-09-01", "32"),
  ];

  assert.equal(selectEffectiveConversionPrice(versions, "2025-12-31"), null);
  assert.equal(selectEffectiveConversionPrice(versions, "2026-07-01")?.currentConversionPrice, "35");
  assert.equal(selectEffectiveConversionPrice(versions, "2026-08-31")?.currentConversionPrice, "35");
});

test("merges immutable versions by bond identity and rejects an effective-date conflict", () => {
  const previous = [version("2026-01-01", "40")];
  const current = [version("2026-07-01", "35")];
  assert.deepEqual(
    mergeConversionPriceVersions(previous, current).map((item) => item.effectiveDate),
    ["2026-01-01", "2026-07-01"],
  );
  assert.throws(
    () => mergeConversionPriceVersions(previous, [version("2026-01-01", "39")]),
    /conflicting conversion price version/i,
  );
});

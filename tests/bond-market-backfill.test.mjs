import assert from "node:assert/strict";
import test from "node:test";

import {
  latestTwelveMonths,
  selectIssuerMarkets,
} from "../scripts/backfill-bond-market-history.mjs";

test("backfill covers exactly the current and prior eleven calendar months", () => {
  assert.deepEqual(latestTwelveMonths("2026-07-30"), [
    "2025-08", "2025-09", "2025-10", "2025-11",
    "2025-12", "2026-01", "2026-02", "2026-03",
    "2026-04", "2026-05", "2026-06", "2026-07",
  ]);
});

test("backfill selects one verified market per issuer and rejects ambiguity", () => {
  assert.deepEqual(selectIssuerMarkets([
    { companyCode: "2330", market: "listed" },
    { companyCode: "3522", market: "otc" },
    { companyCode: "3522", market: "otc" },
  ]), new Map([
    ["2330", "listed"],
    ["3522", "otc"],
  ]));

  assert.throws(
    () => selectIssuerMarkets([
      { companyCode: "3522", market: "listed" },
      { companyCode: "3522", market: "otc" },
    ]),
    /ambiguous issuer market/,
  );
});

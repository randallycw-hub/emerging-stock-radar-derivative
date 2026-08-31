import assert from "node:assert/strict";
import test from "node:test";

import { buildV57Performance } from "../lib/market-data/v57-performance.ts";

function snapshot(date, price, volume = 100, offerPrice = 20) {
  return {
    dataDate: date,
    cbMaster: { records: [{ cbCode: "90001" }] },
    priceHistory: { records: [{ cbCode: "90001", tradeDate: date, close: price }] },
    emerging: { records: [{ stockCode: "7777", companyName: "興櫃甲", tradingDate: date, dailyAveragePrice: price, dailyVolume: volume, transactionAmount: price * volume }] },
    stockPriceHistory: { records: [{ stockCode: "1234", tradeDate: date, close: price, volume, value: price * volume }] },
    ipoPipeline: { records: [
      { stockCode: "1234", companyName: "IPO甲", listingDate: "2026-08-01", offerPrice },
      { stockCode: "5678", companyName: "IPO乙", listingDate: "2026-08-01", offerPrice: null, minimumBidPrice: 18 },
    ] },
  };
}

test("V5.7 performance uses verified trade sessions and leaves insufficient windows as null", () => {
  const snapshots = [
    snapshot("2026-08-03", 100), snapshot("2026-08-04", 101), snapshot("2026-08-05", 102),
    snapshot("2026-08-06", 103), snapshot("2026-08-07", 104), snapshot("2026-08-10", 105),
  ];
  const performance = buildV57Performance(snapshots);
  const emerging = performance.find((row) => row.entityType === "emerging" && row.stockCode === "7777");

  assert.equal(emerging.periods["1W"], 0.05);
  assert.equal(emerging.metrics["1W"].denominator, 100);
  assert.deepEqual(emerging.metrics["1W"].sourceDates, ["2026-08-03", "2026-08-10"]);
  assert.equal(emerging.periods["6M"], null);
  assert.equal(emerging.liquidity.average20Volume, null);
});

test("V5.7 IPO since-listing performance requires a released actual offer price, never the minimum bid", () => {
  const performance = buildV57Performance([snapshot("2026-08-10", 30)]);
  const verified = performance.find((row) => row.entityType === "ipo" && row.stockCode === "1234");
  const missingOffer = performance.find((row) => row.entityType === "ipo" && row.stockCode === "5678");

  assert.equal(verified.periods.sinceListing, 0.5);
  assert.equal(verified.metrics.sinceListing.denominator, 20);
  assert.equal(missingOffer.periods.sinceListing, null);
  assert.equal(missingOffer.metrics.sinceListing, null);
});

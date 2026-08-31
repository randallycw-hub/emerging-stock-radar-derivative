import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPublishedEmergingBreadth,
  mapV56EmergingRows,
} from "../static-showcase/assets/v56-page-data.js";

test("V5.6 emerging page mapper uses the shared public model without converting missing values to zero", () => {
  const rows = mapV56EmergingRows({
    schemaVersion: 3,
    dataDate: "2026-08-28",
    emerging: { records: [{
      stockCode: "7777", companyName: "測試興櫃", industryName: "半導體業", tradingDate: "2026-08-28",
      dailyAveragePrice: 102, previousAveragePrice: null, dailyHighPrice: 103, dailyLowPrice: 99,
      averageChange: null, averageChangePercent: null, direction: null, dailyVolume: 150, transactionAmount: 15300,
      applyingDate: null, applyingStatus: null,
    }] },
  });
  assert.deepEqual(rows, [{
    companyCode: "7777", companyName: "測試興櫃", industryName: "半導體業", tradingDate: "2026-08-28",
    dailyAveragePrice: 102, previousAveragePrice: null, dailyHighPrice: 103, dailyLowPrice: 99,
    averageChange: null, averageChangePercent: null, direction: null, transactionVolume: 150, estimatedTransactionAmount: 15300,
    applyingDate: null, applyingStatus: null,
  }]);
});

test("V5.6 mapper refuses a non-V5.6 model", () => {
  assert.deepEqual(mapV56EmergingRows({ schemaVersion: 2, emerging: { records: [] } }), []);
});

test("V5.6 emerging breadth totals published samples without inventing a zero for an unavailable record", () => {
  assert.deepEqual(buildPublishedEmergingBreadth([
    { dailyAveragePrice: 10, transactionVolume: 50, estimatedTransactionAmount: 500 },
    { dailyAveragePrice: 11, transactionVolume: null, estimatedTransactionAmount: null },
    { dailyAveragePrice: null, transactionVolume: 0, estimatedTransactionAmount: 0 },
  ]), {
    effective: 2,
    traded: 1,
    lowLiquidity: 1,
    totalVolume: 50,
    totalAmount: 500,
  });
});

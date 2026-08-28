import assert from "node:assert/strict";
import test from "node:test";

import { buildDashboardHealth, buildHomeSummary, buildObjectiveRankings } from "../static-showcase/assets/home-page.js";

test("dashboard health translates published availability without technical diagnostics", () => {
  assert.deepEqual(buildDashboardHealth({ dataDate: "2026-08-26", dataAvailable: true }), {
    label: "資料已發布",
    detail: "資料日期 2026-08-26",
  });
  assert.deepEqual(buildDashboardHealth({ dataDate: null, dataAvailable: false }), {
    label: "公開資料尚未提供",
    detail: "資料日期 —",
  });
});

test("home summary provides the PDF's objective market metrics", () => {
  assert.deepEqual(buildHomeSummary({
    asOfDate: "2026-08-24",
    emerging: [
      { companyCode: "1260", transactionVolume: 12, estimatedTransactionAmount: 1_200, direction: "up", listingDate: "2026-08-24" },
      { companyCode: "1261", transactionVolume: 0, estimatedTransactionAmount: 0, direction: "down", lowLiquidity: true },
    ],
    ipo: { records: [
      { companyCode: "1234", stage: "A", events: [{ date: "2026-08-26", label: "審議" }] },
      { companyCode: "2345", stage: "D", events: [{ date: "2026-08-28", label: "競拍開始" }, { date: "2026-09-10", label: "掛牌" }] },
      { companyCode: "3456", stage: "withdrawn", events: [{ date: "2026-08-25", label: "撤件" }] },
    ] },
    bonds: { records: [
      { status: "active", cbTradeUnits: 4, cbTurnoverAmount: 4_000, listingDate: "2026-08-10", events: [{ date: "2026-09-01", type: "put" }] },
      { status: "active", cbTradeUnits: 0, cbTurnoverAmount: 0, listingDate: "2026-05-01" },
      { status: "archived", cbTradeUnits: 5, cbTurnoverAmount: 5_000 },
    ] },
  }), {
    emerging: {
      marketCount: 2,
      tradedCount: 1,
      totalTurnover: 1_200,
      upCount: 1,
      downCount: 1,
      newListingCount: 1,
      lowLiquidityCount: 1,
    },
    ipo: {
      activeCases: 2,
      upcomingReviews: 1,
      auctionOrSubscription7d: 1,
      plannedListings30d: 1,
    },
    bonds: {
      activeCount: 2,
      tradedCount: 1,
      totalTurnover: 4_000,
      events30d: 1,
      recentListings: 1,
    },
    emergingCount: 2,
    ipoCount: 3,
    activeBondCount: 2,
  });
});

test("home summary keeps unavailable markets distinct from a verified zero", () => {
  assert.deepEqual(buildHomeSummary({}), {
    emerging: null,
    ipo: null,
    bonds: null,
    emergingCount: null,
    ipoCount: null,
    activeBondCount: null,
  });
});

test("objective rankings name the ordered public metric and never issue advice", () => {
  const rankings = buildObjectiveRankings({
    emerging: [{ companyCode: "1260", companyName: "甲", transactionVolume: 20, estimatedTransactionAmount: 400, averageChangePercent: 3.2, weeklyChangePercent: 5.1 }],
    bonds: [{ bondCode: "12601", bondName: "甲一", cbTradeUnits: 8, cbTurnoverAmount: 600, premiumRate: 4.5, outstandingReductionRate: 20 }],
  });

  assert.deepEqual(rankings.map((ranking) => ranking.label), [
    "興櫃成交金額前 10",
    "興櫃成交量前 10",
    "興櫃日均價漲幅前 10",
    "興櫃週漲幅前 10",
    "CB 成交量前 10",
    "CB 成交金額前 10",
    "CB 轉換溢價率排序",
    "CB 流通餘額變化排序",
  ]);
  assert.equal(JSON.stringify(rankings).match(/推薦|買進|賣出|評分/) === null, true);
});

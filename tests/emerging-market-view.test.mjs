import assert from "node:assert/strict";
import test from "node:test";

import { buildEmergingMarketViews } from "../lib/market-data/emerging-market-view.ts";

function row(overrides = {}) {
  return {
    tradingDate: "2026-07-30",
    publishedTime: "14:00:06",
    companyCode: "1260",
    companyName: "台灣虎航",
    previousAveragePrice: "25.29",
    dailyAveragePrice: "25.45",
    dailyHighPrice: "26.5",
    dailyLowPrice: "25.2",
    transactionVolume: "22001",
    applyingDate: null,
    applyingStatus: null,
    ...overrides,
  };
}

test("builds an exact company-code industry join and deterministic post-market values", () => {
  const [view] = buildEmergingMarketViews({
    marketRows: [row()],
    companyRows: [
      { companyCode: "126", companyName: "不同公司", industryName: "錯誤產業" },
      { companyCode: "1260", companyName: "台灣虎航", industryName: "航運業" },
    ],
  });

  assert.deepEqual(view, {
    tradingDate: "2026-07-30",
    companyCode: "1260",
    companyName: "台灣虎航",
    industryName: "航運業",
    dailyAveragePrice: "25.45",
    previousAveragePrice: "25.29",
    dailyHighPrice: "26.5",
    dailyLowPrice: "25.2",
    averageChange: "0.16",
    averageChangePercent: "0.63",
    direction: "up",
    transactionVolume: "22001",
    estimatedTransactionAmount: "559925.45",
    applyingDate: null,
    applyingStatus: null,
  });
});

test("uses null industry only when the exact company code has no match", () => {
  const [view] = buildEmergingMarketViews({
    marketRows: [row({ companyCode: "1261", companyName: "未分類公司" })],
    companyRows: [
      { companyCode: "1260", companyName: "台灣虎航", industryName: "航運業" },
    ],
  });

  assert.equal(view.industryName, null);
});

test("calculates from parser-accepted grouped numeric source strings without changing them", () => {
  const [view] = buildEmergingMarketViews({
    marketRows: [row({
      previousAveragePrice: "1,000.00",
      dailyAveragePrice: "1,000.25",
      transactionVolume: "22,001",
    })],
    companyRows: [],
  });

  assert.deepEqual(
    {
      previousAveragePrice: view.previousAveragePrice,
      dailyAveragePrice: view.dailyAveragePrice,
      transactionVolume: view.transactionVolume,
      averageChange: view.averageChange,
      averageChangePercent: view.averageChangePercent,
      estimatedTransactionAmount: view.estimatedTransactionAmount,
    },
    {
      previousAveragePrice: "1,000.00",
      dailyAveragePrice: "1,000.25",
      transactionVolume: "22,001",
      averageChange: "0.25",
      averageChangePercent: "0.03",
      estimatedTransactionAmount: "22006500.25",
    },
  );
});

test("returns unavailable derived change values when a source price is missing or prior price is zero", () => {
  const views = buildEmergingMarketViews({
    marketRows: [
      row({ companyCode: "1001", dailyAveragePrice: null }),
      row({ companyCode: "1002", previousAveragePrice: null }),
      row({ companyCode: "1003", previousAveragePrice: "0" }),
    ],
    companyRows: [],
  });

  assert.deepEqual(
    views.map((view) => ({
      companyCode: view.companyCode,
      averageChange: view.averageChange,
      averageChangePercent: view.averageChangePercent,
      direction: view.direction,
    })),
    [
      { companyCode: "1001", averageChange: null, averageChangePercent: null, direction: "unavailable" },
      { companyCode: "1002", averageChange: null, averageChangePercent: null, direction: "unavailable" },
      { companyCode: "1003", averageChange: "25.45", averageChangePercent: null, direction: "up" },
    ],
  );
});

test("does not combine records across dates and sorts the public read model by company code", () => {
  const views = buildEmergingMarketViews({
    marketRows: [
      row({ tradingDate: "2026-07-31", companyCode: "2000", dailyAveragePrice: "30", previousAveragePrice: "29" }),
      row({ tradingDate: "2026-07-30", companyCode: "3000", dailyAveragePrice: "10", previousAveragePrice: "9" }),
      row({ tradingDate: "2026-07-30", companyCode: "1000", dailyAveragePrice: "20", previousAveragePrice: "20" }),
    ],
    companyRows: [],
  });

  assert.deepEqual(
    views.map((view) => [view.tradingDate, view.companyCode, view.averageChange, view.direction]),
    [
      ["2026-07-30", "1000", "0", "flat"],
      ["2026-07-31", "2000", "1", "up"],
      ["2026-07-30", "3000", "1", "up"],
    ],
  );
});

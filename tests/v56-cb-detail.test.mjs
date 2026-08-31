import assert from "node:assert/strict";
import test from "node:test";

import { CB_DETAIL_TABS, renderCbDetailV53 } from "../static-showcase/assets/cb-detail-v53.js";

const record = {
  cbCode: "23032",
  cbName: "聯電二",
  stockCode: "2303",
  companyName: "聯電",
  status: "active",
  quote: { cbClose: 102, stockClose: 50, conversionPrice: 45, conversionValue: 111, premiumRate: -8, dataDate: "2026-08-28", tradeState: "traded", volume: 123, turnoverAmount: 120000 },
  liquidity: {},
  terms: {},
  events: [],
};

test("V5.6 CB detail uses the required factual tabs and an official OHLCV chart host", () => {
  const html = renderCbDetailV53(record, {
    history: [{ bondCode: "23032", date: "2026-08-28", cbOpen: "100", cbHigh: "104", cbLow: "99", cbClose: "102", cbTradingUnits: "123" }],
  });
  assert.deepEqual(CB_DETAIL_TABS.map(([key]) => key), ["overview", "valuation", "liquidity", "terms", "period", "events"]);
  assert.match(html, /data-cb-lightweight-chart/);
  assert.match(html, /概況/);
  assert.match(html, /估值/);
  assert.doesNotMatch(html, /MACD|RSI|KDJ|BOLL|MA5/);
});

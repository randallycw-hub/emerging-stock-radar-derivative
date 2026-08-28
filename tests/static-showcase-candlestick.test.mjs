import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  chartDataState,
  toKlineData,
} from "../static-showcase/assets/klinechart-adapter.js";
import { summarizeVerifiedOhlcv } from "../static-showcase/assets/bond-technical-analysis.js";
import { bindBondDetail, renderBondDetail } from "../static-showcase/assets/bond-detail-page.js";

function point(date, values = {}) {
  return {
    bondCode: "35221",
    date,
    cbOpen: "100",
    cbHigh: "103",
    cbLow: "99",
    cbClose: "102",
    cbTradingUnits: "8",
    cbTurnover: "816000",
    ...values,
  };
}

test("V5 only permits complete verified OHLCV points into a chart adapter", () => {
  assert.deepEqual(summarizeVerifiedOhlcv([
    point("2026-01-05"),
    point("2026-01-06", { cbOpen: null, cbHigh: null, cbLow: null, cbClose: "102" }),
  ]), {
    completePoints: 1,
    dateRange: ["2026-01-05", "2026-01-05"],
  });
  assert.equal(chartDataState([point("2026-01-06", { cbOpen: null })]), "empty");
});

test("V5 weekly and monthly chart data aggregate only verified daily candles", () => {
  const history = [
    point("2026-01-05", { cbOpen: "100", cbHigh: "103", cbLow: "99", cbClose: "102", cbTradingUnits: "8" }),
    point("2026-01-06", { cbOpen: "102", cbHigh: "106", cbLow: "101", cbClose: "105", cbTradingUnits: "5" }),
    point("2026-01-07", { cbOpen: null, cbHigh: null, cbLow: null, cbClose: "105", cbTradingUnits: "3" }),
  ];
  assert.deepEqual(toKlineData(history, { period: "week" }), [{
    timestamp: Date.parse("2026-01-05T00:00:00+08:00"),
    open: 100,
    high: 106,
    low: 99,
    close: 105,
    volume: 13,
  }]);
  assert.equal(toKlineData(history, { period: "month" }).length, 1);
});

test("V5 detail binding lazy-loads the KLineChart adapter and keeps serialized verified history", async () => {
  const script = await readFile(new URL("../static-showcase/assets/bond-detail-page.js", import.meta.url), "utf8");
  assert.match(script, /mountKlineChart/);
  assert.match(script, /data-bond-kline-host/);
  assert.doesNotMatch(script, /bindCandlestickChart/);

  const cleanup = bindBondDetail({ querySelector: () => null, querySelectorAll: () => [] }, () => {});
  assert.equal(typeof cleanup, "function");
  const html = renderBondDetail({ bondCode: "35221", history: [point("2026-01-05")], events: [], view: {}, term: {}, assessment: {} });
  assert.match(html, /"cbOpen":"100"/);
  assert.doesNotMatch(html, /<canvas/);
});

test("V5 bond detail supplies the selected bond's verified history to the serialized K-line payload", async () => {
  const page = await readFile(new URL("../static-showcase/assets/bonds-page.js", import.meta.url), "utf8");
  assert.match(page, /const detailHistory = state\.history\.filter\(\(point\) => point\.bondCode === code\);/);
  assert.match(page, /renderBondDetail\(\{ \.\.\.detail, history: detailHistory \}/);
});

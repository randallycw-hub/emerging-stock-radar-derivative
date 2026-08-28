import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChartModel,
  buildEventMarkers,
  chartPalette,
  selectVisibleEventMarkers,
  selectVisibleCandles,
} from "../static-showcase/assets/bond-candlestick-chart.js";
import { bindBondDetail, renderBondDetail } from "../static-showcase/assets/bond-detail-page.js";
import { summarizeVerifiedOhlcv } from "../static-showcase/assets/bond-technical-analysis.js";

function point(date, values = {}) {
  return {
    bondCode: "35221", date,
    cbOpen: "100", cbHigh: "103", cbLow: "99", cbClose: "102",
    cbTradingUnits: "8", cbTurnover: "816000",
    ...values,
  };
}

test("chart model preserves missing-OHLC dates as gaps and exposes hover payloads", () => {
  const model = buildChartModel({
    history: [
      point("2026-01-05"),
      point("2026-01-06", { cbOpen: null, cbHigh: null, cbLow: null, cbClose: null, cbTradingUnits: "0" }),
      point("2026-01-07", { cbOpen: "102", cbHigh: "106", cbLow: "101", cbClose: "105", cbTradingUnits: "5" }),
    ],
    range: "6M",
  });

  assert.equal(model.candles.length, 3);
  assert.equal(model.candles[1].candle, null);
  assert.deepEqual(model.hoverPayload(2), {
    date: "2026-01-07", open: "102", high: "106", low: "101", close: "105", volume: "5",
  });
  assert.equal(model.movingAverages.ma5[2], null);
  assert.equal(model.status, "資料累積中");
});

test("V5 only permits complete verified OHLCV points into a chart adapter", () => {
  assert.deepEqual(summarizeVerifiedOhlcv([
    point("2026-01-05"),
    point("2026-01-06", {
      cbOpen: null,
      cbHigh: null,
      cbLow: null,
      cbClose: "102",
    }),
  ]), {
    completePoints: 1,
    dateRange: ["2026-01-05", "2026-01-05"],
  });
});

test("chart model uses the shared indicator implementation for period aggregation and unavailable values", () => {
  const history = Array.from({ length: 21 }, (_, index) => point(
    `2026-01-${String(index + 1).padStart(2, "0")}`,
    { cbClose: String(100 + index), cbHigh: String(101 + index), cbLow: String(99 + index) },
  ));
  const week = buildChartModel({ history, period: "week", range: "6M" });
  const month = buildChartModel({ history, period: "month", range: "6M" });

  assert.equal(week.candles.length, 4);
  assert.equal(month.candles.length, 1);
  assert.equal(month.movingAverages.ma20[0], null);
  assert.equal(month.indicators.bollinger[0].upper, null);
  assert.equal(month.indicators.rsi[0], null);
  assert.equal(month.indicators.kd[0].k, null);
  assert.equal(month.indicators.macd[0].macd, null);
  assert.deepEqual(Object.keys(month.indicators), ["bollinger", "rsi", "kd", "macd"]);
});

test("visible-candle selection has bounded viewport work for long histories", () => {
  const candles = Array.from({ length: 1200 }, (_, index) => ({
    date: new Date(Date.UTC(2023, 0, 1 + index)).toISOString().slice(0, 10), candle: { close: "100" },
  }));
  const visible = selectVisibleCandles(candles, { range: "3Y", viewport: { start: 1100, end: 1132 } });
  assert.equal(visible.length, 33);
  assert.equal(visible[0].index, 1100);
  assert.equal(visible.at(-1).index, 1132);
});

test("event markers stack same-date public event kinds and chart records stay available after archive", () => {
  const events = [
    { eventId: "a", date: "2026-01-05", type: "conversion_adjustment", title: "轉換價調整" },
    { eventId: "b", date: "2026-01-05", type: "ex_dividend", title: "除息" },
    { eventId: "c", date: "2026-01-06", type: "maturity", title: "到期" },
  ];
  const markers = buildEventMarkers(events, [{ date: "2026-01-05" }, { date: "2026-01-06" }]);
  assert.deepEqual(markers.map(({ eventId, stackIndex, type }) => ({ eventId, stackIndex, type })), [
    { eventId: "a", stackIndex: 0, type: "conversion_adjustment" },
    { eventId: "b", stackIndex: 1, type: "ex_dividend" },
    { eventId: "c", stackIndex: 0, type: "maturity" },
  ]);
  assert.equal(buildChartModel({ history: [point("2026-01-05")], events, archived: true }).archived, true);
  assert.doesNotMatch(JSON.stringify(markers), /buy|sell|signal|買點|賣點/i);
});

test("viewport marker selection omits offscreen markers and exposes kind, title, and stack position", () => {
  const markers = buildEventMarkers([
    { eventId: "past", date: "2026-01-01", type: "put", title: "賣回權日" },
    { eventId: "current", date: "2026-02-02", type: "redemption", title: "提前贖回" },
    { eventId: "same-day", date: "2026-02-02", type: "maturity", title: "到期" },
  ], [{ date: "2026-01-01" }, { date: "2026-02-02" }]);
  const visible = selectVisibleEventMarkers(markers, [{ date: "2026-02-02" }]);
  assert.deepEqual(visible.map(({ eventId, stackIndex, accessibleLabel }) => ({ eventId, stackIndex, accessibleLabel })), [
    { eventId: "current", stackIndex: 0, accessibleLabel: "提前贖回（redemption）" },
    { eventId: "same-day", stackIndex: 1, accessibleLabel: "到期（maturity）" },
  ]);
});

test("gap hover reports its date and unavailable OHLC rather than returning a generic prompt", () => {
  const model = buildChartModel({ history: [
    point("2026-01-05"),
    point("2026-01-06", { cbOpen: null, cbHigh: null, cbLow: null, cbClose: null }),
  ] });
  assert.deepEqual(model.hoverPayload(1), {
    date: "2026-01-06", unavailable: true, message: "OHLC 資料尚未提供",
  });
});

test("chart palette uses theme variables instead of hard-coded dark-theme-unsafe colors", () => {
  const palette = chartPalette();
  assert.equal(palette.up, "var(--chart-up)");
  assert.equal(palette.down, "var(--chart-down)");
  assert.deepEqual(Object.fromEntries(Object.entries(palette.marker).map(([type, value]) => [type, value.symbol])), {
    conversion_adjustment: "A", conversion_suspension: "S", ex_dividend: "D", put: "P", redemption: "R", maturity: "M",
  });
});

test("detail binding returns chart cleanup and serialized record history remains available to the chart", () => {
  const cleanup = bindBondDetail({ querySelector: () => null, querySelectorAll: () => [] }, () => {});
  assert.equal(typeof cleanup, "function");
  const html = renderBondDetail({ bondCode: "35221", history: [point("2026-01-05")], events: [], view: {}, term: {}, assessment: {} });
  assert.match(html, /"cbOpen":"100"/);
});

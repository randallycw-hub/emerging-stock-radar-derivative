import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChartModel,
  buildEventMarkers,
  selectVisibleCandles,
} from "../static-showcase/assets/bond-candlestick-chart.js";

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

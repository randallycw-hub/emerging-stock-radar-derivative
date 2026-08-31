import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLightweightEventMarkers,
  chartDataState,
  normalizeOfficialCandles,
} from "../static-showcase/assets/lightweight-charts-adapter.js";

const validPoint = {
  date: "2026-08-28",
  cbOpen: "100",
  cbHigh: "104",
  cbLow: "99",
  cbClose: "102",
  cbTradingUnits: "123",
};

test("V5.6 Lightweight Charts adapter accepts only complete official OHLCV candles", () => {
  assert.deepEqual(normalizeOfficialCandles([validPoint]), [{
    time: "2026-08-28", open: 100, high: 104, low: 99, close: 102, volume: 123,
  }]);
  assert.deepEqual(normalizeOfficialCandles([{ ...validPoint, cbHigh: null }]), []);
  assert.equal(chartDataState([validPoint]), "ready");
  assert.equal(chartDataState([{ ...validPoint, cbClose: null }]), "empty");
});

test("V5.6 chart markers retain only dated public event facts without source diagnostics", () => {
  const markers = buildLightweightEventMarkers([
    { eventType: "early_redemption", deadlineDate: "2026-09-10", title: "提前贖回", sourceId: "internal" },
    { eventType: "put", effectiveDate: "2026-10-12", title: "賣回權" },
    { eventType: "put", title: "無日期" },
  ]);
  assert.deepEqual(markers.map((marker) => [marker.time, marker.text]), [
    ["2026-09-10", "提前贖回"],
    ["2026-10-12", "賣回權"],
  ]);
  assert.doesNotMatch(JSON.stringify(markers), /sourceId|missingReason|diagnostics/);
});

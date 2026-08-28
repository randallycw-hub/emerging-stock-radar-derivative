import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  chartDataState,
  toKlineData,
} from "../static-showcase/assets/klinechart-adapter.js";

function point(date, values = {}) {
  return {
    bondCode: "13382",
    date,
    cbOpen: "100",
    cbHigh: "104",
    cbLow: "99",
    cbClose: "102",
    cbTradingUnits: "9",
    ...values,
  };
}

test("KLineChart adapter maps only actual OHLCV using an Asia Taipei trading date", () => {
  assert.deepEqual(toKlineData([
    point("2026-08-03"),
    point("2026-08-04", { cbOpen: null, cbHigh: null, cbLow: null, cbClose: "102" }),
  ]), [{
    timestamp: Date.parse("2026-08-03T00:00:00+08:00"),
    open: 100,
    high: 104,
    low: 99,
    close: 102,
    volume: 9,
  }]);
});

test("KLineChart adapter refuses to initialize a chart without verified OHLCV", () => {
  assert.equal(chartDataState([]), "empty");
  assert.equal(chartDataState([point("2026-08-03")]), "ready");
  assert.equal(chartDataState([point("2026-08-03", { cbOpen: null })]), "empty");
});

test("KLineChart adapter registers a Traditional Chinese locale before initializing the chart", async () => {
  const source = await readFile(new URL("../static-showcase/assets/klinechart-adapter.js", import.meta.url), "utf8");
  assert.match(source, /registerLocale\("zh-TW"/);
  assert.match(source, /locale: "zh-TW"/);
});

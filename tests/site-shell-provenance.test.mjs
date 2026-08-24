import assert from "node:assert/strict";
import test from "node:test";

import { formatPublicProvenance } from "../static-showcase/assets/site-shell.js";

test("formats public provenance without source identifiers or diagnostics", () => {
  assert.equal(formatPublicProvenance({
    label: "櫃買中心｜可轉債每日成交資訊",
    asOfDate: "2026-08-24",
    fetchedAt: "2026-08-24T17:45:00+08:00",
    sourceUrl: "https://www.tpex.org.tw/zh-tw/bond/trade/cb.html",
  }), "資料日期 2026/08/24 · 櫃買中心｜可轉債每日成交資訊");
  assert.equal(formatPublicProvenance(null), "");
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCompanyTab,
  renderCompanyOverviewHtml,
} from "../static-showcase/assets/company-overview.js";

test("UX 2.0 company overview retains a technical analysis tab and uses neutral copy when a module is absent", () => {
  assert.equal(parseCompanyTab("technical"), "technical");

  const html = renderCompanyOverviewHtml({
    code: "1234",
    name: "測試公司",
    emerging: null,
    ipo: null,
    revenue: null,
    bonds: [],
    events: [],
  });

  assert.match(html, />技術分析</);
  assert.match(html, /目前沒有可轉債公開資料/);
  assert.match(html, /目前沒有 IPO 公開資料/);
});

test("V5 company technical tab offers only the issuer's related CBs as verified chart choices", () => {
  const html = renderCompanyOverviewHtml({
    code: "1234",
    name: "測試公司",
    emerging: null,
    ipo: null,
    revenue: null,
    bonds: [
      { bondCode: "12341", bondName: "測試一", cbClose: "101", cbPriceDate: "2026-08-26", premiumRate: "3" },
      { bondCode: "12342", bondName: "測試二", cbClose: "99", cbPriceDate: "2026-08-26", premiumRate: "5" },
    ],
    events: [],
  }, "technical");

  assert.match(html, /data-company-chart-bond/);
  assert.match(html, /data-company-kline-host/);
  assert.match(html, /data-company-chart-period="day"/);
  assert.match(html, /data-company-chart-range="6M"/);
  assert.match(html, /data-company-chart-indicator="MACD"/);
  assert.match(html, /12341 測試一/);
  assert.match(html, /12342 測試二/);
});

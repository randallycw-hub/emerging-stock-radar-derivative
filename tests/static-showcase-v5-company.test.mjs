import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCompanyOverview,
  parseCompanyTab,
  renderCompanyOverviewHtml,
} from "../static-showcase/assets/company-overview.js";

test("V5.2 company overview uses the canonical company master and exposes no technical-analysis tab", () => {
  assert.equal(parseCompanyTab("technical"), "overview");
  const overview = buildCompanyOverview({
    code: "3313",
    companyMaster: [{
      stockCode: "3313",
      companyName: "斐成",
      market: "上櫃",
      industry: "電子業",
      cbCodes: ["33131"],
      cbNames: ["斐成一"],
      aliases: [],
      ipoStage: null,
      dataDate: "2026-08-28",
    }],
    ipo: [{ companyCode: "3314", companyName: "斐成", market: "上市", stage: "C", events: [] }],
    workbench: [{ status: "active", term: { issuerCode: "3313", issuerName: "斐成", bondCode: "33131", bondName: "斐成一" }, view: {} }],
  });
  const html = renderCompanyOverviewHtml(overview);

  assert.equal(overview.name, "斐成");
  assert.equal(overview.market, "上櫃");
  assert.equal(overview.industry, "電子業");
  assert.deepEqual(overview.bonds.map((bond) => bond.bondCode), ["33131"]);
  for (const label of ["概覽", "營收", "IPO／事件", "可轉債", "公開事件"]) assert.match(html, new RegExp(`>${label}<`));
  assert.match(html, /目前沒有 IPO 進行資料/);
  assert.doesNotMatch(html, /技術分析|K 線|MA5|MACD|RSI|KDJ|BOLL|data-company-kline-host/);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCompanyTab,
  renderCompanyOverviewHtml,
} from "../static-showcase/assets/company-overview.js";

test("V5 company overview retains a technical tab and uses neutral copy when a module is absent", () => {
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

  assert.match(html, />技術圖表</);
  assert.match(html, /目前沒有可轉債公開資料/);
  assert.match(html, /目前沒有 IPO 公開資料/);
});

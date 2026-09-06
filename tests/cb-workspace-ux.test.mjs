import assert from "node:assert/strict";
import test from "node:test";

import { renderMarketOverview } from "../static-showcase/assets/cb-workbench-ui.js";

test("CB 工作台以摘要和情境入口帶使用者進入已驗證資料", () => {
  const html = renderMarketOverview({
    dataDate: "2026-09-04",
    summary: {
      activeCount: 2,
      tradedCount: 1,
      turnoverAmount: 3560000,
      weekTurnoverAmount: 9150000,
      weekPeriod: "2026/09/01–2026/09/04",
    },
    records: [
      {
        status: "active",
        cbCode: "12345",
        cbName: "測試一",
        stockCode: "1234",
        companyName: "測試公司",
        quote: { volume: 100, turnoverAmount: 3560000, premiumRate: 5.2, conversionValue: 102.4 },
        liquidity: { average5: 80, average20: 60 },
      },
    ],
    events: [{ cbCode: "12345", cbName: "測試一", date: "2026-09-08", label: "賣回截止" }],
    issuance: [{ cbCode: "12346", cbName: "測試二", stages: { listingDate: "2026-09-10" } }],
  });

  assert.match(html, /class="cb-workspace-tabs"/);
  for (const href of ["./bonds-filter.html?quickFilter=lowPremium", "./bonds-filter.html?quickFilter=newIssue", "./bonds-events.html"]) {
    assert.match(html, new RegExp(`href="${href.replaceAll("?", "\\?")}"`));
  }
  assert.match(html, /條款與完整明細/);
  assert.match(html, /class="cb-market-summary cb-market-summary--workspace"/);
  assert.match(html, /已掛牌 CB[\s\S]*?2/);
  assert.match(html, /單日成交額[\s\S]*?356 萬/);
  assert.doesNotMatch(html, /待確認|資料不足|缺漏原因/);
});

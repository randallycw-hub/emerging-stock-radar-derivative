import assert from "node:assert/strict";
import test from "node:test";

import { buildHomeStaticFallback } from "../static-showcase/assets/home-static-fallback.js";

test("V5 home fallback projects a verified snapshot without loading or diagnostic copy", () => {
  const fallback = buildHomeStaticFallback({
    manifest: { market: { dataDate: "2026-08-26", generatedAt: "2026-08-26T10:12:00Z" } },
    emerging: [{
      companyCode: "1260",
      companyName: "富味鄉",
      transactionVolume: "5",
      estimatedTransactionAmount: "1200",
      direction: "up",
    }],
    ipo: { records: [] },
    bonds: { records: [{
      status: "active",
      bondCode: "12601",
      bondName: "富味鄉一",
      events: [{ date: "2026-08-27", type: "redemption", title: "提前贖回公告" }],
    }] },
  });

  assert.match(fallback.statusText, /資料日 2026\/08\/26/);
  assert.match(fallback.statusText, /更新 18:12/);
  assert.equal(fallback.coverageText, "資料日期 2026/08/26");
  assert.match(fallback.summaryHtml, /興櫃市場/);
  assert.match(fallback.summaryHtml, /市場家數/);
  assert.match(fallback.eventHtml, /提前贖回公告/);
  assert.doesNotMatch(
    `${fallback.statusText}${fallback.summaryHtml}${fallback.eventHtml}`,
    /讀取中|載入後顯示|sourceId|missingReasons|資料品質|Snapshot ID/,
  );
});

test("V5 home fallback keeps unknown verified snapshot fields as a neutral dash", () => {
  const fallback = buildHomeStaticFallback({ manifest: { market: {} } });

  assert.equal(fallback.statusText, "資料日 —");
  assert.equal(fallback.coverageText, "資料日期 —");
  assert.match(fallback.summaryHtml, /—/);
  assert.match(fallback.eventHtml, /目前沒有近期已發布事件/);
});

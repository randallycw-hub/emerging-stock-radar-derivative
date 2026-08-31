import assert from "node:assert/strict";
import test from "node:test";

import { buildV51HomeStaticFallback } from "../static-showcase/assets/home-static-fallback.js";

const research = {
  meta: { dataDate: "2026-08-26", updatedAt: "2026-08-26T12:00:00.000Z", status: "ok" },
  home: {
    cbStockLeaders: {
      state: "ready", dataDate: "2026-08-26",
      entries: [{ code: "2303", name: "聯電", changePercent: 4.2, close: 58.5, route: "./company.html?code=2303", relatedBonds: [{ code: "23031", name: "聯電一", route: "./bonds.html?bond=23031" }] }],
    },
    emergingRankings: {
      state: "ready", dataDate: "2026-08-26",
      tabs: {
        gainers: { label: "漲幅", entries: [{ rank: 1, code: "3595", name: "山太士", primaryLabel: "漲跌幅", primaryValue: 6.5, route: "./company.html?code=3595" }] },
        losers: { label: "跌幅", entries: [] }, turnover: { label: "成交額", entries: [] }, volume: { label: "成交量", entries: [] }, revenueYoY: { label: "營收 YoY", entries: [], state: "not_available" },
      },
    },
    cbTurnover: { daily: { state: "no_verified_data", entries: [] }, weekly: { state: "no_trades", entries: [] } },
    cbIssuance: { state: "ready", entries: [{ cbCode: "23031", cbName: "聯電一", companyName: "聯電", stage: "已公告掛牌", nextDate: "2026-08-26", route: "./bonds.html?bond=23031" }] },
    cbOfficialEvents: { state: "ready", entries: [{ date: "2026-08-25", code: "23031", name: "聯電一", title: "上櫃買賣", sourceName: "官方事件", sourceUrl: "https://example.com/notice", route: "./bonds.html?bond=23031" }] },
    ipoCalendar: { state: "ready", days7: { entries: [{ date: "2026-08-28", code: "3595", name: "山太士", label: "競拍截止", route: "./company.html?code=3595&tab=ipo-cb" }] }, days30: { entries: [] } },
    latestEvents: { state: "ready", entries: [{ date: "2026-08-28", category: "ipo", code: "3595", title: "競拍截止", route: "./company.html?code=3595&tab=ipo-cb" }] },
  },
};

test("V5.1 homepage has a static research workbench and never exposes internal governance fields", () => {
  const page = buildV51HomeStaticFallback(research);
  assert.match(page.startHtml, /本次公開資料摘要/);
  assert.match(page.startHtml, /可轉債標的股漲幅/);
  assert.match(page.startHtml, /興櫃排行/);
  assert.match(page.startHtml, /近期 IPO 時程/);
  assert.match(page.workbenchHtml, /CB 成交排行/);
  assert.match(page.workbenchHtml, /已公告發行與掛牌/);
  assert.match(page.workbenchHtml, /官方 CB 事件/);
  assert.match(page.eventHtml, /競拍截止/);
  assert.match(page.workbenchHtml, /尚無可用的已驗證成交資料/);
  assert.match(page.workbenchHtml, /今日無成交/);
  assert.doesNotMatch(JSON.stringify(page), /sourceId|missingReasons|Snapshot ID|Dataset Health|待確認/);
});

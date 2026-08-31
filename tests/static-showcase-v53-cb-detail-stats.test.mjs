import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildCbMarketStats, renderCbMarketStats } from "../static-showcase/assets/cb-stats-page.js";
import { renderCbDetailV53 } from "../static-showcase/assets/cb-detail-v53.js";

const records = [
  {
    cbCode: "90001", cbName: "甲一", stockCode: "9000", companyName: "甲公司", market: "上市", industry: "測試業", status: "active",
    quote: { dataDate: "2026-08-28", cbClose: 110, stockClose: 120, conversionPrice: 100, conversionValue: 120, premiumRate: -8.33, volume: 0, turnoverAmount: 0, tradeState: "no_trade" },
    liquidity: { average5: 3, average20: 2, weekVolume: 8, tradedDays20: 5 },
    terms: { issueDate: "2025-08-28", listingDate: "2025-08-28", maturityDate: "2028-08-28", issueAmount: 500000000, outstandingAmount: 400000000, outstandingDataDate: "2026-08-28", remainingRatio: 80, securedStatus: "無擔保", underwriter: "測試承銷商", trustee: "測試受託人", putDates: ["2027-08-28"], putPrice: 100, conversionStartDate: "2025-11-28", conversionEndDate: "2028-08-28" },
    events: [{ cbCode: "90001", cbName: "甲一", type: "put", label: "賣回", date: "2027-08-28", sourceUrl: "https://www.tpex.org.tw/a" }],
  },
  {
    cbCode: "90002", cbName: "甲二", stockCode: "9000", companyName: "甲公司", market: "上市", industry: "測試業", status: "active",
    quote: { dataDate: "2026-08-28", cbClose: null, stockClose: null, conversionPrice: null, conversionValue: null, premiumRate: null, volume: null, turnoverAmount: null, tradeState: "unavailable" },
    liquidity: { average5: null, average20: null, weekVolume: null, tradedDays20: 0 },
    terms: { issueDate: "2024-08-28", listingDate: "2024-08-28", maturityDate: "2027-08-28", issueAmount: 300000000, outstandingAmount: null, outstandingDataDate: null, remainingRatio: null, securedStatus: "有擔保", underwriter: null, trustee: null, putDates: [], putPrice: null, conversionStartDate: null, conversionEndDate: null },
    events: [],
  },
];
const root = new URL("../static-showcase/", import.meta.url);

test("V5.3 CB market statistics separate verified zeroes from unavailable values", () => {
  const stats = buildCbMarketStats({ dataDate: "2026-08-28", records, summary: { activeCount: 2, tradedCount: null, turnoverAmount: null, weekTurnoverAmount: null } });

  assert.deepEqual(stats.marketBreakdown, [{ label: "上市", count: 2 }]);
  assert.equal(stats.current.tradedCount, null);
  assert.equal(stats.current.turnoverAmount, null);
  assert.deepEqual(stats.premiumDistribution, [
    { label: "折價", count: 1 }, { label: "0–10%", count: 0 }, { label: "10–30%", count: 0 }, { label: "30% 以上", count: 0 }, { label: "—", count: 1 },
  ]);
  const html = renderCbMarketStats(stats);
  assert.match(html, /市場分布/);
  assert.doesNotMatch(html, /來源 ID|缺漏原因|資料完整|買點|推薦|風險/);
});

test("V5.6 CB detail has six factual tabs and keeps company CB crosslinks", () => {
  const html = renderCbDetailV53(records[0], { companyBonds: records });

  for (const label of ["概況", "估值", "流動性", "條款", "期間", "事件", "90002 甲二", "公司研究頁", "官方公告"]) assert.match(html, new RegExp(label));
  assert.equal((html.match(/data-cb-detail-tab=/g) ?? []).length, 6);
  assert.match(html, /今日無成交/);
  assert.doesNotMatch(html, /來源 ID|缺漏原因|資料完整|買點|推薦|風險/);
});

test("V5.4 CB detail presents verified redemption facts without inventing an amount or date", () => {
  const record = {
    ...records[0],
    rights: {
      redemption: {
        announcementDate: "2026-08-13",
        lastTradingDate: "2026-10-01",
        redemptionDate: null,
        redemptionPrice: null,
        outstandingBalance: null,
        sourceUrl: "https://mopsov.twse.com.tw/mops/web/ajax_t120sb23?co_id=9000",
        summary: "公司公告行使債券贖回權暨訂於115年10月01日終止櫃檯買賣。",
      },
      puts: [],
      maturity: null,
    },
  };
  const html = renderCbDetailV53(record, { companyBonds: records });

  assert.match(html, /提前贖回公告/);
  assert.match(html, /公告日/);
  assert.match(html, /最後交易日/);
  assert.match(html, /2026\/08\/13/);
  assert.match(html, /2026\/10\/01/);
  assert.doesNotMatch(html, /贖回價格|贖回金額|流通餘額：/);
  assert.doesNotMatch(html, /來源 ID|缺漏原因|資料完整|待確認/);
});

test("V5.5 CB detail presents an active official redemption with actual acceptance dates", () => {
  const html = renderCbDetailV53(records[0], {
    companyBonds: records,
    rightsEvents: [{
      eventId: "mops-redemption:90001:2026-08-13:1",
      eventType: "early_redemption",
      marketScope: "cb",
      cbCode: "90001",
      announcementDate: "2026-08-13",
      startDate: "2026-08-20",
      endDate: "2026-08-31",
      deadlineDate: "2026-08-31",
      lastConversionDate: "2026-09-02",
      lastTradingDate: "2026-09-01",
      recordDate: "2026-08-31",
      price: "100000",
      reason: "依發行及轉換辦法第十八條規定辦理。",
      status: "deadline_soon",
      title: "甲一提前贖回",
      sourceUrl: "https://mopsov.twse.com.tw/mops/web/ajax_t120sb23?co_id=9000",
      eventDetails: { redemptionPricePercent: "100" },
    }],
  });

  for (const label of ["提前贖回", "期限將近", "受理期間", "最後轉換日", "收回基準日", "收回價格", "100,000 元"]) assert.match(html, new RegExp(label));
  assert.doesNotMatch(html, /來源 ID|缺漏原因|資料完整|待確認/);
});

test("V5.3 market statistics is a staged five-function destination", async () => {
  const [page, stageScript] = await Promise.all([
    readFile(new URL("bonds-stats.html", root), "utf8"),
    readFile(new URL("../scripts/stage-static-showcase.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(page, /市場統計/);
  assert.match(page, /data-cb-stats-root/);
  assert.match(page, /cb-stats-page\.js/);
  assert.match(stageScript, /bonds-stats\.html/);
  assert.match(stageScript, /cb-stats-page\.js/);
  assert.match(stageScript, /cb-detail-v53\.js/);
});

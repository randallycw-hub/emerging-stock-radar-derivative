import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildCbHeatmapPoints,
  rankCbRecords,
  renderMarketOverview,
} from "../static-showcase/assets/cb-workbench-ui.js";
import {
  CB_VIEW_COLUMNS,
  filterV53CbRecords,
} from "../static-showcase/assets/bond-filter-page.js";
import { buildV53IssuancePipeline } from "../static-showcase/assets/bond-issuance-page.js";
import { filterV53CbEvents, groupV53CbEventsByDate } from "../static-showcase/assets/bond-events-page.js";

const root = new URL("../static-showcase/", import.meta.url);

const records = [
  {
    cbCode: "90001",
    cbName: "甲一",
    stockCode: "9000",
    companyName: "甲公司",
    quote: { volume: 0, turnoverAmount: 0, conversionValue: 100, premiumRate: 5, tradeState: "no_trade" },
    liquidity: { average5: 3, average20: 2, weekVolume: 8 },
  },
  {
    cbCode: "90002",
    cbName: "乙一",
    stockCode: "9001",
    companyName: "乙公司",
    quote: { volume: 25, turnoverAmount: 2500000, conversionValue: 120, premiumRate: -2.5, tradeState: "traded" },
    liquidity: { average5: 10, average20: 8, weekVolume: 30 },
  },
  {
    cbCode: "90003",
    cbName: "丙一",
    stockCode: "9002",
    companyName: "丙公司",
    quote: { volume: null, turnoverAmount: null, conversionValue: null, premiumRate: null, tradeState: "unavailable" },
    liquidity: { average5: null, average20: null, weekVolume: null },
  },
];

test("V5.3 turnover ranking sorts verified values before unavailable values without inventing zero", () => {
  assert.deepEqual(rankCbRecords(records, "volume").map((record) => record.cbCode), ["90002", "90001", "90003"]);
  assert.deepEqual(rankCbRecords(records, "average5").map((record) => record.cbCode), ["90002", "90001", "90003"]);
});

test("V5.3 heatmap is an objective projection and keeps real zero-volume bubbles", () => {
  assert.deepEqual(buildCbHeatmapPoints(records), [
    { cbCode: "90001", cbName: "甲一", stockCode: "9000", companyName: "甲公司", x: 5, y: 100, size: 0, detailHref: "./bonds.html?bond=90001" },
    { cbCode: "90002", cbName: "乙一", stockCode: "9001", companyName: "乙公司", x: -2.5, y: 120, size: 25, detailHref: "./bonds.html?bond=90002" },
  ]);
});

test("V5.3 market overview renders public aggregate labels without diagnostics or recommendations", () => {
  const html = renderMarketOverview({
    dataDate: "2026-08-28",
    summary: { activeCount: 3, tradedCount: null, turnoverAmount: null, weekTurnoverAmount: 2500000, weekPeriod: "2026-08-24 至 2026-08-28" },
    records,
    events: [],
    issuance: [],
  }, { metric: "volume" });

  for (const label of ["有效 CB", "今日有成交", "今日成交額", "本週成交額", "日成交量", "近期事件", "近期發行", "熱力圖"]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /—/);
  assert.doesNotMatch(html, /來源 ID|缺漏原因|資料完整|資料健康度|買點|推薦|風險/);
});

test("V5.3 CB navigation exposes all five product functions", async () => {
  const [bonds, filter, issuance, events, css] = await Promise.all([
    readFile(new URL("bonds.html", root), "utf8"),
    readFile(new URL("bonds-filter.html", root), "utf8"),
    readFile(new URL("bonds-issuance.html", root), "utf8"),
    readFile(new URL("bonds-events.html", root), "utf8"),
    readFile(new URL("assets/app.css", root), "utf8"),
  ]);
  const pages = bonds + filter + issuance + events;

  for (const label of ["市場總覽", "全部 CB", "發行進度", "事件行事曆", "市場統計"]) assert.match(pages, new RegExp(label));
  assert.match(bonds, /data-cb-market-overview/);
  assert.match(css, /cb-heatmap/);
});

test("V5.3 all-CB search returns every active CB of a canonical stock code and composes an objective filter", () => {
  const rows = [
    { ...records[0], status: "active", terms: { issueDate: "2026-08-12", maturityDate: "2027-08-28" }, events: [] },
    { ...records[1], status: "active", stockCode: "9000", terms: { issueDate: "2024-08-28", maturityDate: "2029-08-28" }, events: [] },
    { ...records[2], status: "archived", terms: { issueDate: "2026-08-12", maturityDate: "2027-08-28" }, events: [] },
  ];

  assert.deepEqual(filterV53CbRecords(rows, { query: "９０００", dataDate: "2026-08-28" }).map((row) => row.cbCode), ["90001", "90002"]);
  assert.deepEqual(filterV53CbRecords(rows, { quickFilter: "newIssue", dataDate: "2026-08-28" }).map((row) => row.cbCode), ["90001"]);
  assert.deepEqual(filterV53CbRecords(rows, { quickFilter: "lowPremium", dataDate: "2026-08-28" }).map((row) => row.cbCode), ["90002", "90001"]);
});

test("V5.3 all-CB page groups display fields by quote, terms, events and liquidity", async () => {
  const filter = await readFile(new URL("bonds-filter.html", root), "utf8");

  assert.deepEqual(Object.keys(CB_VIEW_COLUMNS), ["quote", "terms", "events", "liquidity"]);
  for (const label of ["行情", "條款", "事件", "流動性", "新發行", "低溢價", "接近轉換價值", "近期賣回", "近期強贖", "停止轉換中", "清除條件"]) {
    assert.match(filter, new RegExp(label));
  }
});

test("V5.3 issuance pipeline lights only source-confirmed stages and marks the rest pending announcement", () => {
  assert.deepEqual(buildV53IssuancePipeline({
    stages: { announcementDate: null, filingDate: null, effectiveDate: null, auctionOrBookbuildingDate: null, pricingDate: null, listingDate: "2026-09-03", asoDate: null },
  }).map((node) => ({ stage: node.stage, state: node.state, label: node.label })), [
    { stage: "announcementDate", state: "pending", label: "待公告" },
    { stage: "filingDate", state: "pending", label: "待公告" },
    { stage: "effectiveDate", state: "pending", label: "待公告" },
    { stage: "auctionOrBookbuildingDate", state: "pending", label: "待公告" },
    { stage: "pricingDate", state: "pending", label: "待公告" },
    { stage: "listingDate", state: "confirmed", label: "2026/09/03" },
    { stage: "asoDate", state: "pending", label: "待公告" },
  ]);
});

test("V5.3 issuance and event pages expose usable public controls instead of legacy tables", async () => {
  const [issuance, events, css] = await Promise.all([
    readFile(new URL("bonds-issuance.html", root), "utf8"),
    readFile(new URL("bonds-events.html", root), "utf8"),
    readFile(new URL("assets/app.css", root), "utf8"),
  ]);

  assert.match(issuance, /id="bond-issuance-form"/);
  for (const label of ["公告", "送件", "生效", "詢圈／競拍", "定價", "掛牌", "CBAS 拆解"]) assert.match(issuance, new RegExp(label));
  assert.match(events, /id="bond-events-form"/);
  for (const label of ["今日", "未來 7 日", "未來 30 日", "本月", "清單", "月曆", "停止轉換", "提前贖回", "賣回", "到期", "轉換價調整", "Reset", "新掛牌"]) assert.match(events, new RegExp(label));
  for (const selector of ["cb-pipeline", "cb-event-list", "cb-event-calendar", "cb-calendar-days"]) assert.match(css, new RegExp(selector));
});

test("V5.3 event calendar filters a verified date range and groups same-day CB codes without collapsing them", () => {
  const events = [
    { cbCode: "90001", cbName: "甲一", type: "put", label: "賣回", date: "2026-09-03", sourceUrl: "https://www.tpex.org.tw/a" },
    { cbCode: "90002", cbName: "乙一", type: "redemption", label: "提前贖回", date: "2026-09-03", sourceUrl: "https://www.tpex.org.tw/b" },
    { cbCode: "90003", cbName: "丙一", type: "maturity", label: "到期", date: "2026-10-15", sourceUrl: "https://www.tpex.org.tw/c" },
  ];
  const filtered = filterV53CbEvents(events, { asOfDate: "2026-09-01", days: 7, type: "all" });

  assert.deepEqual(filtered.map((event) => event.cbCode), ["90001", "90002"]);
  assert.deepEqual(groupV53CbEventsByDate(filtered), [{ date: "2026-09-03", events: filtered }]);
});

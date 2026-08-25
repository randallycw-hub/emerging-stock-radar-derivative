import assert from "node:assert/strict";
import test from "node:test";

import {
  companyContextLinks,
  detailUrlForBond,
  noAdviceViolations,
  renderBondDetail,
} from "../static-showcase/assets/bond-detail-page.js";

test("company context links retain the issuer code across public market desks", () => {
  assert.deepEqual(companyContextLinks("2303"), [
    { label: "興櫃市場", href: "./emerging.html?q=2303" },
    { label: "IPO 時程", href: "./ipo.html?q=2303" },
    { label: "IPO 雷達", href: "./ipo-radar.html?q=2303" },
  ]);
});

const dataDate = "2026-08-12";
const orderedSections = [
  "可轉債重點",
  "K 線圖",
  "債券條款",
  "法人 1／5／20 日",
  "公司營運與公開財務",
  "事件時間軸",
];

function check(code, label, patch = {}) {
  return {
    code,
    label,
    state: "met",
    actual: "110",
    threshold: "≤115",
    dataDate,
    sourceId: "approved_snapshot",
    missingReason: null,
    ...patch,
  };
}

function section(code, state, checks) {
  return { code, state, checks };
}

function fixture(patch = {}) {
  const dimensions = [
    section("price", "favorable", [check("price_distance", "價格距離")]),
    section("days", "favorable", [check("days_remaining", "剩餘天數", { actual: "700", threshold: ">365" })]),
    section("premium", "favorable", [check("premium_dimension", "溢價", { actual: "5", threshold: "≤10%" })]),
    section("remaining", "favorable", [check("remaining_dimension", "剩餘比例", { actual: "80", threshold: "≥70%" })]),
    section("spread", "favorable", [check("spread_dimension", "價差", { actual: "0.8", threshold: "<0.9%" })]),
    section("liquidity", "favorable", [check("daily_volume", "日成交", { actual: "50", threshold: ">0" })]),
  ];
  const strategies = [
    section("stock_bond_relative", "met", [check("relative_value", "股債相對")]),
    section("maturity_put", "met", [check("maturity_put_check", "到期賣回")]),
    section("equity_relative", "met", [check("ttm_profit", "TTM", { actual: "profitable" })]),
    section("stock_equivalent", "met", [check("equivalent_spread", "盤後價差")]),
    section("arbitrage", "met", [check("borrowability", "借券", { actual: "available" })]),
    section("dynamic_hedge", "met", [check("hedge_volatility", "波動", { actual: "known" })]),
  ];
  return {
    bondCode: "35221",
    status: "active",
    archiveReason: null,
    archivedAt: null,
    term: {
      issuerName: "公開發行人",
      bondName: "公開一",
      issueDate: "2023-12-18",
      listingDate: "2023-12-18",
      maturityDate: "2028-07-29",
      issueAmount: "500000000",
      outstandingAmount: "400000000",
      outstandingDataDate: dataDate,
      initialConversionPrice: "40",
      conversionStartDate: "2024-03-19",
      conversionEndDate: "2028-07-29",
      putDates: ["2027-08-30"],
      putPrice: "101",
      securedStatus: "無擔保",
      underwriter: "公開承銷商",
      trustee: "公開受託人",
    },
    view: {
      bondCode: "35221",
      bondName: "公開一",
      issuerCode: "3522",
      cbClose: "110",
      cbPriceDate: dataDate,
      stockClose: "38",
      stockPriceDate: dataDate,
      currentConversionPrice: "35",
      conversionPriceEffectiveDate: "2026-08-01",
      valuationDate: dataDate,
      conversionValue: "108.57",
      premiumRate: "5",
      valuationConversionPrice: "35",
      valuationConversionPriceEffectiveDate: "2026-08-01",
      conversionPriceHistory: [
        { effectiveDate: "2026-06-01", currentConversionPrice: "36" },
        { effectiveDate: "2026-08-01", currentConversionPrice: "35" },
      ],
      outstandingAmount: "400000000",
      outstandingDataDate: dataDate,
      remainingUnits: "4000",
      remainingRatio: "80",
      dailyTurnoverRate: "1.25",
      institutionDataDate: dataDate,
      institutionNetUnits: "2",
      institutionNet5dUnits: "5",
      institutionNet20dUnits: "20",
      daysToMaturity: 715,
      issuerResearch: {
        revenueMonth: "2026-07",
        sourcePublishedOn: dataDate,
        revenueUnit: "仟元",
        currentMonthRevenue: "100",
        monthOverMonthPercent: "1",
        yearOverYearPercent: "2",
        cumulativeRevenue: "700",
        cumulativeYearOverYearPercent: "3",
      },
      missingReasons: [],
    },
    fieldStates: {
      price: "complete", valuation: "complete", outstanding: "complete",
      institutions: "complete", company: "complete", events: "complete", history: "complete",
    },
    assessment: { dimensions, strategies },
    events: [{
      eventId: "put-1", type: "put", date: "2027-08-30", title: "賣回權日",
      sourceId: "tpex-cb-institution-daily", sourceUrl: "https://www.tpex.org.tw/www/zh-tw/bond/newCb3itrade",
    }],
    ...patch,
  };
}

test("complete fixture renders the public-only detail sections in order", () => {
  const html = renderBondDetail(fixture());
  let previous = -1;
  for (const label of orderedSections) {
    const index = html.indexOf(label);
    assert.ok(index > previous, `${label} must follow the required order`);
    previous = index;
  }
  for (const label of ["轉換價值", "轉換溢價", "剩餘單位", "剩餘比例", "週轉率", "天數"]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /<details[^>]*class="formula-details"/);
  assert.match(html, /轉換價格生效紀錄/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
});

test("detail never renders internal completeness, diagnostic, or rule-engine content", () => {
  const html = renderBondDetail(fixture());
  for (const label of [
    "目前資料快照", "資料完整性", "資料狀態矩陣", "風險與缺漏提醒",
    "六項研究維度", "六項策略條件", "來源 ID", "缺漏原因",
    "approved_cb_history", "not_met", "條件未符合", "目前無核准公開資料／待確認",
    "CBAS 權利金", "TCRI 信用評等", "未納入公開資料快照", "完整性狀態",
  ]) {
    assert.doesNotMatch(html, new RegExp(label));
  }
});

test("incomplete history does not create a public pending diagnostic", () => {
  const html = renderBondDetail(fixture({
    fieldStates: { ...fixture().fieldStates, history: "accumulating" },
  }));
  assert.doesNotMatch(html, /待確認|accumulating|資料狀態/);
});

test("partial fixture keeps public sections but hides unavailable rule checks", () => {
  const record = fixture({
    view: { ...fixture().view, issuerResearch: null, missingReasons: ["MISSING_TTM", "MISSING_PS", "MISSING_STOCK_BORROW"] },
    fieldStates: { ...fixture().fieldStates, company: "missing", institutions: "missing" },
    assessment: {
      ...fixture().assessment,
      strategies: fixture().assessment.strategies.map((item) => ({
        ...item,
        checks: item.checks.map((item) => item.code === "ttm_profit"
          ? { ...item, actual: null, state: "pending", dataDate: null, sourceId: null, missingReason: "UNVERIFIED_PUBLIC_FINANCIALS" }
          : item),
      })),
    },
  });
  const html = renderBondDetail(record);
  assert.doesNotMatch(html, /目前無核准公開資料／待確認/);
  assert.doesNotMatch(html, /TTM|六項策略條件|UNVERIFIED_PUBLIC_FINANCIALS/);
  assert.match(html, /K 線圖/);
});

test("date-mismatch fixture does not expose technical states", () => {
  const record = fixture({
    assessment: {
      ...fixture().assessment,
      strategies: fixture().assessment.strategies.map((item) => item.code === "stock_equivalent"
        ? { ...item, state: "pending", checks: [{ ...item.checks[0], state: "pending", dataDate: "2026-08-11", missingReason: "DATE_MISMATCH" }] }
        : item),
    },
    fieldStates: { ...fixture().fieldStates, valuation: "date_mismatch" },
  });
  const html = renderBondDetail(record);
  assert.doesNotMatch(html, /2026-08-11/);
  assert.doesNotMatch(html, /DATE_MISMATCH/);
  assert.doesNotMatch(html, /date_mismatch|待確認|條件未符合/);
});

test("archived fixture preserves its public event without internal archive reason", () => {
  const html = renderBondDetail(fixture({ status: "archived", archiveReason: "redeemed", archivedAt: dataDate }));
  assert.doesNotMatch(html, /封存|redeemed/);
  assert.match(html, /賣回權日/);
});

test("unavailable checks stay outside the public page and no-advice gate remains active", () => {
  const record = fixture({
    assessment: {
      ...fixture().assessment,
      strategies: fixture().assessment.strategies.map((item) => item.code === "equity_relative"
        ? { ...item, state: "pending", checks: [{ ...item.checks[0], actual: null, state: "pending", dataDate: null, sourceId: null, missingReason: "UNVERIFIED_PUBLIC_FINANCIALS" }] }
        : item),
    },
  });
  const html = renderBondDetail(record);
  assert.doesNotMatch(html, /條件符合|條件未符合|待確認|UNVERIFIED_PUBLIC_FINANCIALS/);
  assert.deepEqual(noAdviceViolations(html), []);
  assert.deepEqual(noAdviceViolations("總分 9；建議買進並下單 1 張"), ["aggregate-score", "recommendation", "buy-sell-short", "order"]);
  assert.equal(detailUrlForBond("/bonds.html?q=甲", "35221"), "/bonds.html?q=%E7%94%B2&bond=35221");
  assert.equal(detailUrlForBond("/bonds.html?bond=35221&q=甲", null), "/bonds.html?q=%E7%94%B2");
});

test("detail escapes fixture content and omits non-HTTPS event URLs", () => {
  const record = fixture({
    term: { ...fixture().term, bondName: "<img src=x onerror=alert(1)>" },
    events: [{ ...fixture().events[0], title: "<script>alert(1)</script>", sourceUrl: "javascript:alert(1)" }],
  });
  const html = renderBondDetail(record);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /href="javascript:/);
});

test("detail links only project-approved official snapshot URLs", () => {
  const unapproved = renderBondDetail(fixture({
    events: [{ ...fixture().events[0], sourceUrl: "https://unapproved.example/verified-event" }],
  }));
  assert.doesNotMatch(unapproved, /href="https:\/\/unapproved\.example/);

  const approved = renderBondDetail(fixture({
    events: [{ ...fixture().events[0], sourceId: "tpex-cb-institution-daily", sourceUrl: "https://www.tpex.org.tw/www/zh-tw/bond/newCb3itrade" }],
  }));
  assert.match(approved, /href="https:\/\/www\.tpex\.org\.tw\/www\/zh-tw\/bond\/newCb3itrade"/);
});

test("mobile detail areas are collapsed by default", () => {
  const html = renderBondDetail(fixture());
  assert.doesNotMatch(html, /<details class="detail-mobile-area" open>/);
  assert.equal((html.match(/<details class="detail-mobile-area"/g) ?? []).length, 6);
});

test("detail exposes an accessible, collapsed candlestick workbench without a trading direction", () => {
  const html = renderBondDetail(fixture());
  assert.match(html, /data-bond-candlestick-chart/);
  assert.match(html, /data-chart-period="day"/);
  assert.match(html, /data-chart-range="6M"[^>]*aria-pressed="true"/);
  assert.match(html, /data-chart-advanced/);
  assert.match(html, /Bollinger\(20,2\).*RSI\(14\).*KD\(9,3,3\).*MACD\(12,26,9\)/s);
  assert.match(html, /data-chart-table/);
  assert.doesNotMatch(html, /(?:買點|賣點|buy|sell|signal)/i);
});

test("legacy list records project into the public-only detail contract", async () => {
  const { detailRecordFromLegacy } = await import("../static-showcase/assets/bond-detail-page.js");
  const record = detailRecordFromLegacy({
    view: fixture().view,
    term: { "機構名稱": "公開發行人", "債券簡稱": "公開一", "發行日期": "20231218", "到期日期": "20280729" },
    events: [],
  });
  const html = renderBondDetail(record);
  for (const label of orderedSections) assert.match(html, new RegExp(label));
  assert.doesNotMatch(html, /目前無核准公開資料／待確認/);
  assert.doesNotMatch(html, /資料完整性|六項策略條件|來源 ID/);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  detailUrlForBond,
  noAdviceViolations,
  renderBondDetail,
} from "../static-showcase/assets/bond-detail-page.js";

const dataDate = "2026-08-12";
const strategyLabels = [
  "股債相對條件",
  "到期賣回條件",
  "現股相對觀察",
  "等同現股條件",
  "套利條件",
  "動態避險條件",
];
const orderedSections = [
  "債券識別與資料完整性",
  "風險與缺漏提醒",
  "六項研究維度",
  "六項策略條件",
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
      sourceId: "11406", sourceUrl: "https://www.tpex.org.tw/verified-event",
    }],
    ...patch,
  };
}

test("complete fixture renders required detail sections, conditions, evidence, and formulas in order", () => {
  const html = renderBondDetail(fixture());
  let previous = -1;
  for (const label of orderedSections) {
    const index = html.indexOf(label);
    assert.ok(index > previous, `${label} must follow the required order`);
    previous = index;
  }
  assert.equal((html.match(/class="dimension-card/g) ?? []).length, 6);
  assert.equal((html.match(/class="strategy-card/g) ?? []).length, 6);
  for (const label of strategyLabels) assert.match(html, new RegExp(label));
  for (const label of ["完整規則", "實際值", "門檻", "結果", "資料日", "來源 ID", "狀態", "轉換價值", "轉換溢價", "剩餘單位", "剩餘比例", "週轉率", "天數"]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /<details[^>]*class="formula-details"/);
  assert.match(html, /本頁為公開資料的教育性條件檢核，不構成投資建議或交易指令。/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
});

test("partial fixture retains every missing check and discloses the approved missing wording", () => {
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
  assert.match(html, /目前無核准公開資料／待確認/);
  assert.match(html, /TTM/);
  assert.match(html, /六項策略條件/);
});

test("date-mismatch fixture displays source and data-date mismatch without deciding the check", () => {
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
  assert.match(html, /2026-08-11/);
  assert.match(html, /DATE_MISMATCH/);
  assert.match(html, /date_mismatch/);
});

test("archived fixture displays archive reason and preserves its traceable event", () => {
  const html = renderBondDetail(fixture({ status: "archived", archiveReason: "redeemed", archivedAt: dataDate }));
  assert.match(html, /封存/);
  assert.match(html, /redeemed/);
  assert.match(html, /2026-08-12/);
  assert.match(html, /賣回權日/);
});

test("TTM-unavailable fixture retains neutral condition text and the no-advice gate rejects forbidden language", () => {
  const record = fixture({
    assessment: {
      ...fixture().assessment,
      strategies: fixture().assessment.strategies.map((item) => item.code === "equity_relative"
        ? { ...item, state: "pending", checks: [{ ...item.checks[0], actual: null, state: "pending", dataDate: null, sourceId: null, missingReason: "UNVERIFIED_PUBLIC_FINANCIALS" }] }
        : item),
    },
  });
  const html = renderBondDetail(record);
  assert.match(html, /條件符合|條件未符合|待確認/);
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

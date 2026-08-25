import assert from "node:assert/strict";
import test from "node:test";

import {
  divideDecimal,
  multiplyDecimal,
  subtractDecimal,
} from "../lib/market-data/decimal.ts";
import { buildBondMarketViews } from "../lib/market-data/bond-market-view.ts";

const bond = {
  bondCode: "35221",
  issuerCode: "3522",
  shortName: "御嵿一",
  maturityDate: "2028-07-29",
  issueAmount: "500000000",
  outstandingAmount: "400000000",
  outstandingDataDate: "2026-07-30",
  putDates: ["2026-08-30", "2027-08-30"],
};

const issuerResearch = {
  issuerCode: "3522",
  issuerName: "御嵿",
  market: "otc",
  industryName: "觀光餐旅",
  revenueMonth: "2026-07",
  sourcePublishedOn: "2026-08-08",
  revenueUnit: "仟元",
  currentMonthRevenue: "123456",
  monthOverMonthPercent: "1.25",
  yearOverYearPercent: "2.5",
  cumulativeRevenue: "765432",
  cumulativeYearOverYearPercent: "3.75",
};

function quote(tradingDate, close, patch = {}) {
  return {
    bondCode: "35221",
    tradingDate,
    tradingMode: "equivalent",
    close,
    change: "0",
    open: close,
    high: close,
    low: close,
    tradeCount: "1",
    tradingUnits: "10",
    turnover: "1035000",
    average: close,
    ...patch,
  };
}

function stock(tradingDate, close) {
  return {
    companyCode: "3522",
    market: "otc",
    tradingDate,
    close,
    change: "0",
    volume: "1000",
    turnover: "39000",
  };
}

function conversion(effectiveDate, currentConversionPrice) {
  return {
    bondCode: "35221",
    issuerCode: "3522",
    initialConversionPrice: "40",
    currentConversionPrice,
    effectiveDate,
    officialDetailUrl:
      "https://mopsov.twse.com.tw/mops/web/t120sg01?bond_id=35221&issuer_stock_code=3522",
  };
}

function fixture(overrides = {}) {
  return {
    asOfDate: "2026-07-30",
    bonds: [bond],
    cbQuotes: [],
    stockCloses: [],
    conversionPrices: [],
    ...overrides,
  };
}

function completeMarket(tradingUnits = "10") {
  return {
    cbQuotes: [quote("2026-07-30", "103.5", { tradingUnits })],
    stockCloses: [stock("2026-07-30", "38.25")],
    conversionPrices: [conversion("2025-11-09", "35.1")],
  };
}

function supplementalSnapshot({
  institutionTotals = ["23", ...Array(14).fill("18"), "19", "19", "19", "19", "69"],
  redemptions = [redemptionEvent("2026-07-29", "2026-09-21")],
} = {}) {
  const dates = actualTradingDatesEnding("2026-07-30", institutionTotals.length);
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-31T10:00:00.000Z",
    unitFaceValueTwd: "100000",
    institutionHistory: institutionTotals.length === 0
      ? {}
      : {
        "35221": dates.map((date, index) =>
          institutionTrade(date, institutionTotals[index])),
      },
    redemptions,
    underwritingCases: [],
    sources: {
      institution: institutionTotals.length === 0
        ? { state: "unavailable", dataDate: null, periodYear: null }
        : { state: "fresh", dataDate: dates.at(-1), periodYear: 2026 },
      redemption: redemptions.length === 0
        ? { state: "fresh", dataDate: null, periodYear: 2026 }
        : {
          state: "fresh",
          dataDate: redemptions
            .map((event) => event.announcementDate)
            .sort()
            .at(-1),
          periodYear: 2026,
        },
      underwriting: { state: "unavailable", dataDate: null, periodYear: null },
    },
  };
}

function actualTradingDatesEnding(endDate, count) {
  const dates = [];
  const date = new Date(`${endDate}T00:00:00.000Z`);
  while (dates.length < count) {
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return dates.reverse();
}

function institutionTrade(tradingDate, totalNetUnits) {
  const total = BigInt(totalNetUnits);
  return {
    bondCode: "35221",
    bondName: "御嵿一",
    tradingDate,
    foreignBuyUnits: total >= 0n ? total.toString() : "0",
    foreignSellUnits: total < 0n ? (-total).toString() : "0",
    foreignNetUnits: total.toString(),
    trustBuyUnits: "0",
    trustSellUnits: "0",
    trustNetUnits: "0",
    dealerBuyUnits: "0",
    dealerSellUnits: "0",
    dealerNetUnits: "0",
    totalNetUnits: total.toString(),
  };
}

function redemptionEvent(announcementDate, delistingDate) {
  const rocYear = Number(delistingDate.slice(0, 4)) - 1911;
  return {
    issuerCode: "3522",
    issuerName: "御嵿",
    bondCode: "35221",
    bondName: "御嵿一",
    announcementDate,
    delistingDate,
    subject: `公告御嵿股份有限公司國內轉換公司債(簡稱：御嵿一，代碼：35221)發行公司行使債券贖回權暨訂於${rocYear}年${delistingDate.slice(5, 7)}月${delistingDate.slice(8, 10)}日終止櫃檯買賣等相關事宜。`,
    detailUrl: `https://mopsov.twse.com.tw/mops/web/ajax_t120sb23?TYPEK=otc&co_id=3522&date1=${announcementDate.replaceAll("-", "")}&seq_no=1&pub_class=0&firstin=1`,
  };
}

test("enriches a view with exact remaining metrics, institutions and redemption priority", () => {
  const [view] = buildBondMarketViews(fixture({
    bonds: [{
      ...bond,
      issueAmount: "150000000",
      outstandingAmount: "123100000",
    }],
    ...completeMarket("2462"),
    supplemental: supplementalSnapshot(),
  }));

  assert.equal(view.outstandingDataDate, "2026-07-30");
  assert.equal(view.remainingUnits, "1231");
  assert.equal(view.remainingRatio, "82.07");
  assert.equal(view.dailyTurnoverRate, "200");
  assert.equal(view.institutionDataDate, "2026-07-30");
  assert.equal(view.institutionNetUnits, "69");
  assert.equal(view.institutionNet5dUnits, "145");
  assert.equal(view.institutionNet20dUnits, "420");
  assert.equal(view.nextEventType, "redemption");
  assert.equal(view.nextEventDate, "2026-09-21");
  assert.equal(view.daysToNextEvent, 53);
  assert.equal(view.dataQuality, "complete");
  assert.equal(view.marketStatus, "REDEMPTION_PROCESS");
  assert.deepEqual(view.missingReasons, []);
});

test("keeps supplemental enrichment optional without inventing remaining units", () => {
  const [view] = buildBondMarketViews(fixture({ ...completeMarket() }));

  assert.equal(view.remainingUnits, null);
  assert.equal(view.remainingRatio, "80");
  assert.equal(view.dailyTurnoverRate, null);
  assert.equal(view.institutionDataDate, null);
  assert.equal(view.institutionNetUnits, null);
  assert.equal(view.institutionNet5dUnits, null);
  assert.equal(view.institutionNet20dUnits, null);
  assert.equal(view.redemptionEvent, null);
  assert.equal(view.nextEventType, "put");
  assert.equal(view.nextEventDate, "2026-08-30");
  assert.equal(view.daysToNextEvent, 31);
  assert.equal(view.dataQuality, "partial");
  assert.ok(view.missingReasons.includes("NO_VERIFIED_FACE_VALUE"));
});

test("never rounds a non-divisible outstanding balance in a market view", () => {
  const [view] = buildBondMarketViews(fixture({
    bonds: [{ ...bond, outstandingAmount: "400000001" }],
    ...completeMarket(),
    supplemental: supplementalSnapshot(),
  }));

  assert.equal(view.remainingUnits, null);
  assert.equal(view.dailyTurnoverRate, null);
  assert.equal(view.dataQuality, "partial");
  assert.ok(view.missingReasons.includes("OUTSTANDING_NOT_DIVISIBLE"));
});

test("marks date mismatch ahead of other partial-quality reasons", () => {
  const [view] = buildBondMarketViews(fixture({
    bonds: [{ ...bond, outstandingDataDate: "2026-07-29" }],
    ...completeMarket(),
    supplemental: supplementalSnapshot(),
  }));

  assert.equal(view.remainingUnits, "4000");
  assert.equal(view.dailyTurnoverRate, null);
  assert.equal(view.dataQuality, "date_mismatch");
  assert.ok(view.missingReasons.includes("BALANCE_TRADE_DATE_MISMATCH"));
});

test("uses maturity when no current redemption or future put exists", () => {
  const [view] = buildBondMarketViews(fixture({
    bonds: [{ ...bond, putDates: [] }],
    ...completeMarket(),
  }));

  assert.equal(view.nextPutDate, null);
  assert.equal(view.nextEventType, "maturity");
  assert.equal(view.nextEventDate, "2028-07-29");
  assert.equal(view.daysToNextEvent, 730);
});

test("ignores an expired redemption and falls back to the future put", () => {
  const [view] = buildBondMarketViews(fixture({
    ...completeMarket(),
    supplemental: supplementalSnapshot({
      redemptions: [redemptionEvent("2026-07-20", "2026-07-29")],
    }),
  }));

  assert.equal(view.redemptionEvent, null);
  assert.equal(view.nextEventType, "put");
  assert.equal(view.nextEventDate, "2026-08-30");
});

test("does not label insufficient five- and twenty-day institution windows as complete", () => {
  const [view] = buildBondMarketViews(fixture({
    ...completeMarket(),
    supplemental: supplementalSnapshot({ institutionTotals: ["1", "2", "3", "4"] }),
  }));

  assert.equal(view.institutionDataDate, "2026-07-30");
  assert.equal(view.institutionNetUnits, "4");
  assert.equal(view.institutionNet5dUnits, null);
  assert.equal(view.institutionNet20dUnits, null);
});

test("requires a canonical outstanding balance date whenever a balance is present", () => {
  const missingDate = { ...bond };
  delete missingDate.outstandingDataDate;
  assert.throws(
    () => buildBondMarketViews(fixture({ bonds: [missingDate] })),
    /outstandingDataDate/,
  );
  assert.throws(
    () => buildBondMarketViews(fixture({
      bonds: [{ ...bond, outstandingDataDate: "2026-7-30" }],
    })),
    /outstandingDataDate/,
  );
});

test("joins the compact public research subset by exact issuer code only", () => {
  const [view] = buildBondMarketViews(fixture({
    issuerResearch: [
      { ...issuerResearch, issuerName: "a deliberately unrelated presentation name" },
      { ...issuerResearch, issuerCode: "9999", issuerName: "御嵿" },
    ],
  }));

  assert.deepEqual(view.issuerResearch, {
    market: "otc",
    industryName: "觀光餐旅",
    revenueMonth: "2026-07",
    sourcePublishedOn: "2026-08-08",
    revenueUnit: "仟元",
    currentMonthRevenue: "123456",
    monthOverMonthPercent: "1.25",
    yearOverYearPercent: "2.5",
    cumulativeRevenue: "765432",
    cumulativeYearOverYearPercent: "3.75",
  });
  assert.equal("issuerCode" in view.issuerResearch, false);
  assert.equal("issuerName" in view.issuerResearch, false);
});

test("returns null when no exact research issuer code exists", () => {
  const [view] = buildBondMarketViews(fixture({
    issuerResearch: [{ ...issuerResearch, issuerCode: "9999" }],
  }));

  assert.equal(view.issuerResearch, null);
});

test("rejects duplicate and name-only research before building the issuer map", () => {
  assert.throws(
    () => buildBondMarketViews(fixture({
      issuerResearch: [issuerResearch, structuredClone(issuerResearch)],
    })),
    /duplicate.*issuer research code/i,
  );
  const nameOnlyResearch = { ...issuerResearch };
  delete nameOnlyResearch.issuerCode;
  assert.throws(
    () => buildBondMarketViews(fixture({ issuerResearch: [nameOnlyResearch] })),
    /issuer research record.*keys/i,
  );
});

test("reuses the strict issuer research record schema before joining views", async (context) => {
  const cases = [
    ["reviewer malformed decimal", { currentMonthRevenue: "01" }],
    ["unknown raw-note key", { noteText: "raw note must not escape" }],
    ["invalid market", { market: "listed-or-otc" }],
    ["invalid revenue month", { revenueMonth: "2026-13" }],
    ["impossible source date", { sourcePublishedOn: "2026-02-30" }],
    ["invalid revenue unit", { revenueUnit: "元" }],
    ["invalid nullable decimal", { monthOverMonthPercent: undefined }],
  ];

  for (const [name, patch] of cases) {
    await context.test(name, () => {
      assert.throws(
        () => buildBondMarketViews(fixture({
          issuerResearch: [{ ...issuerResearch, ...patch }],
        })),
        TypeError,
      );
    });
  }
});

test("clones public research independently for every bond of one issuer", () => {
  const secondBond = { ...bond, bondCode: "35222", shortName: "御嵿二" };
  const views = buildBondMarketViews(fixture({
    bonds: [bond, secondBond],
    issuerResearch: [issuerResearch],
  }));

  assert.deepEqual(views[0].issuerResearch, views[1].issuerResearch);
  assert.notStrictEqual(views[0].issuerResearch, views[1].issuerResearch);
  assert.notStrictEqual(views[0].issuerResearch, issuerResearch);
});

test("decimal helpers round deterministically without floating point", () => {
  assert.equal(divideDecimal("38.25", "35.1", 8), "1.08974359");
  assert.equal(multiplyDecimal("1.08974359", "100", 2), "108.97");
  assert.equal(subtractDecimal("1", "0.8", 8), "0.2");
  assert.equal(divideDecimal("-1", "8", 3), "-0.125");
  assert.throws(() => divideDecimal("1", "0", 2), /division by zero/);
});

test("uses a common valuation date and keeps latest display prices separate", () => {
  const [view] = buildBondMarketViews(fixture({
    cbQuotes: [quote("2026-07-29", "103.5")],
    stockCloses: [
      stock("2026-07-29", "38.25"),
      stock("2026-07-30", "39"),
    ],
    conversionPrices: [conversion("2025-11-09", "35.1")],
  }));

  assert.equal(view.cbClose, "103.5");
  assert.equal(view.cbPriceDate, "2026-07-29");
  assert.equal(view.stockClose, "39");
  assert.equal(view.stockPriceDate, "2026-07-30");
  assert.equal(view.valuationDate, "2026-07-29");
  assert.equal(view.valuationCbClose, "103.5");
  assert.equal(view.valuationStockClose, "38.25");
  assert.equal(view.conversionValue, "108.97");
  assert.equal(view.premiumRate, "-5.02");
  assert.equal(view.staleCbPrice, true);
  assert.equal(view.marketStatus, "STALE");
});

test("marks a same-day zero-trade null CB quote unusable even when an older close exists", () => {
  const [view] = buildBondMarketViews(fixture({
    cbQuotes: [
      quote("2026-07-30", null, {
        open: null,
        high: null,
        low: null,
        average: null,
        tradeCount: "0",
        tradingUnits: "0",
        turnover: "0",
      }),
      quote("2026-07-29", "103.5"),
    ],
    stockCloses: [stock("2026-07-29", "38.25")],
    conversionPrices: [conversion("2025-11-09", "35.1")],
  }));

  assert.equal(view.cbClose, "103.5");
  assert.equal(view.staleCbPrice, true);
  assert.equal(view.marketStatus, "NO_TRADE");
  assert.ok(view.missingReasons.includes("NO_CB_CLOSE"));
  assert.notEqual(view.dataQuality, "complete");
});

test("does not compute when no common CB and stock date exists", () => {
  const [view] = buildBondMarketViews(fixture({
    cbQuotes: [quote("2026-07-29", "103.5")],
    stockCloses: [stock("2026-07-30", "39")],
    conversionPrices: [conversion("2025-11-09", "35.1")],
  }));

  assert.equal(view.valuationDate, null);
  assert.equal(view.valuationCbClose, null);
  assert.equal(view.valuationStockClose, null);
  assert.equal(view.conversionValue, null);
  assert.equal(view.premiumRate, null);
  assert.ok(view.missingReasons.includes("NO_COMMON_VALUATION_DATE"));
});

test("does not apply a conversion price before its effective date", () => {
  const [view] = buildBondMarketViews(fixture({
    cbQuotes: [quote("2026-07-29", "103.5")],
    stockCloses: [stock("2026-07-29", "38.25")],
    conversionPrices: [conversion("2026-08-01", "35.1")],
  }));

  assert.equal(view.currentConversionPrice, "35.1");
  assert.equal(view.conversionPriceEffectiveDate, "2026-08-01");
  assert.equal(view.conversionValue, null);
  assert.equal(view.premiumRate, null);
  assert.ok(view.missingReasons.includes("NO_EFFECTIVE_CONVERSION_PRICE"));
});

test("derives outstanding reduction and lifecycle countdowns", () => {
  const [view] = buildBondMarketViews(fixture());

  assert.equal(view.outstandingAmount, "400000000");
  assert.equal(view.outstandingReductionRate, "20");
  assert.equal(view.daysToMaturity, 730);
  assert.equal(view.nextPutDate, "2026-08-30");
  assert.equal(view.daysToNextPut, 31);
});

test("uses equivalent quotes only and rejects duplicate bond identities", () => {
  const [view] = buildBondMarketViews(fixture({
    cbQuotes: [
      quote("2026-07-29", "103.5"),
      quote("2026-07-30", "110", { tradingMode: "negotiated" }),
    ],
  }));
  assert.equal(view.cbPriceDate, "2026-07-29");

  assert.throws(
    () => buildBondMarketViews(fixture({ bonds: [bond, structuredClone(bond)] })),
    /duplicate bond code/,
  );
});

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

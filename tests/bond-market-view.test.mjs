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

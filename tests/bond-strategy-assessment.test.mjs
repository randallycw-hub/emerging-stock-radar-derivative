import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { CB_RESEARCH_RULES, evaluateBondAssessment } from "../lib/market-data/bond-strategy-assessment.ts";

const dataDate = "2026-08-12";

function view(patch = {}) {
  return {
    bondCode: "35221",
    issuerCode: "3522",
    bondName: "匿名可轉債",
    issuerResearch: null,
    cbClose: "110",
    cbPriceDate: dataDate,
    cbTradeUnits: "50",
    stockClose: "38",
    stockPriceDate: dataDate,
    currentConversionPrice: "35",
    conversionPriceEffectiveDate: "2026-08-01",
    valuationDate: dataDate,
    valuationCbClose: "110",
    valuationStockClose: "38",
    conversionValue: "108.57",
    premiumRate: "5",
    outstandingAmount: "400000000",
    outstandingDataDate: dataDate,
    outstandingReductionRate: "20",
    remainingUnits: "4000",
    remainingRatio: "80",
    dailyTurnoverRate: "1.25",
    institutionDataDate: null,
    institutionNetUnits: null,
    institutionNet5dUnits: null,
    institutionNet20dUnits: null,
    redemptionEvent: null,
    maturityDate: "2028-07-29",
    daysToMaturity: 715,
    nextPutDate: "2027-08-30",
    daysToNextPut: 382,
    nextEventType: "put",
    nextEventDate: "2027-08-30",
    daysToNextEvent: 382,
    dataQuality: "complete",
    staleCbPrice: false,
    missingReasons: [],
    ...patch,
  };
}

function history(days = 20, cbTradingUnits = "50") {
  return Array.from({ length: days }, (_, index) => ({
    bondCode: "35221",
    date: new Date(Date.UTC(2026, 7, 12 - (days - index - 1))).toISOString().slice(0, 10),
    cbClose: "110",
    cbTradingUnits,
    stockClose: "38",
    effectiveConversionPrice: "35",
    conversionValue: "108.57",
    premiumRate: "5",
  }));
}

function assessment(patch = {}) {
  return evaluateBondAssessment({
    view: view(),
    history: history(),
    spreadPercent: "0.8",
    spreadDataDate: dataDate,
    borrowability: "available",
    conversionSuspended: false,
    publicFinancials: {
      ttmProfitState: "profitable",
      revenueTrendState: "up",
      psPercentile: "50",
      dataDate,
      sourceId: "mops_public_financials",
    },
    ...patch,
  });
}

function dimension(result, code) {
  return result.dimensions.find((item) => item.code === code);
}

function strategy(result, code) {
  return result.strategies.find((item) => item.code === code);
}

function check(item, code) {
  return item.checks.find((entry) => entry.code === code);
}

test("constructs canonical checks directly without a legacy normalization path", async () => {
  const source = await readFile(new URL("../lib/market-data/bond-strategy-assessment.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /canonicalizeAssessment|CANONICAL_CODES/);
  const allCheckCalls = [...source.matchAll(/\bcheck\(/g)];
  const literalCheckCalls = [...source.matchAll(/\bcheck\(\s*"([^"]+)"/g)];
  assert.equal(allCheckCalls.length, literalCheckCalls.length + 1, "every check call must pass a canonical literal; the one remainder is the function declaration");
  assert.deepEqual([...new Set(literalCheckCalls.map((match) => match[1]))].sort(), Object.keys(CB_RESEARCH_RULES.checks).sort());
});

test("evaluates all six independent dimensions at their published thresholds", () => {
  const favorable = assessment();
  assert.deepEqual(favorable.dimensions.map(({ code, state }) => [code, state]), [
    ["price", "favorable"],
    ["days", "favorable"],
    ["premium", "favorable"],
    ["remaining", "favorable"],
    ["spread", "favorable"],
    ["liquidity", "favorable"],
  ]);

  const watch = assessment({
    view: view({ cbClose: "115.01", daysToMaturity: 364, premiumRate: "10.01", remainingRatio: "69.99" }),
    spreadPercent: "0.9",
  });
  assert.deepEqual(watch.dimensions.map(({ code, state }) => [code, state]), [
    ["price", "watch"], ["days", "watch"], ["premium", "watch"],
    ["remaining", "watch"], ["spread", "watch"], ["liquidity", "favorable"],
  ]);

  const risk = assessment({
    view: view({ cbClose: "130.01", daysToMaturity: 179, premiumRate: "30.01", remainingRatio: "10", cbTradeUnits: "9" }),
    history: history(20, "9"),
    spreadPercent: "2.01",
  });
  assert.deepEqual(risk.dimensions.map(({ code, state }) => [code, state]), [
    ["price", "risk"], ["days", "risk"], ["premium", "risk"],
    ["remaining", "risk"], ["spread", "risk"], ["liquidity", "risk"],
  ]);
});

test("keeps unavailable spread and insufficient liquidity history pending instead of substituting zero", () => {
  const result = assessment({ spreadPercent: null, spreadDataDate: null, history: history(4) });
  assert.equal(dimension(result, "spread").state, "pending");
  assert.equal(dimension(result, "liquidity").state, "pending");
  assert.equal(check(dimension(result, "spread"), "spread_dimension").missingReason, "MISSING_SPREAD");
  assert.equal(check(dimension(result, "liquidity"), "average_volume_5d").state, "pending");
  assert.equal(check(dimension(result, "liquidity"), "average_volume_5d").missingReason, "INSUFFICIENT_HISTORY");
});

test("uses the neutral aggregate condition states without a total score", () => {
  const result = assessment({
    view: view({ conversionValue: "90", premiumRate: "31" }),
    spreadPercent: null,
    spreadDataDate: null,
    borrowability: "unknown",
    conversionSuspended: null,
    publicFinancials: {
      ttmProfitState: "unknown",
      revenueTrendState: "unknown",
      psPercentile: null,
      dataDate: null,
      sourceId: null,
    },
  });
  assert.equal(strategy(result, "stock_bond_relative").state, "not_met");
  assert.equal(strategy(result, "maturity_put").state, "partial");
  assert.equal(strategy(result, "equity_relative").state, "partial");
  assert.equal(strategy(result, "stock_equivalent").state, "pending");
  assert.equal(strategy(result, "arbitrage").state, "pending");
  assert.equal(strategy(result, "dynamic_hedge").state, "partial");
  assert.equal("score" in result, false);
});

test("marks mismatched cross-source strategy checks pending with DATE_MISMATCH", () => {
  const result = assessment({
    spreadDataDate: "2026-08-11",
    publicFinancials: {
      ttmProfitState: "profitable",
      revenueTrendState: "up",
      psPercentile: "50",
      dataDate: "2026-08-11",
      sourceId: "mops_public_financials",
    },
  });
  assert.deepEqual(check(strategy(result, "stock_equivalent"), "equivalent_spread"), {
    code: "equivalent_spread",
    label: "盤後價差",
    state: "pending",
    actual: "0.8",
    threshold: "<2%",
    dataDate: "2026-08-11",
    sourceId: "approved_post_trade_spread",
    missingReason: "DATE_MISMATCH",
  });
  assert.equal(check(strategy(result, "equity_relative"), "ttm_profit").missingReason, "DATE_MISMATCH");
});

test("does not expose investment instructions, positions, or hedge ratios in public check text", () => {
  const result = assessment();
  const publicText = JSON.stringify(result);
  for (const prohibited of ["建議買進", "建議賣出", "放空 X 張", "套利下單", "避險比率"]) {
    assert.equal(publicText.includes(prohibited), false, prohibited);
  }
  assert.equal(strategy(result, "arbitrage").code, "arbitrage");
});

test("uses exact decimal comparison at every published threshold", () => {
  const priceEpsilon = assessment({ view: view({ cbClose: "115.0000000000000000000000001" }) });
  assert.equal(dimension(priceEpsilon, "price").state, "watch");

  const thresholds = assessment({
    view: view({ premiumRate: "10.0000000000000000000000001", remainingRatio: "69.9999999999999999999999999" }),
    spreadPercent: "0.9000000000000000000000001",
  });
  assert.equal(dimension(thresholds, "premium").state, "watch");
  assert.equal(dimension(thresholds, "remaining").state, "watch");
  assert.equal(dimension(thresholds, "spread").state, "watch");
});

test("uses exact BigInt totals for a five-day average near the liquidity boundary", () => {
  const result = assessment({
    history: history(20).map((point) => ({ ...point, cbTradingUnits: "49.999999999999999999999999999999" })),
  });
  const average = check(dimension(result, "liquidity"), "average_volume_5d");
  assert.equal(average.state, "not_met");
  assert.equal(dimension(result, "liquidity").state, "watch");
});

test("keeps public financial checks pending without verifiable source evidence and data date", () => {
  const result = assessment({
    publicFinancials: {
      ttmProfitState: "profitable",
      revenueTrendState: "up",
      psPercentile: "50",
      dataDate: null,
      sourceId: null,
    },
  });
  const equity = strategy(result, "equity_relative");
  for (const code of ["ttm_profit", "revenue_trend", "ps_percentile"]) {
    const item = check(equity, code);
    assert.equal(item.state, "pending", code);
    assert.equal(item.sourceId, null, code);
    assert.equal(item.missingReason, "UNVERIFIED_PUBLIC_FINANCIALS", code);
  }
});

test("marks a present spread from a mismatched valuation date pending in its own dimension", () => {
  const result = assessment({ spreadDataDate: "2026-08-11" });
  assert.equal(dimension(result, "spread").state, "pending");
  assert.equal(check(dimension(result, "spread"), "spread_dimension").missingReason, "DATE_MISMATCH");
});

test("covers the six named anonymized public-like research fixtures", async (context) => {
  const fixtures = [
    ["聯電一（匿名化）", { cbClose: "131", premiumRate: "31" }, "price", "risk", "price_distance", "131", CB_RESEARCH_RULES.checks.price_distance.threshold],
    ["金像電三（匿名化）", { cbClose: "115", premiumRate: "9" }, "price", "favorable", "price_distance", "115", CB_RESEARCH_RULES.checks.price_distance.threshold],
    ["博智二（匿名化）", { cbClose: "116", premiumRate: "10.01" }, "premium", "watch", "premium_dimension", "10.01", CB_RESEARCH_RULES.checks.premium_dimension.threshold],
    ["偉詮電一（匿名化）", { daysToMaturity: 179 }, "days", "risk", "days_remaining", "179", CB_RESEARCH_RULES.checks.days_remaining.threshold],
    ["至上11（匿名化）", { cbPriceDate: "2026-08-11", valuationDate: "2026-08-11" }, "spread", "pending", "spread_dimension", "0.8", CB_RESEARCH_RULES.checks.spread_dimension.threshold],
    ["順德一（匿名化）", { cbTradeUnits: "0", premiumRate: "-0.01" }, "liquidity", "favorable", "daily_volume", "0", CB_RESEARCH_RULES.checks.daily_volume.threshold],
  ];
  for (const [label, patch, dimensionCode, dimensionState, checkCode, actual, threshold] of fixtures) {
    await context.test(label, () => {
      const result = assessment({ view: view(patch) });
      const item = dimension(result, dimensionCode);
      assert.equal(item.state, dimensionState);
      assert.equal(check(item, checkCode).actual, actual);
      assert.equal(check(item, checkCode).threshold, threshold);
    });
  }
});

test("deeply freezes assessment sections and checks", () => {
  const result = assessment();
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.dimensions));
  assert.ok(Object.isFrozen(result.dimensions[0]));
  assert.ok(Object.isFrozen(result.dimensions[0].checks));
  assert.ok(Object.isFrozen(result.dimensions[0].checks[0]));
});

test("uses frozen canonical check rules for boolean labels and strategy thresholds", () => {
  assert.ok(Object.isFrozen(CB_RESEARCH_RULES));
  assert.ok(Object.isFrozen(CB_RESEARCH_RULES.checks.borrowability));
  assert.throws(() => { CB_RESEARCH_RULES.checks.borrowability.label = "changed"; }, TypeError);
  const result = assessment();
  const arbitrage = strategy(result, "arbitrage");
  assert.equal(check(arbitrage, "borrowability").label, CB_RESEARCH_RULES.checks.borrowability.label);
  assert.equal(check(arbitrage, "borrowability").threshold, CB_RESEARCH_RULES.checks.borrowability.threshold);
  assert.equal(check(arbitrage, "conversion_not_suspended").label, CB_RESEARCH_RULES.checks.conversion_not_suspended.label);
  assert.equal(check(strategy(result, "dynamic_hedge"), "hedge_volatility").threshold, CB_RESEARCH_RULES.checks.hedge_volatility.threshold);
});

test("covers every canonical rule from complete and pending fixtures with exact display text", () => {
  const complete = assessment();
  const pending = assessment({
    view: view({ cbClose: null, daysToMaturity: Number.NaN, premiumRate: null, remainingRatio: null, dailyTurnoverRate: null }),
    history: [],
    spreadPercent: null,
    spreadDataDate: null,
    borrowability: "unknown",
    conversionSuspended: null,
    publicFinancials: {
      ttmProfitState: "unknown",
      revenueTrendState: "unknown",
      psPercentile: null,
      dataDate: null,
      sourceId: null,
    },
  });
  const coveredCodes = new Set();
  for (const result of [complete, pending]) {
    for (const section of [...result.dimensions, ...result.strategies]) {
      assert.equal(new Set(section.checks.map((item) => item.code)).size, section.checks.length, section.code);
      for (const item of section.checks) {
        const rule = CB_RESEARCH_RULES.checks[item.code];
        assert.ok(rule, item.code);
        assert.equal(item.label, rule.label, item.code);
        assert.equal(item.threshold, rule.threshold, item.code);
        coveredCodes.add(item.code);
      }
    }
  }
  assert.deepEqual([...coveredCodes].sort(), Object.keys(CB_RESEARCH_RULES.checks).sort());
});

test("zero trade is known while five- and twenty-day volume remain pending without Task 3 history", () => {
  const result = assessment({ view: view({ cbTradeUnits: "0" }), history: [] });
  const daily = check(dimension(result, "liquidity"), "daily_volume");
  assert.equal(daily.actual, "0");
  assert.equal(daily.state, "not_met");
  assert.equal(daily.missingReason, null);
  assert.equal(Number.isNaN(Number(daily.actual)), false);
  assert.equal(check(dimension(result, "liquidity"), "average_volume_5d").state, "pending");
  assert.equal(check(dimension(result, "liquidity"), "average_volume_20d").state, "pending");
});

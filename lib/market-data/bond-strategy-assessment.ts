import type {
  AssessmentCheck,
  BondAssessment,
  BondMarketHistoryPoint,
  BondMarketView,
  BondPublicFinancials,
  ConditionState,
  DimensionState,
} from "./types.ts";
import { divideDecimal } from "./decimal.ts";
import { isIsoDate } from "../domain/dates.ts";

export type BondAssessmentInput = {
  view: BondMarketView;
  history: readonly BondMarketHistoryPoint[];
  spreadPercent: string | null;
  spreadDataDate: string | null;
  borrowability: "available" | "unavailable" | "unknown";
  conversionSuspended: boolean | null;
  publicFinancials: BondPublicFinancials;
};

const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const NON_NEGATIVE_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export const CB_RESEARCH_RULES = deepFreeze({
  checks: {
    price_distance: { label: "CB 盤後價格", threshold: "<=115" }, days_remaining: { label: "剩餘天數", threshold: ">=365" }, premium_dimension: { label: "轉換溢價率", threshold: "<=10%" }, remaining_ratio: { label: "轉換剩餘比例", threshold: ">=70%" }, spread_dimension: { label: "盤後價差", threshold: "<0.9%" }, daily_volume: { label: "當日成交張數", threshold: ">=50 張" }, average_volume_5d: { label: "5 日均量", threshold: "5 日均量：<10 風險、10–49 需留意、>=50 條件良好" }, average_volume_20d: { label: "20 日均量", threshold: "20 日均量：<10 風險、10–49 需留意、>=50 條件良好" }, remaining_turnover: { label: "剩餘張數週轉率", threshold: "呈現公開數值" },
    relative_conversion_value: { label: "轉換價值", threshold: "70–120" }, relative_premium: { label: "轉換溢價率", threshold: "<30%" }, relative_days: { label: "剩餘天數", threshold: ">=365" }, put_date_available: { label: "公開賣回日", threshold: "存在公開賣回日" }, put_reference_price: { label: "基準價格", threshold: "<100" }, public_credit_rating: { label: "公開信用評等／TCRI", threshold: "已取得可驗證公開資料" }, equity_premium: { label: "轉換溢價率", threshold: ">30%" }, ttm_profit: { label: "TTM 獲利", threshold: "獲利" }, revenue_trend: { label: "營收趨勢", threshold: "上升" }, ps_percentile: { label: "PS 百分位", threshold: "可驗證公開 PS 百分位" }, equivalent_premium: { label: "轉換溢價率", threshold: "<2%" }, equivalent_spread: { label: "盤後價差", threshold: "<2%" }, arbitrage_discount: { label: "轉換溢價率", threshold: "<0%" }, borrowability: { label: "融券可用性", threshold: "可融券" }, conversion_not_suspended: { label: "停止轉換狀態", threshold: "未停止轉換" }, execution_costs: { label: "交易成本（盤後價差）", threshold: "可驗證" }, hedge_volatility: { label: "公開波動度", threshold: ">25%" }, hedge_days: { label: "剩餘天數", threshold: ">=365" }, hedge_premium: { label: "轉換溢價率", threshold: "<2%" }, hedge_borrowability: { label: "融券可用性", threshold: "可融券" }, hedge_conversion_not_suspended: { label: "停止轉換狀態", threshold: "未停止轉換" },
  },
  price: { label: "CB 盤後價格", favorable: "<=115", watch: ">115 && <=130", favorableMax: "115", watchMax: "130" },
  days: { label: "剩餘天數", favorable: ">=365", watch: "180–364", favorableMin: 365, watchMin: 180 },
  premium: { label: "轉換溢價率", favorable: "<=10%", watch: ">10% && <=30%", favorableMax: "10", watchMax: "30" },
  remaining: { label: "轉換剩餘比例", favorable: ">=70%", watch: ">10% && <70%", favorableMin: "70", watchMin: "10" },
  spread: { label: "盤後價差", favorable: "<0.9%", watch: "0.9–2%", favorableMax: "0.9", watchMax: "2" },
  liquidity: { label: "5 日均量", dailyLabel: "當日成交張數", turnoverLabel: "剩餘張數週轉率", turnover: "呈現公開數值", favorable: ">=50 張", watch: "10–49 張", risk: "<10 張", favorableMin: "50", watchMin: "10", display: "5 日均量：<10 風險、10–49 需留意、>=50 條件良好" },
  stockBondRelative: { conversionValue: "70–120", conversionValueLabel: "轉換價值", conversionMin: "70", conversionMax: "120", premium: "<30%", premiumMax: "30", days: ">=365" },
  maturityPut: { publicPutDate: "存在公開賣回日", publicPutDateLabel: "公開賣回日", price: "<100", priceLabel: "基準價格", priceMax: "100", creditLabel: "公開信用評等／TCRI", credit: "已取得可驗證公開資料" },
  equityRelative: { premium: ">30%", premiumMin: "30", profitable: "獲利", revenueUp: "上升", ps: "可驗證公開 PS 百分位" },
  stockEquivalent: { premium: "<2%", premiumMax: "2", spread: "<2%", spreadMax: "2" },
  arbitrage: { premium: "<0%", premiumMax: "0", borrowability: "可融券", borrowabilityLabel: "融券可用性", conversion: "未停止轉換", conversionLabel: "停止轉換狀態", cost: "可驗證", costLabel: "交易成本（盤後價差）" },
  dynamicHedge: { volatility: ">25%", volatilityLabel: "公開波動度", days: ">=365", premium: "<2%" },
});

export function evaluateBondAssessment(input: BondAssessmentInput): BondAssessment {
  const valuationDateMismatch = input.view.dataQuality === "date_mismatch"
    || input.view.valuationDate === null
    || input.view.cbPriceDate === null
    || input.view.valuationDate !== input.view.cbPriceDate;
  const price = numericCheck("cb_price", CB_RESEARCH_RULES.price.label, input.view.cbClose, CB_RESEARCH_RULES.price.favorable, input.view.cbPriceDate, "approved_cb_market", (value) => compareDecimal(value, CB_RESEARCH_RULES.price.favorableMax) <= 0);
  const days = integerCheck("days_to_maturity", CB_RESEARCH_RULES.days.label, input.view.daysToMaturity, CB_RESEARCH_RULES.days.favorable, input.view.valuationDate, "approved_cb_terms", (value) => value >= CB_RESEARCH_RULES.days.favorableMin);
  const premium = valuationDateMismatch
    ? pendingCheck("premium_rate", CB_RESEARCH_RULES.premium.label, input.view.premiumRate, CB_RESEARCH_RULES.premium.favorable, input.view.valuationDate, "derived_market_view", "DATE_MISMATCH")
    : numericCheck("premium_rate", CB_RESEARCH_RULES.premium.label, input.view.premiumRate, CB_RESEARCH_RULES.premium.favorable, input.view.valuationDate, "derived_market_view", (value) => compareDecimal(value, CB_RESEARCH_RULES.premium.favorableMax) <= 0);
  const remaining = numericCheck("remaining_ratio", CB_RESEARCH_RULES.remaining.label, input.view.remainingRatio, CB_RESEARCH_RULES.remaining.favorable, input.view.outstandingDataDate, "approved_cb_outstanding", (value) => compareDecimal(value, CB_RESEARCH_RULES.remaining.favorableMin) >= 0);
  const spreadDateMismatch = !sameDateCheck(input.spreadDataDate, input.view.valuationDate);
  const spread = input.spreadPercent === null
    ? pendingCheck("spread_percent", CB_RESEARCH_RULES.spread.label, null, CB_RESEARCH_RULES.spread.favorable, input.spreadDataDate, "approved_post_trade_spread", "MISSING_SPREAD")
    : spreadDateMismatch
      ? pendingCheck("spread_percent", CB_RESEARCH_RULES.spread.label, input.spreadPercent, CB_RESEARCH_RULES.spread.favorable, input.spreadDataDate, "approved_post_trade_spread", "DATE_MISMATCH")
      : numericCheck("spread_percent", CB_RESEARCH_RULES.spread.label, input.spreadPercent, CB_RESEARCH_RULES.spread.favorable, input.spreadDataDate, "approved_post_trade_spread", (value) => compareDecimal(value, CB_RESEARCH_RULES.spread.favorableMax) < 0);

  const liquidityChecks = buildLiquidityChecks(input);
  const conversionValue = valuationDateMismatch
    ? pendingCheck("conversion_value", CB_RESEARCH_RULES.stockBondRelative.conversionValueLabel, input.view.conversionValue, CB_RESEARCH_RULES.stockBondRelative.conversionValue, input.view.valuationDate, "derived_market_view", "DATE_MISMATCH")
    : numericCheck("conversion_value", CB_RESEARCH_RULES.stockBondRelative.conversionValueLabel, input.view.conversionValue, CB_RESEARCH_RULES.stockBondRelative.conversionValue, input.view.valuationDate, "derived_market_view", (value) => compareDecimal(value, CB_RESEARCH_RULES.stockBondRelative.conversionMin) >= 0 && compareDecimal(value, CB_RESEARCH_RULES.stockBondRelative.conversionMax) <= 0);
  const stockBondPremium = valuationDateMismatch
    ? pendingCheck("premium_rate", CB_RESEARCH_RULES.premium.label, input.view.premiumRate, CB_RESEARCH_RULES.stockBondRelative.premium, input.view.valuationDate, "derived_market_view", "DATE_MISMATCH")
    : numericCheck("premium_rate", CB_RESEARCH_RULES.premium.label, input.view.premiumRate, CB_RESEARCH_RULES.stockBondRelative.premium, input.view.valuationDate, "derived_market_view", (value) => compareDecimal(value, CB_RESEARCH_RULES.stockBondRelative.premiumMax) < 0);
  const stockBondDays = integerCheck("days_to_maturity", CB_RESEARCH_RULES.days.label, input.view.daysToMaturity, CB_RESEARCH_RULES.stockBondRelative.days, input.view.valuationDate, "approved_cb_terms", (value) => value >= CB_RESEARCH_RULES.days.favorableMin);

  const putDate = input.view.nextPutDate === null
    ? pendingCheck("public_put_date", CB_RESEARCH_RULES.maturityPut.publicPutDateLabel, null, CB_RESEARCH_RULES.maturityPut.publicPutDate, null, "approved_cb_terms", "MISSING_PUT_DATE")
    : metCheck("public_put_date", CB_RESEARCH_RULES.maturityPut.publicPutDateLabel, input.view.nextPutDate, CB_RESEARCH_RULES.maturityPut.publicPutDate, input.view.nextPutDate, "approved_cb_terms");
  const putPrice = numericCheck("cb_price", CB_RESEARCH_RULES.maturityPut.priceLabel, input.view.cbClose, CB_RESEARCH_RULES.maturityPut.price, input.view.cbPriceDate, "approved_cb_market", (value) => compareDecimal(value, CB_RESEARCH_RULES.maturityPut.priceMax) < 0);
  const credit = pendingCheck("public_credit_rating", CB_RESEARCH_RULES.maturityPut.creditLabel, null, CB_RESEARCH_RULES.maturityPut.credit, null, null, "UNAVAILABLE_PUBLIC_SOURCE");

  const equityPremium = valuationDateMismatch
    ? pendingCheck("premium_rate", CB_RESEARCH_RULES.premium.label, input.view.premiumRate, CB_RESEARCH_RULES.equityRelative.premium, input.view.valuationDate, "derived_market_view", "DATE_MISMATCH")
    : numericCheck("premium_rate", CB_RESEARCH_RULES.premium.label, input.view.premiumRate, CB_RESEARCH_RULES.equityRelative.premium, input.view.valuationDate, "derived_market_view", (value) => compareDecimal(value, CB_RESEARCH_RULES.equityRelative.premiumMin) > 0);
  const financialDateMismatch = input.publicFinancials.dataDate !== null
    && input.view.valuationDate !== null
    && input.publicFinancials.dataDate !== input.view.valuationDate;
  const financialEvidence = validFinancialEvidence(input.publicFinancials);
  const ttmProfit = financialStateCheck("ttm_profit", "TTM 獲利", input.publicFinancials.ttmProfitState, CB_RESEARCH_RULES.equityRelative.profitable, input.publicFinancials, financialDateMismatch, financialEvidence);
  const revenueTrend = financialStateCheck("revenue_trend", "營收趨勢", input.publicFinancials.revenueTrendState, CB_RESEARCH_RULES.equityRelative.revenueUp, input.publicFinancials, financialDateMismatch, financialEvidence);
  const psPercentile = !financialEvidence
    ? pendingCheck("ps_percentile", "PS 百分位", input.publicFinancials.psPercentile, CB_RESEARCH_RULES.equityRelative.ps, input.publicFinancials.dataDate, input.publicFinancials.sourceId, "UNVERIFIED_PUBLIC_FINANCIALS")
    : financialDateMismatch
      ? pendingCheck("ps_percentile", "PS 百分位", input.publicFinancials.psPercentile, CB_RESEARCH_RULES.equityRelative.ps, input.publicFinancials.dataDate, input.publicFinancials.sourceId, "DATE_MISMATCH")
      : input.publicFinancials.psPercentile === null
        ? pendingCheck("ps_percentile", "PS 百分位", null, CB_RESEARCH_RULES.equityRelative.ps, input.publicFinancials.dataDate, input.publicFinancials.sourceId, "MISSING_PS_PERCENTILE")
        : metCheck("ps_percentile", "PS 百分位", input.publicFinancials.psPercentile, CB_RESEARCH_RULES.equityRelative.ps, input.publicFinancials.dataDate, input.publicFinancials.sourceId);

  const equivalentPremium = valuationDateMismatch
    ? pendingCheck("premium_rate", CB_RESEARCH_RULES.premium.label, input.view.premiumRate, CB_RESEARCH_RULES.stockEquivalent.premium, input.view.valuationDate, "derived_market_view", "DATE_MISMATCH")
    : numericCheck("premium_rate", CB_RESEARCH_RULES.premium.label, input.view.premiumRate, CB_RESEARCH_RULES.stockEquivalent.premium, input.view.valuationDate, "derived_market_view", (value) => compareDecimal(value, CB_RESEARCH_RULES.stockEquivalent.premiumMax) < 0);
  const equivalentSpread = sameDateCheck(input.spreadDataDate, input.view.valuationDate)
    ? input.spreadPercent === null
      ? pendingCheck("spread_percent", CB_RESEARCH_RULES.spread.label, null, CB_RESEARCH_RULES.stockEquivalent.spread, input.spreadDataDate, "approved_post_trade_spread", "MISSING_SPREAD")
      : numericCheck("spread_percent", CB_RESEARCH_RULES.spread.label, input.spreadPercent, CB_RESEARCH_RULES.stockEquivalent.spread, input.spreadDataDate, "approved_post_trade_spread", (value) => compareDecimal(value, CB_RESEARCH_RULES.stockEquivalent.spreadMax) < 0)
    : pendingCheck("spread_percent", CB_RESEARCH_RULES.spread.label, input.spreadPercent, CB_RESEARCH_RULES.stockEquivalent.spread, input.spreadDataDate, "approved_post_trade_spread", "DATE_MISMATCH");

  const discount = valuationDateMismatch
    ? pendingCheck("premium_rate", CB_RESEARCH_RULES.premium.label, input.view.premiumRate, CB_RESEARCH_RULES.arbitrage.premium, input.view.valuationDate, "derived_market_view", "DATE_MISMATCH")
    : numericCheck("premium_rate", CB_RESEARCH_RULES.premium.label, input.view.premiumRate, CB_RESEARCH_RULES.arbitrage.premium, input.view.valuationDate, "derived_market_view", (value) => compareDecimal(value, CB_RESEARCH_RULES.arbitrage.premiumMax) < 0);
  const borrowability = input.borrowability === "unknown"
    ? pendingCheck("borrowability", CB_RESEARCH_RULES.arbitrage.borrowabilityLabel, null, CB_RESEARCH_RULES.arbitrage.borrowability, input.view.cbPriceDate, "approved_borrowability", "UNKNOWN_BORROWABILITY")
    : input.borrowability === "available"
      ? metCheck("borrowability", CB_RESEARCH_RULES.arbitrage.borrowabilityLabel, "available", CB_RESEARCH_RULES.arbitrage.borrowability, input.view.cbPriceDate, "approved_borrowability")
      : notMetCheck("borrowability", CB_RESEARCH_RULES.arbitrage.borrowabilityLabel, "unavailable", CB_RESEARCH_RULES.arbitrage.borrowability, input.view.cbPriceDate, "approved_borrowability");
  const suspension = input.conversionSuspended === null
    ? pendingCheck("conversion_suspended", CB_RESEARCH_RULES.arbitrage.conversionLabel, null, CB_RESEARCH_RULES.arbitrage.conversion, input.view.cbPriceDate, "approved_conversion_events", "UNKNOWN_CONVERSION_STATUS")
    : input.conversionSuspended
      ? notMetCheck("conversion_suspended", CB_RESEARCH_RULES.arbitrage.conversionLabel, "suspended", CB_RESEARCH_RULES.arbitrage.conversion, input.view.cbPriceDate, "approved_conversion_events")
      : metCheck("conversion_suspended", CB_RESEARCH_RULES.arbitrage.conversionLabel, "active", CB_RESEARCH_RULES.arbitrage.conversion, input.view.cbPriceDate, "approved_conversion_events");
  const arbitrageCost = sameDateCheck(input.spreadDataDate, input.view.valuationDate)
    ? input.spreadPercent === null
      ? pendingCheck("spread_percent", "交易成本（盤後價差）", null, "可驗證", input.spreadDataDate, "approved_post_trade_spread", "MISSING_SPREAD")
      : metCheck("spread_percent", "交易成本（盤後價差）", input.spreadPercent, "可驗證", input.spreadDataDate, "approved_post_trade_spread")
    : pendingCheck("spread_percent", "交易成本（盤後價差）", input.spreadPercent, "可驗證", input.spreadDataDate, "approved_post_trade_spread", "DATE_MISMATCH");

  const volatility = pendingCheck("public_volatility", CB_RESEARCH_RULES.dynamicHedge.volatilityLabel, null, CB_RESEARCH_RULES.dynamicHedge.volatility, null, null, "MISSING_VOLATILITY");
  const hedgeDays = integerCheck("days_to_maturity", CB_RESEARCH_RULES.days.label, input.view.daysToMaturity, CB_RESEARCH_RULES.dynamicHedge.days, input.view.valuationDate, "approved_cb_terms", (value) => value >= CB_RESEARCH_RULES.days.favorableMin);
  const hedgePremium = equivalentPremium;

  return deepFreeze(canonicalizeAssessment({
    dimensions: [
      { code: "price", state: dimensionState(input.view.cbClose, (value) => compareDecimal(value, CB_RESEARCH_RULES.price.favorableMax) <= 0, (value) => compareDecimal(value, CB_RESEARCH_RULES.price.watchMax) <= 0), checks: [price] },
      { code: "days", state: dimensionIntegerState(input.view.daysToMaturity, (value) => value >= CB_RESEARCH_RULES.days.favorableMin, (value) => value >= CB_RESEARCH_RULES.days.watchMin), checks: [days] },
      { code: "premium", state: valuationDateMismatch ? "pending" : dimensionState(input.view.premiumRate, (value) => compareDecimal(value, CB_RESEARCH_RULES.premium.favorableMax) <= 0, (value) => compareDecimal(value, CB_RESEARCH_RULES.premium.watchMax) <= 0), checks: [premium] },
      { code: "remaining", state: dimensionState(input.view.remainingRatio, (value) => compareDecimal(value, CB_RESEARCH_RULES.remaining.favorableMin) >= 0, (value) => compareDecimal(value, CB_RESEARCH_RULES.remaining.watchMin) > 0), checks: [remaining] },
      { code: "spread", state: input.spreadPercent === null || spreadDateMismatch ? "pending" : dimensionState(input.spreadPercent, (value) => compareDecimal(value, CB_RESEARCH_RULES.spread.favorableMax) < 0, (value) => compareDecimal(value, CB_RESEARCH_RULES.spread.watchMax) <= 0), checks: [spread] },
      { code: "liquidity", state: liquidityState(liquidityChecks, input.history), checks: liquidityChecks },
    ],
    strategies: [
      { code: "stock_bond_relative", state: aggregate([conversionValue, stockBondPremium, stockBondDays]), checks: [conversionValue, stockBondPremium, stockBondDays] },
      { code: "maturity_put", state: aggregate([putDate, putPrice, credit]), checks: [putDate, putPrice, credit] },
      { code: "equity_relative", state: aggregate([equityPremium, ttmProfit, revenueTrend, psPercentile]), checks: [equityPremium, ttmProfit, revenueTrend, psPercentile] },
      { code: "stock_equivalent", state: aggregate([equivalentPremium, equivalentSpread]), checks: [equivalentPremium, equivalentSpread] },
      { code: "arbitrage", state: aggregate([discount, borrowability, suspension, arbitrageCost]), checks: [discount, borrowability, suspension, arbitrageCost] },
      { code: "dynamic_hedge", state: aggregate([volatility, hedgeDays, hedgePremium, borrowability, suspension]), checks: [volatility, hedgeDays, hedgePremium, borrowability, suspension] },
    ],
  }));
}

const CANONICAL_CODES = {
  dimensions: {
    price: ["price_distance"], days: ["days_remaining"], premium: ["premium_dimension"], remaining: ["remaining_ratio"], spread: ["spread_dimension"],
    liquidity: ["daily_volume", "average_volume_5d", "average_volume_20d", "remaining_turnover"],
  },
  strategies: {
    stock_bond_relative: ["relative_conversion_value", "relative_premium", "relative_days"], maturity_put: ["put_date_available", "put_reference_price", "public_credit_rating"],
    equity_relative: ["equity_premium", "ttm_profit", "revenue_trend", "ps_percentile"], stock_equivalent: ["equivalent_premium", "equivalent_spread"],
    arbitrage: ["arbitrage_discount", "borrowability", "conversion_not_suspended", "execution_costs"], dynamic_hedge: ["hedge_volatility", "hedge_days", "hedge_premium", "hedge_borrowability", "hedge_conversion_not_suspended"],
  },
} as const;

function canonicalizeAssessment(assessment: BondAssessment): BondAssessment {
  const rules = CB_RESEARCH_RULES.checks as Record<string, { label: string; threshold: string }>;
  const dimensions = assessment.dimensions.map((section) => ({
    ...section,
    checks: section.checks.map((check, index) => ({ ...check, code: CANONICAL_CODES.dimensions[section.code][index], label: rules[CANONICAL_CODES.dimensions[section.code][index]].label, threshold: rules[CANONICAL_CODES.dimensions[section.code][index]].threshold })),
  }));
  const strategies = assessment.strategies.map((section) => ({
    ...section,
    checks: section.checks.map((check, index) => ({ ...check, code: CANONICAL_CODES.strategies[section.code][index], label: rules[CANONICAL_CODES.strategies[section.code][index]].label, threshold: rules[CANONICAL_CODES.strategies[section.code][index]].threshold })),
  }));
  return { dimensions, strategies };
}

function buildLiquidityChecks(input: BondAssessmentInput): AssessmentCheck[] {
  const daily = numericCheck("daily_trade_units", CB_RESEARCH_RULES.liquidity.dailyLabel, input.view.cbTradeUnits, CB_RESEARCH_RULES.liquidity.favorable, input.view.cbPriceDate, "approved_cb_market", (value) => compareDecimal(value, CB_RESEARCH_RULES.liquidity.favorableMin) >= 0);
  const volumeHistory = input.history
    .map((point) => ({ date: point.date, units: (point as BondMarketHistoryPoint & { cbTradingUnits?: unknown }).cbTradingUnits }))
    .filter((point): point is { date: string; units: string } => typeof point.units === "string" && NON_NEGATIVE_DECIMAL.test(point.units))
    .sort((left, right) => right.date.localeCompare(left.date));
  return [
    daily,
    averageUnitsCheck("average_5d_units", "5 日均量", volumeHistory, 5, input.view.cbPriceDate),
    averageUnitsCheck("average_20d_units", "20 日均量", volumeHistory, 20, input.view.cbPriceDate),
    input.view.dailyTurnoverRate === null
      ? pendingCheck("daily_turnover_rate", "剩餘張數週轉率", null, "呈現公開數值", input.view.outstandingDataDate, "derived_remaining_metrics", "MISSING_TURNOVER_RATE")
      : sameDateCheck(input.view.outstandingDataDate, input.view.cbPriceDate)
        ? metCheck("daily_turnover_rate", "剩餘張數週轉率", input.view.dailyTurnoverRate, "呈現公開數值", input.view.outstandingDataDate, "derived_remaining_metrics")
        : pendingCheck("daily_turnover_rate", "剩餘張數週轉率", input.view.dailyTurnoverRate, "呈現公開數值", input.view.outstandingDataDate, "derived_remaining_metrics", "DATE_MISMATCH"),
  ];
}

function averageUnitsCheck(code: string, label: string, history: readonly { date: string; units: string }[], days: number, priceDate: string | null): AssessmentCheck {
  if (history.length < days) return pendingCheck(code, label, null, CB_RESEARCH_RULES.liquidity.display, null, "approved_cb_history", "INSUFFICIENT_HISTORY");
  if (priceDate === null || history[0].date !== priceDate) return pendingCheck(code, label, null, CB_RESEARCH_RULES.liquidity.display, history[0].date, "approved_cb_history", "DATE_MISMATCH");
  const total = sumDecimals(history.slice(0, days).map((item) => item.units));
  const average = divideDecimal(total, String(days), 18);
  return compareDecimalProduct(total, String(days), CB_RESEARCH_RULES.liquidity.favorableMin) >= 0
    ? metCheck(code, label, average, CB_RESEARCH_RULES.liquidity.favorable, priceDate, "approved_cb_history")
    : notMetCheck(code, label, average, CB_RESEARCH_RULES.liquidity.favorable, priceDate, "approved_cb_history");
}

function liquidityState(checks: readonly AssessmentCheck[], history: readonly BondMarketHistoryPoint[]): DimensionState {
  if (checks.some((check) => check.state === "pending")) return "pending";
  const average5 = checks.find((check) => check.code === "average_5d_units");
  if (average5?.actual === null) return "pending";
  if (average5 === undefined) return "pending";
  const volumes = history
    .map((point) => ({ date: point.date, units: (point as BondMarketHistoryPoint & { cbTradingUnits?: unknown }).cbTradingUnits }))
    .filter((point): point is { date: string; units: string } => typeof point.units === "string" && NON_NEGATIVE_DECIMAL.test(point.units))
    .sort((left, right) => right.date.localeCompare(left.date));
  if (volumes.length < 5) return "pending";
  const total = sumDecimals(volumes.slice(0, 5).map((item) => item.units));
  return compareDecimalProduct(total, "5", CB_RESEARCH_RULES.liquidity.watchMin) < 0
    ? "risk"
    : compareDecimalProduct(total, "5", CB_RESEARCH_RULES.liquidity.favorableMin) < 0
      ? "watch"
      : "favorable";
}

function financialStateCheck(code: string, label: string, value: "profitable" | "loss" | "up" | "down" | "unknown", threshold: string, financials: BondPublicFinancials, dateMismatch: boolean, hasEvidence: boolean): AssessmentCheck {
  if (!hasEvidence) return pendingCheck(code, label, value === "unknown" ? null : value, threshold, financials.dataDate, financials.sourceId, "UNVERIFIED_PUBLIC_FINANCIALS");
  if (dateMismatch) return pendingCheck(code, label, value === "unknown" ? null : value, threshold, financials.dataDate, financials.sourceId, "DATE_MISMATCH");
  if (value === "unknown") return pendingCheck(code, label, null, threshold, financials.dataDate, financials.sourceId, `MISSING_${code.toUpperCase()}`);
  return value === "profitable" || value === "up"
    ? metCheck(code, label, value, threshold, financials.dataDate, financials.sourceId)
    : notMetCheck(code, label, value, threshold, financials.dataDate, financials.sourceId);
}

function numericCheck(code: string, label: string, actual: string | null, threshold: string, dataDate: string | null, sourceId: string, predicate: (value: string) => boolean): AssessmentCheck {
  if (actual === null || !DECIMAL.test(actual)) return pendingCheck(code, label, actual, threshold, dataDate, sourceId, "MISSING_VALUE");
  return predicate(actual) ? metCheck(code, label, actual, threshold, dataDate, sourceId) : notMetCheck(code, label, actual, threshold, dataDate, sourceId);
}

function integerCheck(code: string, label: string, actual: number, threshold: string, dataDate: string | null, sourceId: string, predicate: (value: number) => boolean): AssessmentCheck {
  return Number.isSafeInteger(actual)
    ? predicate(actual) ? metCheck(code, label, String(actual), threshold, dataDate, sourceId) : notMetCheck(code, label, String(actual), threshold, dataDate, sourceId)
    : pendingCheck(code, label, null, threshold, dataDate, sourceId, "MISSING_VALUE");
}

function dimensionState(actual: string | null, favorable: (value: string) => boolean, watch: (value: string) => boolean): DimensionState {
  if (actual === null || !DECIMAL.test(actual)) return "pending";
  return favorable(actual) ? "favorable" : watch(actual) ? "watch" : "risk";
}

function dimensionIntegerState(actual: number, favorable: (value: number) => boolean, watch: (value: number) => boolean): DimensionState {
  if (!Number.isSafeInteger(actual)) return "pending";
  return favorable(actual) ? "favorable" : watch(actual) ? "watch" : "risk";
}

function sameDateCheck(left: string | null, right: string | null): boolean {
  return left !== null && right !== null && left === right;
}

function validFinancialEvidence(value: BondPublicFinancials): boolean {
  return value.sourceId !== null && value.sourceId.trim() !== "" && value.dataDate !== null && isIsoDate(value.dataDate);
}

type ExactDecimal = { coefficient: bigint; scale: number };

function parseExactDecimal(value: string): ExactDecimal {
  if (!DECIMAL.test(value)) throw new TypeError(`invalid decimal: ${value}`);
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [integer, fraction = ""] = unsigned.split(".");
  const digits = `${integer}${fraction}`.replace(/^0+(?=\d)/, "");
  return { coefficient: BigInt(digits || "0") * (negative ? BigInt(-1) : BigInt(1)), scale: fraction.length };
}

function compareDecimal(left: string, right: string): -1 | 0 | 1 {
  const a = parseExactDecimal(left);
  const b = parseExactDecimal(right);
  const scale = Math.max(a.scale, b.scale);
  const leftValue = a.coefficient * (BigInt(10) ** BigInt(scale - a.scale));
  const rightValue = b.coefficient * (BigInt(10) ** BigInt(scale - b.scale));
  return leftValue === rightValue ? 0 : leftValue < rightValue ? -1 : 1;
}

function sumDecimals(values: readonly string[]): string {
  const parsed = values.map(parseExactDecimal);
  const scale = Math.max(...parsed.map((value) => value.scale));
  const coefficient = parsed.reduce((total, value) => total + value.coefficient * (BigInt(10) ** BigInt(scale - value.scale)), BigInt(0));
  const sign = coefficient < BigInt(0) ? "-" : "";
  const digits = (coefficient < BigInt(0) ? -coefficient : coefficient).toString().padStart(scale + 1, "0");
  if (scale === 0) return `${sign}${digits}`;
  const fraction = digits.slice(-scale).replace(/0+$/, "");
  return fraction === "" ? `${sign}${digits.slice(0, -scale)}` : `${sign}${digits.slice(0, -scale)}.${fraction}`;
}

function compareDecimalProduct(left: string, multiplier: string, right: string): -1 | 0 | 1 {
  const leftValue = parseExactDecimal(left);
  const multiplierValue = parseExactDecimal(multiplier);
  const rightValue = parseExactDecimal(right);
  const product = { coefficient: multiplierValue.coefficient * rightValue.coefficient, scale: multiplierValue.scale + rightValue.scale };
  const scale = Math.max(leftValue.scale, product.scale);
  const a = leftValue.coefficient * (BigInt(10) ** BigInt(scale - leftValue.scale));
  const b = product.coefficient * (BigInt(10) ** BigInt(scale - product.scale));
  return a === b ? 0 : a < b ? -1 : 1;
}

function aggregate(checks: readonly AssessmentCheck[]): ConditionState {
  if (checks.every((check) => check.state === "met")) return "met";
  if (checks.some((check) => check.state === "pending")) {
    return checks.some((check) => check.state === "met") ? "partial" : "pending";
  }
  return "not_met";
}

function metCheck(code: string, label: string, actual: string, threshold: string, dataDate: string | null, sourceId: string | null): AssessmentCheck {
  return { code, label, state: "met", actual, threshold, dataDate, sourceId, missingReason: null };
}

function notMetCheck(code: string, label: string, actual: string, threshold: string, dataDate: string | null, sourceId: string | null): AssessmentCheck {
  return { code, label, state: "not_met", actual, threshold, dataDate, sourceId, missingReason: null };
}

function pendingCheck(code: string, label: string, actual: string | null, threshold: string, dataDate: string | null, sourceId: string | null, missingReason: string): AssessmentCheck {
  return { code, label, state: "pending", actual, threshold, dataDate, sourceId, missingReason };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

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
  price: { favorableMax: "115", watchMax: "130" },
  days: { favorableMin: 365, watchMin: 180 },
  premium: { favorableMax: "10", watchMax: "30" },
  remaining: { favorableMin: "70", watchMin: "10" },
  spread: { favorableMax: "0.9", watchMax: "2" },
  liquidity: { favorableMin: "50", watchMin: "10" },
  stockBondRelative: { conversionMin: "70", conversionMax: "120", premiumMax: "30" },
  maturityPut: { priceMax: "100" },
  equityRelative: { premiumMin: "30" },
  stockEquivalent: { premiumMax: "2", spreadMax: "2" },
  arbitrage: { premiumMax: "0" },
});

type CanonicalCheckCode = keyof typeof CB_RESEARCH_RULES.checks;

export function evaluateBondAssessment(input: BondAssessmentInput): BondAssessment {
  const valuationDateMismatch = input.view.dataQuality === "date_mismatch"
    || input.view.valuationDate === null
    || input.view.cbPriceDate === null
    || input.view.valuationDate !== input.view.cbPriceDate;
  const price = check("price_distance", numericCondition(input.view.cbClose, (value) => compareDecimal(value, CB_RESEARCH_RULES.price.favorableMax) <= 0), input.view.cbClose, input.view.cbPriceDate, "approved_cb_market", numericMissingReason(input.view.cbClose));
  const days = check("days_remaining", integerCondition(input.view.daysToMaturity, (value) => value >= CB_RESEARCH_RULES.days.favorableMin), integerActual(input.view.daysToMaturity), input.view.valuationDate, "approved_cb_terms", integerMissingReason(input.view.daysToMaturity));
  const premium = valuationDateMismatch
    ? check("premium_dimension", "pending", input.view.premiumRate, input.view.valuationDate, "derived_market_view", "DATE_MISMATCH")
    : check("premium_dimension", numericCondition(input.view.premiumRate, (value) => compareDecimal(value, CB_RESEARCH_RULES.premium.favorableMax) <= 0), input.view.premiumRate, input.view.valuationDate, "derived_market_view", numericMissingReason(input.view.premiumRate));
  const remaining = check("remaining_ratio", numericCondition(input.view.remainingRatio, (value) => compareDecimal(value, CB_RESEARCH_RULES.remaining.favorableMin) >= 0), input.view.remainingRatio, input.view.outstandingDataDate, "approved_cb_outstanding", numericMissingReason(input.view.remainingRatio));
  const spreadDateMismatch = !sameDateCheck(input.spreadDataDate, input.view.valuationDate);
  const spread = input.spreadPercent === null
    ? check("spread_dimension", "pending", null, input.spreadDataDate, "approved_post_trade_spread", "MISSING_SPREAD")
    : spreadDateMismatch
      ? check("spread_dimension", "pending", input.spreadPercent, input.spreadDataDate, "approved_post_trade_spread", "DATE_MISMATCH")
      : check("spread_dimension", numericCondition(input.spreadPercent, (value) => compareDecimal(value, CB_RESEARCH_RULES.spread.favorableMax) < 0), input.spreadPercent, input.spreadDataDate, "approved_post_trade_spread", numericMissingReason(input.spreadPercent));

  const liquidityChecks = buildLiquidityChecks(input);
  const conversionValue = valuationDateMismatch
    ? check("relative_conversion_value", "pending", input.view.conversionValue, input.view.valuationDate, "derived_market_view", "DATE_MISMATCH")
    : check("relative_conversion_value", numericCondition(input.view.conversionValue, (value) => compareDecimal(value, CB_RESEARCH_RULES.stockBondRelative.conversionMin) >= 0 && compareDecimal(value, CB_RESEARCH_RULES.stockBondRelative.conversionMax) <= 0), input.view.conversionValue, input.view.valuationDate, "derived_market_view", numericMissingReason(input.view.conversionValue));
  const stockBondPremium = valuationDateMismatch
    ? check("relative_premium", "pending", input.view.premiumRate, input.view.valuationDate, "derived_market_view", "DATE_MISMATCH")
    : check("relative_premium", numericCondition(input.view.premiumRate, (value) => compareDecimal(value, CB_RESEARCH_RULES.stockBondRelative.premiumMax) < 0), input.view.premiumRate, input.view.valuationDate, "derived_market_view", numericMissingReason(input.view.premiumRate));
  const stockBondDays = check("relative_days", integerCondition(input.view.daysToMaturity, (value) => value >= CB_RESEARCH_RULES.days.favorableMin), integerActual(input.view.daysToMaturity), input.view.valuationDate, "approved_cb_terms", integerMissingReason(input.view.daysToMaturity));

  const putDate = input.view.nextPutDate === null
    ? check("put_date_available", "pending", null, null, "approved_cb_terms", "MISSING_PUT_DATE")
    : check("put_date_available", "met", input.view.nextPutDate, input.view.nextPutDate, "approved_cb_terms", null);
  const putPrice = check("put_reference_price", numericCondition(input.view.cbClose, (value) => compareDecimal(value, CB_RESEARCH_RULES.maturityPut.priceMax) < 0), input.view.cbClose, input.view.cbPriceDate, "approved_cb_market", numericMissingReason(input.view.cbClose));
  const credit = check("public_credit_rating", "pending", null, null, null, "UNAVAILABLE_PUBLIC_SOURCE");

  const equityPremium = valuationDateMismatch
    ? check("equity_premium", "pending", input.view.premiumRate, input.view.valuationDate, "derived_market_view", "DATE_MISMATCH")
    : check("equity_premium", numericCondition(input.view.premiumRate, (value) => compareDecimal(value, CB_RESEARCH_RULES.equityRelative.premiumMin) > 0), input.view.premiumRate, input.view.valuationDate, "derived_market_view", numericMissingReason(input.view.premiumRate));
  const financialDateMismatch = input.publicFinancials.dataDate !== null
    && input.view.valuationDate !== null
    && input.publicFinancials.dataDate !== input.view.valuationDate;
  const financialEvidence = validFinancialEvidence(input.publicFinancials);
  const ttmOutcome = financialStateOutcome(input.publicFinancials.ttmProfitState, financialDateMismatch, financialEvidence, "MISSING_TTM_PROFIT");
  const ttmProfit = check("ttm_profit", ttmOutcome.state, ttmOutcome.actual, input.publicFinancials.dataDate, input.publicFinancials.sourceId, ttmOutcome.missingReason);
  const revenueOutcome = financialStateOutcome(input.publicFinancials.revenueTrendState, financialDateMismatch, financialEvidence, "MISSING_REVENUE_TREND");
  const revenueTrend = check("revenue_trend", revenueOutcome.state, revenueOutcome.actual, input.publicFinancials.dataDate, input.publicFinancials.sourceId, revenueOutcome.missingReason);
  const psPercentile = !financialEvidence
    ? check("ps_percentile", "pending", input.publicFinancials.psPercentile, input.publicFinancials.dataDate, input.publicFinancials.sourceId, "UNVERIFIED_PUBLIC_FINANCIALS")
    : financialDateMismatch
      ? check("ps_percentile", "pending", input.publicFinancials.psPercentile, input.publicFinancials.dataDate, input.publicFinancials.sourceId, "DATE_MISMATCH")
      : input.publicFinancials.psPercentile === null
        ? check("ps_percentile", "pending", null, input.publicFinancials.dataDate, input.publicFinancials.sourceId, "MISSING_PS_PERCENTILE")
        : check("ps_percentile", "met", input.publicFinancials.psPercentile, input.publicFinancials.dataDate, input.publicFinancials.sourceId, null);

  const equivalentPremium = valuationDateMismatch
    ? check("equivalent_premium", "pending", input.view.premiumRate, input.view.valuationDate, "derived_market_view", "DATE_MISMATCH")
    : check("equivalent_premium", numericCondition(input.view.premiumRate, (value) => compareDecimal(value, CB_RESEARCH_RULES.stockEquivalent.premiumMax) < 0), input.view.premiumRate, input.view.valuationDate, "derived_market_view", numericMissingReason(input.view.premiumRate));
  const equivalentSpread = sameDateCheck(input.spreadDataDate, input.view.valuationDate)
    ? input.spreadPercent === null
      ? check("equivalent_spread", "pending", null, input.spreadDataDate, "approved_post_trade_spread", "MISSING_SPREAD")
      : check("equivalent_spread", numericCondition(input.spreadPercent, (value) => compareDecimal(value, CB_RESEARCH_RULES.stockEquivalent.spreadMax) < 0), input.spreadPercent, input.spreadDataDate, "approved_post_trade_spread", numericMissingReason(input.spreadPercent))
    : check("equivalent_spread", "pending", input.spreadPercent, input.spreadDataDate, "approved_post_trade_spread", "DATE_MISMATCH");

  const discount = valuationDateMismatch
    ? check("arbitrage_discount", "pending", input.view.premiumRate, input.view.valuationDate, "derived_market_view", "DATE_MISMATCH")
    : check("arbitrage_discount", numericCondition(input.view.premiumRate, (value) => compareDecimal(value, CB_RESEARCH_RULES.arbitrage.premiumMax) < 0), input.view.premiumRate, input.view.valuationDate, "derived_market_view", numericMissingReason(input.view.premiumRate));
  const borrowState = input.borrowability === "unknown" ? "pending" : input.borrowability === "available" ? "met" : "not_met";
  const borrowActual = input.borrowability === "unknown" ? null : input.borrowability;
  const borrowMissingReason = input.borrowability === "unknown" ? "UNKNOWN_BORROWABILITY" : null;
  const borrowability = check("borrowability", borrowState, borrowActual, input.view.cbPriceDate, "approved_borrowability", borrowMissingReason);
  const hedgeBorrowability = check("hedge_borrowability", borrowState, borrowActual, input.view.cbPriceDate, "approved_borrowability", borrowMissingReason);
  const conversionState = input.conversionSuspended === null ? "pending" : input.conversionSuspended ? "not_met" : "met";
  const conversionActual = input.conversionSuspended === null ? null : input.conversionSuspended ? "suspended" : "active";
  const conversionMissingReason = input.conversionSuspended === null ? "UNKNOWN_CONVERSION_STATUS" : null;
  const suspension = check("conversion_not_suspended", conversionState, conversionActual, input.view.cbPriceDate, "approved_conversion_events", conversionMissingReason);
  const hedgeSuspension = check("hedge_conversion_not_suspended", conversionState, conversionActual, input.view.cbPriceDate, "approved_conversion_events", conversionMissingReason);
  const arbitrageCost = sameDateCheck(input.spreadDataDate, input.view.valuationDate)
    ? input.spreadPercent === null
      ? check("execution_costs", "pending", null, input.spreadDataDate, "approved_post_trade_spread", "MISSING_SPREAD")
      : check("execution_costs", "met", input.spreadPercent, input.spreadDataDate, "approved_post_trade_spread", null)
    : check("execution_costs", "pending", input.spreadPercent, input.spreadDataDate, "approved_post_trade_spread", "DATE_MISMATCH");

  const volatility = check("hedge_volatility", "pending", null, null, null, "MISSING_VOLATILITY");
  const hedgeDays = check("hedge_days", integerCondition(input.view.daysToMaturity, (value) => value >= CB_RESEARCH_RULES.days.favorableMin), integerActual(input.view.daysToMaturity), input.view.valuationDate, "approved_cb_terms", integerMissingReason(input.view.daysToMaturity));
  const hedgePremium = valuationDateMismatch
    ? check("hedge_premium", "pending", input.view.premiumRate, input.view.valuationDate, "derived_market_view", "DATE_MISMATCH")
    : check("hedge_premium", numericCondition(input.view.premiumRate, (value) => compareDecimal(value, CB_RESEARCH_RULES.stockEquivalent.premiumMax) < 0), input.view.premiumRate, input.view.valuationDate, "derived_market_view", numericMissingReason(input.view.premiumRate));

  return deepFreeze({
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
      { code: "dynamic_hedge", state: aggregate([volatility, hedgeDays, hedgePremium, hedgeBorrowability, hedgeSuspension]), checks: [volatility, hedgeDays, hedgePremium, hedgeBorrowability, hedgeSuspension] },
    ],
  });
}

function buildLiquidityChecks(input: BondAssessmentInput): AssessmentCheck[] {
  const daily = check("daily_volume", numericCondition(input.view.cbTradeUnits, (value) => compareDecimal(value, CB_RESEARCH_RULES.liquidity.favorableMin) >= 0), input.view.cbTradeUnits, input.view.cbPriceDate, "approved_cb_market", numericMissingReason(input.view.cbTradeUnits));
  const volumeHistory = input.history
    .map((point) => ({ date: point.date, units: (point as BondMarketHistoryPoint & { cbTradingUnits?: unknown }).cbTradingUnits }))
    .filter((point): point is { date: string; units: string } => typeof point.units === "string" && NON_NEGATIVE_DECIMAL.test(point.units))
    .sort((left, right) => right.date.localeCompare(left.date));
  const average5 = averageUnitsOutcome(volumeHistory, 5, input.view.cbPriceDate);
  const average20 = averageUnitsOutcome(volumeHistory, 20, input.view.cbPriceDate);
  return [
    daily,
    check("average_volume_5d", average5.state, average5.actual, average5.dataDate, "approved_cb_history", average5.missingReason),
    check("average_volume_20d", average20.state, average20.actual, average20.dataDate, "approved_cb_history", average20.missingReason),
    input.view.dailyTurnoverRate === null
      ? check("remaining_turnover", "pending", null, input.view.outstandingDataDate, "derived_remaining_metrics", "MISSING_TURNOVER_RATE")
      : sameDateCheck(input.view.outstandingDataDate, input.view.cbPriceDate)
        ? check("remaining_turnover", "met", input.view.dailyTurnoverRate, input.view.outstandingDataDate, "derived_remaining_metrics", null)
        : check("remaining_turnover", "pending", input.view.dailyTurnoverRate, input.view.outstandingDataDate, "derived_remaining_metrics", "DATE_MISMATCH"),
  ];
}

type CheckOutcome = Pick<AssessmentCheck, "state" | "actual" | "dataDate" | "missingReason">;

function averageUnitsOutcome(history: readonly { date: string; units: string }[], days: number, priceDate: string | null): CheckOutcome {
  if (history.length < days) return { state: "pending", actual: null, dataDate: null, missingReason: "INSUFFICIENT_HISTORY" };
  if (priceDate === null || history[0].date !== priceDate) return { state: "pending", actual: null, dataDate: history[0].date, missingReason: "DATE_MISMATCH" };
  const total = sumDecimals(history.slice(0, days).map((item) => item.units));
  const average = divideDecimal(total, String(days), 18);
  return {
    state: compareDecimalProduct(total, String(days), CB_RESEARCH_RULES.liquidity.favorableMin) >= 0 ? "met" : "not_met",
    actual: average,
    dataDate: priceDate,
    missingReason: null,
  };
}

function liquidityState(checks: readonly AssessmentCheck[], history: readonly BondMarketHistoryPoint[]): DimensionState {
  if (checks.some((check) => check.state === "pending")) return "pending";
  const average5 = checks.find((check) => check.code === "average_volume_5d");
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

function financialStateOutcome(value: "profitable" | "loss" | "up" | "down" | "unknown", dateMismatch: boolean, hasEvidence: boolean, missingValueReason: string): Omit<CheckOutcome, "dataDate"> {
  const actual = value === "unknown" ? null : value;
  if (!hasEvidence) return { state: "pending", actual, missingReason: "UNVERIFIED_PUBLIC_FINANCIALS" };
  if (dateMismatch) return { state: "pending", actual, missingReason: "DATE_MISMATCH" };
  if (value === "unknown") return { state: "pending", actual: null, missingReason: missingValueReason };
  return { state: value === "profitable" || value === "up" ? "met" : "not_met", actual: value, missingReason: null };
}

function numericCondition(actual: string | null, predicate: (value: string) => boolean): ConditionState {
  return actual === null || !DECIMAL.test(actual) ? "pending" : predicate(actual) ? "met" : "not_met";
}

function numericMissingReason(actual: string | null): string | null {
  return actual === null || !DECIMAL.test(actual) ? "MISSING_VALUE" : null;
}

function integerCondition(actual: number, predicate: (value: number) => boolean): ConditionState {
  return !Number.isSafeInteger(actual) ? "pending" : predicate(actual) ? "met" : "not_met";
}

function integerActual(actual: number): string | null {
  return Number.isSafeInteger(actual) ? String(actual) : null;
}

function integerMissingReason(actual: number): string | null {
  return Number.isSafeInteger(actual) ? null : "MISSING_VALUE";
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

function check(code: CanonicalCheckCode, state: ConditionState, actual: string | null, dataDate: string | null, sourceId: string | null, missingReason: string | null): AssessmentCheck {
  const rule = CB_RESEARCH_RULES.checks[code];
  return { code, label: rule.label, state, actual, threshold: rule.threshold, dataDate, sourceId, missingReason };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

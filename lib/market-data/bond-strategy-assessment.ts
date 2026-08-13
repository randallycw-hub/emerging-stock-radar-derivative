import type {
  AssessmentCheck,
  BondAssessment,
  BondMarketHistoryPoint,
  BondMarketView,
  ConditionState,
  DimensionState,
} from "./types.ts";

type AssessmentInput = {
  view: BondMarketView;
  history: readonly BondMarketHistoryPoint[];
  spreadPercent: string | null;
  spreadDataDate: string | null;
  borrowability: "available" | "unavailable" | "unknown";
  conversionSuspended: boolean | null;
  publicFinancials: {
    ttmProfitState: "profitable" | "loss" | "unknown";
    revenueTrendState: "up" | "down" | "unknown";
    psPercentile: string | null;
    dataDate: string | null;
  };
};

const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const NON_NEGATIVE_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function evaluateBondAssessment(input: AssessmentInput): BondAssessment {
  const valuationDateMismatch = input.view.dataQuality === "date_mismatch"
    || input.view.valuationDate === null
    || input.view.cbPriceDate === null
    || input.view.valuationDate !== input.view.cbPriceDate;
  const price = numericCheck("cb_price", "CB 盤後價格", input.view.cbClose, "<=115", input.view.cbPriceDate, "approved_cb_market", (value) => value <= 115);
  const days = integerCheck("days_to_maturity", "剩餘天數", input.view.daysToMaturity, ">=365", input.view.valuationDate, "approved_cb_terms", (value) => value >= 365);
  const premium = valuationDateMismatch
    ? pendingCheck("premium_rate", "轉換溢價率", input.view.premiumRate, "<=10%", input.view.valuationDate, "derived_market_view", "DATE_MISMATCH")
    : numericCheck("premium_rate", "轉換溢價率", input.view.premiumRate, "<=10%", input.view.valuationDate, "derived_market_view", (value) => value <= 10);
  const remaining = numericCheck("remaining_ratio", "轉換剩餘比例", input.view.remainingRatio, ">=70%", input.view.outstandingDataDate, "approved_cb_outstanding", (value) => value >= 70);
  const spread = input.spreadPercent === null
    ? pendingCheck("spread_percent", "盤後價差", null, "<0.9%", input.spreadDataDate, "approved_post_trade_spread", "MISSING_SPREAD")
    : numericCheck("spread_percent", "盤後價差", input.spreadPercent, "<0.9%", input.spreadDataDate, "approved_post_trade_spread", (value) => value < 0.9);

  const liquidityChecks = buildLiquidityChecks(input);
  const conversionValue = valuationDateMismatch
    ? pendingCheck("conversion_value", "轉換價值", input.view.conversionValue, "70-120", input.view.valuationDate, "derived_market_view", "DATE_MISMATCH")
    : numericCheck("conversion_value", "轉換價值", input.view.conversionValue, "70-120", input.view.valuationDate, "derived_market_view", (value) => value >= 70 && value <= 120);
  const stockBondPremium = valuationDateMismatch
    ? pendingCheck("premium_rate", "轉換溢價率", input.view.premiumRate, "<30%", input.view.valuationDate, "derived_market_view", "DATE_MISMATCH")
    : numericCheck("premium_rate", "轉換溢價率", input.view.premiumRate, "<30%", input.view.valuationDate, "derived_market_view", (value) => value < 30);
  const stockBondDays = integerCheck("days_to_maturity", "剩餘天數", input.view.daysToMaturity, ">=365", input.view.valuationDate, "approved_cb_terms", (value) => value >= 365);

  const putDate = input.view.nextPutDate === null
    ? pendingCheck("public_put_date", "公開賣回日", null, "存在公開賣回日", null, "approved_cb_terms", "MISSING_PUT_DATE")
    : metCheck("public_put_date", "公開賣回日", input.view.nextPutDate, "存在公開賣回日", input.view.nextPutDate, "approved_cb_terms");
  const putPrice = numericCheck("cb_price", "基準價格", input.view.cbClose, "<100", input.view.cbPriceDate, "approved_cb_market", (value) => value < 100);
  const credit = pendingCheck("public_credit_rating", "公開信用評等／TCRI", null, "已取得可驗證公開資料", null, null, "UNAVAILABLE_PUBLIC_SOURCE");

  const equityPremium = valuationDateMismatch
    ? pendingCheck("premium_rate", "轉換溢價率", input.view.premiumRate, ">30%", input.view.valuationDate, "derived_market_view", "DATE_MISMATCH")
    : numericCheck("premium_rate", "轉換溢價率", input.view.premiumRate, ">30%", input.view.valuationDate, "derived_market_view", (value) => value > 30);
  const financialDateMismatch = input.publicFinancials.dataDate !== null
    && input.view.valuationDate !== null
    && input.publicFinancials.dataDate !== input.view.valuationDate;
  const ttmProfit = financialStateCheck("ttm_profit", "TTM 獲利", input.publicFinancials.ttmProfitState, "獲利", input.publicFinancials.dataDate, financialDateMismatch);
  const revenueTrend = financialStateCheck("revenue_trend", "營收趨勢", input.publicFinancials.revenueTrendState, "上升", input.publicFinancials.dataDate, financialDateMismatch);
  const psPercentile = financialDateMismatch
    ? pendingCheck("ps_percentile", "PS 百分位", input.publicFinancials.psPercentile, "可驗證公開 PS 百分位", input.publicFinancials.dataDate, "approved_public_financials", "DATE_MISMATCH")
    : input.publicFinancials.psPercentile === null
      ? pendingCheck("ps_percentile", "PS 百分位", null, "可驗證公開 PS 百分位", input.publicFinancials.dataDate, "approved_public_financials", "MISSING_PS_PERCENTILE")
      : metCheck("ps_percentile", "PS 百分位", input.publicFinancials.psPercentile, "可驗證公開 PS 百分位", input.publicFinancials.dataDate, "approved_public_financials");

  const equivalentPremium = valuationDateMismatch
    ? pendingCheck("premium_rate", "轉換溢價率", input.view.premiumRate, "<2%", input.view.valuationDate, "derived_market_view", "DATE_MISMATCH")
    : numericCheck("premium_rate", "轉換溢價率", input.view.premiumRate, "<2%", input.view.valuationDate, "derived_market_view", (value) => value < 2);
  const equivalentSpread = sameDateCheck(input.spreadDataDate, input.view.valuationDate)
    ? input.spreadPercent === null
      ? pendingCheck("spread_percent", "盤後價差", null, "<2%", input.spreadDataDate, "approved_post_trade_spread", "MISSING_SPREAD")
      : numericCheck("spread_percent", "盤後價差", input.spreadPercent, "<2%", input.spreadDataDate, "approved_post_trade_spread", (value) => value < 2)
    : pendingCheck("spread_percent", "盤後價差", input.spreadPercent, "<2%", input.spreadDataDate, "approved_post_trade_spread", "DATE_MISMATCH");

  const discount = valuationDateMismatch
    ? pendingCheck("premium_rate", "轉換溢價率", input.view.premiumRate, "<0%", input.view.valuationDate, "derived_market_view", "DATE_MISMATCH")
    : numericCheck("premium_rate", "轉換溢價率", input.view.premiumRate, "<0%", input.view.valuationDate, "derived_market_view", (value) => value < 0);
  const borrowability = input.borrowability === "unknown"
    ? pendingCheck("borrowability", "融券可用性", null, "可融券", input.view.cbPriceDate, "approved_borrowability", "UNKNOWN_BORROWABILITY")
    : input.borrowability === "available"
      ? metCheck("borrowability", "融券可用性", "available", "可融券", input.view.cbPriceDate, "approved_borrowability")
      : notMetCheck("borrowability", "融券可用性", "unavailable", "可融券", input.view.cbPriceDate, "approved_borrowability");
  const suspension = input.conversionSuspended === null
    ? pendingCheck("conversion_suspended", "停止轉換狀態", null, "未停止轉換", input.view.cbPriceDate, "approved_conversion_events", "UNKNOWN_CONVERSION_STATUS")
    : input.conversionSuspended
      ? notMetCheck("conversion_suspended", "停止轉換狀態", "suspended", "未停止轉換", input.view.cbPriceDate, "approved_conversion_events")
      : metCheck("conversion_suspended", "停止轉換狀態", "active", "未停止轉換", input.view.cbPriceDate, "approved_conversion_events");
  const arbitrageCost = sameDateCheck(input.spreadDataDate, input.view.valuationDate)
    ? input.spreadPercent === null
      ? pendingCheck("spread_percent", "交易成本（盤後價差）", null, "可驗證", input.spreadDataDate, "approved_post_trade_spread", "MISSING_SPREAD")
      : metCheck("spread_percent", "交易成本（盤後價差）", input.spreadPercent, "可驗證", input.spreadDataDate, "approved_post_trade_spread")
    : pendingCheck("spread_percent", "交易成本（盤後價差）", input.spreadPercent, "可驗證", input.spreadDataDate, "approved_post_trade_spread", "DATE_MISMATCH");

  const volatility = pendingCheck("public_volatility", "公開波動度", null, ">25%", null, null, "MISSING_VOLATILITY");
  const hedgeDays = integerCheck("days_to_maturity", "剩餘天數", input.view.daysToMaturity, ">=365", input.view.valuationDate, "approved_cb_terms", (value) => value >= 365);
  const hedgePremium = equivalentPremium;

  return deepFreeze({
    dimensions: [
      { code: "price", state: dimensionState(input.view.cbClose, (value) => value <= 115, (value) => value <= 130), checks: [price] },
      { code: "days", state: dimensionIntegerState(input.view.daysToMaturity, (value) => value >= 365, (value) => value >= 180), checks: [days] },
      { code: "premium", state: valuationDateMismatch ? "pending" : dimensionState(input.view.premiumRate, (value) => value <= 10, (value) => value <= 30), checks: [premium] },
      { code: "remaining", state: dimensionState(input.view.remainingRatio, (value) => value >= 70, (value) => value > 10), checks: [remaining] },
      { code: "spread", state: input.spreadPercent === null ? "pending" : dimensionState(input.spreadPercent, (value) => value < 0.9, (value) => value <= 2), checks: [spread] },
      { code: "liquidity", state: liquidityState(liquidityChecks), checks: liquidityChecks },
    ],
    strategies: [
      { code: "stock_bond_relative", state: aggregate([conversionValue, stockBondPremium, stockBondDays]), checks: [conversionValue, stockBondPremium, stockBondDays] },
      { code: "maturity_put", state: aggregate([putDate, putPrice, credit]), checks: [putDate, putPrice, credit] },
      { code: "equity_relative", state: aggregate([equityPremium, ttmProfit, revenueTrend, psPercentile]), checks: [equityPremium, ttmProfit, revenueTrend, psPercentile] },
      { code: "stock_equivalent", state: aggregate([equivalentPremium, equivalentSpread]), checks: [equivalentPremium, equivalentSpread] },
      { code: "arbitrage", state: aggregate([discount, borrowability, suspension, arbitrageCost]), checks: [discount, borrowability, suspension, arbitrageCost] },
      { code: "dynamic_hedge", state: aggregate([volatility, hedgeDays, hedgePremium, borrowability, suspension]), checks: [volatility, hedgeDays, hedgePremium, borrowability, suspension] },
    ],
  });
}

function buildLiquidityChecks(input: AssessmentInput): AssessmentCheck[] {
  const daily = numericCheck("daily_trade_units", "當日成交張數", input.view.cbTradeUnits, ">=50 張", input.view.cbPriceDate, "approved_cb_market", (value) => value >= 50);
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
  if (history.length < days) return pendingCheck(code, label, null, `${days} 日均量：<10 風險、10-49 需留意、>=50 條件良好`, null, "approved_cb_history", "INSUFFICIENT_HISTORY");
  if (priceDate === null || history[0].date !== priceDate) return pendingCheck(code, label, null, `${days} 日均量：<10 風險、10-49 需留意、>=50 條件良好`, history[0].date, "approved_cb_history", "DATE_MISMATCH");
  const average = history.slice(0, days).reduce((sum, item) => sum + Number(item.units), 0) / days;
  return average >= 50
    ? metCheck(code, label, String(average), ">=50 張", priceDate, "approved_cb_history")
    : notMetCheck(code, label, String(average), ">=50 張", priceDate, "approved_cb_history");
}

function liquidityState(checks: readonly AssessmentCheck[]): DimensionState {
  if (checks.some((check) => check.state === "pending")) return "pending";
  const average5 = checks.find((check) => check.code === "average_5d_units");
  if (average5?.actual === null) return "pending";
  if (average5 === undefined) return "pending";
  const value = Number(average5.actual);
  return value < 10 ? "risk" : value < 50 ? "watch" : "favorable";
}

function financialStateCheck(code: string, label: string, value: "profitable" | "loss" | "up" | "down" | "unknown", threshold: string, dataDate: string | null, dateMismatch: boolean): AssessmentCheck {
  if (dateMismatch) return pendingCheck(code, label, value === "unknown" ? null : value, threshold, dataDate, "approved_public_financials", "DATE_MISMATCH");
  if (value === "unknown") return pendingCheck(code, label, null, threshold, dataDate, "approved_public_financials", `MISSING_${code.toUpperCase()}`);
  return value === "profitable" || value === "up"
    ? metCheck(code, label, value, threshold, dataDate, "approved_public_financials")
    : notMetCheck(code, label, value, threshold, dataDate, "approved_public_financials");
}

function numericCheck(code: string, label: string, actual: string | null, threshold: string, dataDate: string | null, sourceId: string, predicate: (value: number) => boolean): AssessmentCheck {
  if (actual === null || !DECIMAL.test(actual)) return pendingCheck(code, label, actual, threshold, dataDate, sourceId, "MISSING_VALUE");
  return predicate(Number(actual)) ? metCheck(code, label, actual, threshold, dataDate, sourceId) : notMetCheck(code, label, actual, threshold, dataDate, sourceId);
}

function integerCheck(code: string, label: string, actual: number, threshold: string, dataDate: string | null, sourceId: string, predicate: (value: number) => boolean): AssessmentCheck {
  return Number.isSafeInteger(actual)
    ? predicate(actual) ? metCheck(code, label, String(actual), threshold, dataDate, sourceId) : notMetCheck(code, label, String(actual), threshold, dataDate, sourceId)
    : pendingCheck(code, label, null, threshold, dataDate, sourceId, "MISSING_VALUE");
}

function dimensionState(actual: string | null, favorable: (value: number) => boolean, watch: (value: number) => boolean): DimensionState {
  if (actual === null || !DECIMAL.test(actual)) return "pending";
  return favorable(Number(actual)) ? "favorable" : watch(Number(actual)) ? "watch" : "risk";
}

function dimensionIntegerState(actual: number, favorable: (value: number) => boolean, watch: (value: number) => boolean): DimensionState {
  if (!Number.isSafeInteger(actual)) return "pending";
  return favorable(actual) ? "favorable" : watch(actual) ? "watch" : "risk";
}

function sameDateCheck(left: string | null, right: string | null): boolean {
  return left !== null && right !== null && left === right;
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

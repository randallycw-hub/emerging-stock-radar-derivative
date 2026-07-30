import type { EmergingMarketView } from "../domain/types.ts";
import type { EmergingMarketSourceRow } from "../source-verification/source-emerging-market.ts";
import { divideDecimal, multiplyDecimal, subtractDecimal } from "./decimal.ts";

export type { EmergingMarketView } from "../domain/types.ts";

type EmergingCompanyRow = {
  companyCode: string;
  companyName: string;
  industryName: string;
};

export function buildEmergingMarketViews(input: {
  marketRows: readonly EmergingMarketSourceRow[];
  companyRows: readonly EmergingCompanyRow[];
}): EmergingMarketView[] {
  const industries = new Map(
    input.companyRows.map((company) => [company.companyCode, company.industryName]),
  );

  return input.marketRows.map((row) => buildView(row, industries)).sort(compareViews);
}

function buildView(
  row: EmergingMarketSourceRow,
  industries: ReadonlyMap<string, string>,
): EmergingMarketView {
  const dailyAveragePrice = row.dailyAveragePrice === null
    ? null
    : decimalInput(row.dailyAveragePrice);
  const previousAveragePrice = row.previousAveragePrice === null
    ? null
    : decimalInput(row.previousAveragePrice);
  const transactionVolume = row.transactionVolume === null
    ? null
    : decimalInput(row.transactionVolume);
  const averageChange = dailyAveragePrice !== null && previousAveragePrice !== null
    ? subtractDecimal(
      dailyAveragePrice,
      previousAveragePrice,
      decimalScale(dailyAveragePrice, previousAveragePrice),
    )
    : null;
  const averageChangePercent = averageChange !== null
    && previousAveragePrice !== null
    && !isZeroDecimal(previousAveragePrice)
    ? multiplyDecimal(
      divideDecimal(averageChange, previousAveragePrice, 8),
      "100",
      2,
    )
    : null;
  const estimatedTransactionAmount = dailyAveragePrice !== null
    && transactionVolume !== null
    ? multiplyDecimal(
      dailyAveragePrice,
      transactionVolume,
      decimalScale(dailyAveragePrice, transactionVolume),
    )
    : null;

  return {
    tradingDate: row.tradingDate,
    companyCode: row.companyCode,
    companyName: row.companyName,
    industryName: industries.get(row.companyCode) ?? null,
    dailyAveragePrice: row.dailyAveragePrice,
    previousAveragePrice: row.previousAveragePrice,
    dailyHighPrice: row.dailyHighPrice,
    dailyLowPrice: row.dailyLowPrice,
    averageChange,
    averageChangePercent,
    direction: directionFor(averageChange),
    transactionVolume: row.transactionVolume,
    estimatedTransactionAmount,
    applyingDate: row.applyingDate,
    applyingStatus: row.applyingStatus,
  };
}

function decimalInput(value: string): string {
  return value.replaceAll(",", "");
}

function decimalScale(...values: string[]): number {
  return values.reduce((maximum, value) => {
    const fraction = value.split(".")[1] ?? "";
    return Math.max(maximum, fraction.length);
  }, 0);
}

function isZeroDecimal(value: string): boolean {
  return /^0(?:\.0+)?$/.test(value);
}

function directionFor(change: string | null): EmergingMarketView["direction"] {
  if (change === null) return "unavailable";
  if (change.startsWith("-")) return "down";
  return change === "0" ? "flat" : "up";
}

function compareViews(left: EmergingMarketView, right: EmergingMarketView): number {
  const companyOrder = left.companyCode.localeCompare(right.companyCode);
  return companyOrder !== 0 ? companyOrder : left.tradingDate.localeCompare(right.tradingDate);
}

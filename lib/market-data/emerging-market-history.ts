import { divideDecimal, multiplyDecimal, subtractDecimal } from "./decimal.ts";
import { isIsoDate } from "../domain/dates.ts";

type EmergingAverageRecord = Readonly<{
  tradingDate: string;
  dailyAveragePrice: string | null;
  transactionVolume: string | null;
}>;

export function buildEmergingWeeklyMetrics(
  records: readonly EmergingAverageRecord[],
  asOfDate: string,
): Readonly<{
  lastWeekAverage: string | null;
  weeklyChange: string | null;
  weeklyChangePercent: string | null;
}> {
  if (!isIsoDate(asOfDate)) throw new TypeError("asOfDate must be an ISO date");
  const dates = new Set<string>();
  for (const record of records) {
    if (!isIsoDate(record.tradingDate) || dates.has(record.tradingDate)) {
      throw new TypeError("records must have unique ISO trading dates");
    }
    dates.add(record.tradingDate);
    if (record.dailyAveragePrice !== null && !isDecimal(record.dailyAveragePrice)) {
      throw new TypeError("dailyAveragePrice must be a non-negative decimal or null");
    }
  }

  const current = records.find((record) => record.tradingDate === asOfDate)?.dailyAveragePrice ?? null;
  const { start, end } = previousCalendarWeek(asOfDate);
  const baseline = records
    .filter((record) => record.tradingDate >= start && record.tradingDate <= end && record.dailyAveragePrice !== null)
    .sort((left, right) => right.tradingDate.localeCompare(left.tradingDate))[0]
    ?.dailyAveragePrice ?? null;

  if (current === null || baseline === null || isZero(baseline)) {
    return Object.freeze({ lastWeekAverage: baseline, weeklyChange: null, weeklyChangePercent: null });
  }
  const weeklyChange = subtractDecimal(current, baseline, decimalScale(current, baseline));
  const weeklyChangePercent = multiplyDecimal(divideDecimal(weeklyChange, baseline, 8), "100", 2);
  return Object.freeze({ lastWeekAverage: baseline, weeklyChange, weeklyChangePercent });
}

function previousCalendarWeek(asOfDate: string): { start: string; end: string } {
  const [year, month, day] = asOfDate.split("-").map(Number);
  const asOf = new Date(Date.UTC(year, month - 1, day));
  const weekday = asOf.getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const currentWeekMonday = new Date(asOf.getTime() - daysSinceMonday * 86_400_000);
  const priorWeekMonday = new Date(currentWeekMonday.getTime() - 7 * 86_400_000);
  const priorWeekSunday = new Date(currentWeekMonday.getTime() - 86_400_000);
  return { start: toIsoDate(priorWeekMonday), end: toIsoDate(priorWeekSunday) };
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isDecimal(value: string): boolean {
  return /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
}

function isZero(value: string): boolean {
  return /^0(?:\.0+)?$/.test(value);
}

function decimalScale(...values: string[]): number {
  return Math.max(...values.map((value) => value.split(".")[1]?.length ?? 0));
}

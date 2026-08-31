import { isIsoDate } from "../domain/dates.ts";

export type V56PerformancePeriod = "1D" | "1W" | "1M" | "3M" | "6M" | "YTD";

export type V56PricePoint = Readonly<{
  tradeDate: string;
  close: number | null;
}>;

const PERIOD_SESSION_OFFSET: Readonly<Record<Exclude<V56PerformancePeriod, "YTD">, number>> = Object.freeze({
  "1D": 1,
  "1W": 5,
  "1M": 20,
  "3M": 60,
  "6M": 120,
});

function validClosingSessions(points: readonly V56PricePoint[]): readonly V56PricePoint[] {
  const uniqueDates = new Set<string>();
  const valid: V56PricePoint[] = [];

  for (const point of points) {
    if (!isIsoDate(point.tradeDate) || uniqueDates.has(point.tradeDate)) continue;
    uniqueDates.add(point.tradeDate);
    if (typeof point.close !== "number" || !Number.isFinite(point.close)) continue;
    valid.push(Object.freeze({ tradeDate: point.tradeDate, close: point.close }));
  }

  return Object.freeze(valid.sort((left, right) => left.tradeDate.localeCompare(right.tradeDate)));
}

/**
 * Finds the baseline by actual trading sessions, never by calendar days.
 * A missing or invalid close is not silently converted to zero.
 */
export function selectValidPeriodBaseline(
  points: readonly V56PricePoint[],
  period: V56PerformancePeriod,
): V56PricePoint | null {
  const sessions = validClosingSessions(points);
  const latest = sessions.at(-1);
  if (latest === undefined) return null;

  if (period === "YTD") {
    const year = latest.tradeDate.slice(0, 4);
    return sessions.find((session) => session.tradeDate.startsWith(`${year}-`)) ?? null;
  }

  const offset = PERIOD_SESSION_OFFSET[period];
  return sessions.at(-1 - offset) ?? null;
}

export function calculatePeriodReturn(
  points: readonly V56PricePoint[],
  period: V56PerformancePeriod,
): number | null {
  const sessions = validClosingSessions(points);
  const latest = sessions.at(-1);
  const baseline = selectValidPeriodBaseline(sessions, period);

  if (latest === undefined || baseline === null || latest.close === null || baseline.close === null || baseline.close === 0) {
    return null;
  }

  return Number((latest.close / baseline.close - 1).toFixed(8));
}
